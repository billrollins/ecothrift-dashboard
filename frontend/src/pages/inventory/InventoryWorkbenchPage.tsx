import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import {
  Box,
  Button,
  Paper,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  getItemCheckIns,
  getItems,
  getProduct,
  getProducts,
} from '../../api/inventory.api';
import type { Item } from '../../types/inventory.types';
import {
  checkInFiltersToApiParams,
  checkInRichSearch,
  formatRichSearch,
  itemFiltersToApiParams,
  itemRichSearch,
  parseRichSearch,
  parseWorkbenchSelection,
  productFiltersToApiParams,
  type WorkbenchSelection,
  type WorkbenchTab,
} from '../../utils/richInventorySearch';
import { productSearchParams } from '../../utils/productCatalog';
import { SEARCH_HISTORY_KEYS } from '../../utils/searchHistory';
import { ProcessingScanBar } from './processing/ProcessingScanBar';
import { CatalogFilterRow } from './manage/CatalogFilterRow';
import { CatalogTableColumnResetButton } from './manage/catalogTableColumnControls';
import { ProductCatalogTable } from './manage/ProductCatalogTable';
import { ItemCatalogTable } from './manage/ItemCatalogTable';
import { ItemCheckInCatalogTable } from './manage/ItemCheckInCatalogTable';
import { ProductManagePanel } from './manage/ProductManageDrawer';
import { ItemCheckInManagePanel } from './workbench/ItemCheckInManagePanel';
import { ItemManagePanel } from './workbench/ItemManagePanel';
import { processingTokens } from './processing/processingTokens';

const PAGE_SIZE = 200;

function parseTab(raw: string | null): WorkbenchTab {
  if (raw === 'checkins' || raw === 'items') return raw;
  return 'products';
}

function looksLikeSku(text: string): boolean {
  const t = text.trim();
  return /^ITM/i.test(t) || /^[A-Z0-9-]{6,}$/i.test(t);
}

function richEntityForTab(tab: WorkbenchTab): 'products' | 'checkins' | 'items' {
  if (tab === 'products') return 'products';
  if (tab === 'checkins') return 'checkins';
  return 'items';
}

function selectionMatchesTab(sel: WorkbenchSelection, tab: WorkbenchTab): boolean {
  if (tab === 'products') return sel.type === 'product';
  if (tab === 'checkins') return sel.type === 'checkin';
  return sel.type === 'item';
}

function selectionInTabResults(
  sel: WorkbenchSelection,
  tab: WorkbenchTab,
  products: { id: number; title?: string; product_number?: string | null }[],
  checkIns: { id: number }[],
  items: { id: number; sku?: string }[],
): boolean {
  if (sel.type === 'product') return products.some((row) => row.id === sel.id);
  if (sel.type === 'checkin') return checkIns.some((row) => row.id === sel.id);
  return items.some((row) => row.id === sel.id);
}

function firstRowSelection(
  tab: WorkbenchTab,
  products: { id: number; title?: string; product_number?: string | null }[],
  checkIns: { id: number }[],
  items: { id: number; sku?: string }[],
): WorkbenchSelection | null {
  if (tab === 'products') {
    const row = products[0];
    return row ?
        { type: 'product', id: row.id, label: row.title || row.product_number || `#${row.id}` }
      : null;
  }
  if (tab === 'checkins') {
    const row = checkIns[0];
    return row ? { type: 'checkin', id: row.id, label: `Check-in #${row.id}` } : null;
  }
  const row = items[0];
  return row ? { type: 'item', id: row.id, label: row.sku || String(row.id) } : null;
}

function resolveTabSelection(
  tab: WorkbenchTab,
  opts: {
    selected: WorkbenchSelection | null;
    remembered: WorkbenchSelection | undefined;
    products: { id: number; title?: string; product_number?: string | null }[];
    checkIns: { id: number }[];
    items: { id: number; sku?: string }[];
    draftCheckIn: boolean;
  },
): WorkbenchSelection | null {
  if (opts.draftCheckIn && tab === 'checkins') return null;

  const inResults = (sel: WorkbenchSelection) =>
    selectionInTabResults(sel, tab, opts.products, opts.checkIns, opts.items);

  const candidates: WorkbenchSelection[] = [];
  if (opts.selected && selectionMatchesTab(opts.selected, tab)) candidates.push(opts.selected);
  if (opts.remembered && selectionMatchesTab(opts.remembered, tab)) candidates.push(opts.remembered);

  for (const candidate of candidates) {
    if (inResults(candidate)) return candidate;
  }

  return firstRowSelection(tab, opts.products, opts.checkIns, opts.items);
}

export default function InventoryWorkbenchPage() {
  const theme = useTheme();
  const isStacked = useMediaQuery(theme.breakpoints.down('lg'));
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = parseTab(searchParams.get('tab'));
  const urlSearch = searchParams.get('q') || '';
  const urlSelected = parseWorkbenchSelection(searchParams.get('selected'));
  const urlDraftCheckIn = searchParams.get('draft') === 'checkin';

  const [search, setSearch] = useState(urlSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearch);
  const [selected, setSelected] = useState<WorkbenchSelection | null>(urlSelected);
  const [draftCheckIn, setDraftCheckIn] = useState(urlDraftCheckIn);
  const [draftCheckInProductId, setDraftCheckInProductId] = useState<number | null>(null);
  const productAutoSelectRef = useRef<string | null>(null);
  const tableAutoSelectRef = useRef<string | null>(null);
  /** Target tab during programmatic navigation — avoids products auto-select racing before URL updates. */
  const pendingNavigationTabRef = useRef<WorkbenchTab | null>(null);
  const tabSelectionMemory = useRef<Partial<Record<WorkbenchTab, WorkbenchSelection>>>({});

  function tableAutoSelectKey(tab: WorkbenchTab, q: string): string {
    return `${tab}:${q.trim()}`;
  }

  useEffect(() => {
    setSearch(urlSearch);
    setDebouncedSearch(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    if (pendingNavigationTabRef.current === activeTab) {
      pendingNavigationTabRef.current = null;
    }
  }, [activeTab]);

  useEffect(() => {
    if (pendingNavigationTabRef.current) return;
    setSelected(urlSelected);
  }, [urlSelected?.type, urlSelected?.id]);

  useEffect(() => {
    setDraftCheckIn(urlDraftCheckIn);
  }, [urlDraftCheckIn]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 450);
    return () => window.clearTimeout(t);
  }, [search]);

  const syncUrl = useCallback((
    opts: {
      tab?: WorkbenchTab;
      q?: string;
      selected?: WorkbenchSelection | null;
      draft?: 'checkin' | null | false;
    },
  ) => {
    const next = new URLSearchParams();
    const tab = opts.tab ?? activeTab;
    const q = opts.q ?? debouncedSearch.trim();
    const sel = opts.selected !== undefined ? opts.selected : selected;
    const draft =
      opts.draft === false ? null
      : opts.draft !== undefined ? opts.draft
        : draftCheckIn ? 'checkin' : null;
    if (tab !== 'products') next.set('tab', tab);
    if (q) next.set('q', q);
    if (sel) next.set('selected', `${sel.type}:${sel.id}`);
    if (draft === 'checkin') next.set('draft', 'checkin');
    setSearchParams(next, { replace: true });
  }, [activeTab, debouncedSearch, selected, draftCheckIn, setSearchParams]);

  const commitSearch = useCallback((raw?: string) => {
    const q = (raw ?? search).trim();
    setSearch(q);
    setDebouncedSearch(q);
    if (!q) {
      setDraftCheckIn(false);
      syncUrl({ q: '', draft: null });
      return;
    }

    let tab = activeTab;
    if (looksLikeSku(q)) tab = 'items';
    setDraftCheckIn(false);

    if (tab === 'products') {
      const parsed = parseRichSearch(q, 'products');
      const productFilter = parsed.filters.product;
      if (productFilter) {
        const id = Number(productFilter);
        if (Number.isFinite(id)) {
          const sel: WorkbenchSelection = { type: 'product', id, label: `Product #${id}` };
          setSelected(sel);
          syncUrl({ q, tab, selected: sel, draft: null });
          return;
        }
      }
    }

    syncUrl({ q, tab, draft: null });
  }, [search, activeTab, syncUrl]);

  const handleSearchEnter = useCallback(() => {
    commitSearch();
  }, [commitSearch]);

  const querySearch = debouncedSearch.trim();
  const parsedProducts = useMemo(() => parseRichSearch(querySearch, 'products'), [querySearch]);
  const parsedCheckIns = useMemo(() => parseRichSearch(querySearch, 'checkins'), [querySearch]);
  const parsedItems = useMemo(() => parseRichSearch(querySearch, 'items'), [querySearch]);

  const productsQuery = useQuery({
    queryKey: ['products', 'workbench', querySearch],
    queryFn: async () => {
      const params = productFiltersToApiParams(parsedProducts);
      const { data } = await getProducts({
        ...productSearchParams(params.search ?? '', PAGE_SIZE),
        ...params,
      });
      return data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const checkInsQuery = useQuery({
    queryKey: ['item-check-ins', 'workbench', querySearch],
    queryFn: async () => {
      const { data } = await getItemCheckIns({
        ...checkInFiltersToApiParams(parsedCheckIns),
        page_size: PAGE_SIZE,
      });
      return data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const itemsQuery = useQuery({
    queryKey: ['items', 'workbench', querySearch],
    queryFn: async () => {
      const { data } = await getItems({
        ...itemFiltersToApiParams(parsedItems),
        ordering: '-checked_in_at,-id',
        page_size: PAGE_SIZE,
      });
      return data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const products = productsQuery.data?.results ?? [];
  const checkIns = checkInsQuery.data?.results ?? [];
  const items = itemsQuery.data?.results ?? [];

  const productCount = productsQuery.data?.count ?? products.length;
  const checkInCount = checkInsQuery.data?.count ?? checkIns.length;
  const itemCount = itemsQuery.data?.count ?? items.length;
  const selectedProductId = selected?.type === 'product' ? selected.id : null;

  const productEditorQuery = useQuery({
    queryKey: ['products', 'workbench-editor', selectedProductId],
    queryFn: async () => (await getProduct(selectedProductId!)).data,
    enabled: activeTab === 'products' && selectedProductId != null,
    staleTime: 30_000,
  });
  const productEditorInitialProduct =
    selectedProductId == null ? null
    : productEditorQuery.data ?? products.find((p) => p.id === selectedProductId) ?? null;

  const isFetching =
    (activeTab === 'products' && productsQuery.isFetching)
    || (activeTab === 'checkins' && checkInsQuery.isFetching)
    || (activeTab === 'items' && itemsQuery.isFetching);

  const selectRecord = useCallback((
    sel: WorkbenchSelection,
    opts?: { tab?: WorkbenchTab },
  ) => {
    const tab = opts?.tab ?? activeTab;
    tabSelectionMemory.current[tab] = sel;
    setDraftCheckIn(false);
    setSelected(sel);
    syncUrl({ selected: sel, tab, draft: null });
  }, [activeTab, syncUrl]);

  const navigateRelated = useCallback((sel: WorkbenchSelection) => {
    const tab: WorkbenchTab =
      sel.type === 'product' ? 'products' : sel.type === 'checkin' ? 'checkins' : 'items';
    selectRecord(sel, { tab });
  }, [selectRecord]);

  const openProductTab = useCallback((productId: number, label?: string) => {
    const q = formatRichSearch({ filters: { product: productId }, entity: 'products' });
    setSearch(q);
    setDebouncedSearch(q);
    productAutoSelectRef.current = null;
    const sel: WorkbenchSelection = {
      type: 'product',
      id: productId,
      label: label || `Product #${productId}`,
    };
    setSelected(sel);
    syncUrl({ tab: 'products', q, selected: sel });
  }, [syncUrl]);

  const selectItemFromTable = useCallback((it: Item) => {
    const sel: WorkbenchSelection = { type: 'item', id: it.id, label: it.sku || String(it.id) };
    let q = querySearch;
    if (it.product) {
      const parsed = parseRichSearch(querySearch, 'items');
      q = formatRichSearch({
        text: parsed.text,
        filters: { ...parsed.filters, product: it.product },
        entity: 'items',
      });
      setSearch(q);
      setDebouncedSearch(q);
    }
    setSelected(sel);
    syncUrl({ tab: 'items', q, selected: sel });
  }, [querySearch, syncUrl]);

  const applyProductSearch = useCallback((productId: number) => {
    const q = formatRichSearch({
      filters: { product: productId },
      entity: richEntityForTab(activeTab),
    });
    setSearch(q);
    setDebouncedSearch(q);
    setDraftCheckIn(false);

    if (activeTab === 'products') {
      const sel: WorkbenchSelection = {
        type: 'product',
        id: productId,
        label: `Product #${productId}`,
      };
      setSelected(sel);
      syncUrl({ q, selected: sel, tab: 'products', draft: null });
      return;
    }

    tableAutoSelectRef.current = null;
    setSelected(null);
    syncUrl({ q, selected: null, draft: null });
  }, [activeTab, syncUrl]);

  const navigateWorkbenchTab = useCallback((opts: {
    tab: WorkbenchTab;
    q: string;
    selected?: WorkbenchSelection | null;
    draft?: 'checkin' | null;
  }) => {
    pendingNavigationTabRef.current = opts.tab;
    if ((opts.tab === 'items' || opts.tab === 'checkins') && !opts.selected) {
      tableAutoSelectRef.current = null;
    }
    setSearch(opts.q);
    setDebouncedSearch(opts.q);
    setSelected(opts.selected ?? null);
    setDraftCheckIn(opts.draft === 'checkin');
    syncUrl({
      tab: opts.tab,
      q: opts.q,
      selected: opts.selected ?? null,
      draft: opts.draft ?? null,
    });
  }, [syncUrl]);

  const openProductCheckInsTab = useCallback((productId: number) => {
    if (selected?.type === 'product' && selected.id === productId) {
      tabSelectionMemory.current.products = selected;
    }
    const q = checkInRichSearch({ product: productId });
    tableAutoSelectRef.current = null;
    navigateWorkbenchTab({
      tab: 'checkins',
      q,
      selected: null,
    });
  }, [navigateWorkbenchTab, selected]);

  const filterCheckInsByProduct = useCallback((productId: number, keepCheckInId?: number) => {
    const q = checkInRichSearch({ product: productId });
    if (keepCheckInId) {
      const sel: WorkbenchSelection = {
        type: 'checkin',
        id: keepCheckInId,
        label: `Check-in #${keepCheckInId}`,
      };
      setSearch(q);
      setDebouncedSearch(q);
      setSelected(sel);
        syncUrl({ tab: 'checkins', q, selected: sel });
      return;
    }
    tableAutoSelectRef.current = null;
    navigateWorkbenchTab({ tab: 'checkins', q, selected: null });
  }, [navigateWorkbenchTab, syncUrl]);

  const filterCheckInsByOrder = useCallback((orderId: number, keepCheckInId?: number) => {
    const q = checkInRichSearch({ order: orderId });
    if (keepCheckInId) {
      const sel: WorkbenchSelection = {
        type: 'checkin',
        id: keepCheckInId,
        label: `Check-in #${keepCheckInId}`,
      };
      setSearch(q);
      setDebouncedSearch(q);
      setSelected(sel);
        syncUrl({ tab: 'checkins', q, selected: sel });
      return;
    }
    tableAutoSelectRef.current = null;
    navigateWorkbenchTab({ tab: 'checkins', q, selected: null });
  }, [navigateWorkbenchTab, syncUrl]);

  const filterItemsInPlace = useCallback((q: string) => {
    const keepItem = selected?.type === 'item' ? selected : null;
    if (keepItem) {
      tabSelectionMemory.current.items = keepItem;
      tableAutoSelectRef.current = tableAutoSelectKey('items', q);
    }
    setSearch(q);
    setDebouncedSearch(q);
    syncUrl({
      tab: 'items',
      q,
      selected: keepItem,
    });
  }, [selected, syncUrl]);

  const filterItemsByProduct = useCallback((productId: number) => {
    filterItemsInPlace(itemRichSearch({ product: productId }));
  }, [filterItemsInPlace]);

  const filterItemsByOrder = useCallback((orderId: number) => {
    filterItemsInPlace(itemRichSearch({ order: orderId }));
  }, [filterItemsInPlace]);

  const filterCheckInsInPlace = useCallback((checkInId: number) => {
    const q = checkInRichSearch({ checkin: checkInId });
    const keepCheckIn: WorkbenchSelection = {
      type: 'checkin',
      id: checkInId,
      label: `Check-in #${checkInId}`,
    };
    tabSelectionMemory.current.checkins = keepCheckIn;
    tableAutoSelectRef.current = tableAutoSelectKey('checkins', q);
    setSearch(q);
    setDebouncedSearch(q);
    setSelected(keepCheckIn);
    syncUrl({ tab: 'checkins', q, selected: keepCheckIn });
  }, [syncUrl]);

  const filterItemBySkuInPlace = useCallback((sku: string, itemId: number) => {
    const q = itemRichSearch({ sku });
    const keepItem: WorkbenchSelection = { type: 'item', id: itemId, label: sku };
    tabSelectionMemory.current.items = keepItem;
    tableAutoSelectRef.current = tableAutoSelectKey('items', q);
    setSearch(q);
    setDebouncedSearch(q);
    setSelected(keepItem);
    syncUrl({ tab: 'items', q, selected: keepItem });
  }, [syncUrl]);

  const openItemsForCheckIn = useCallback((checkInId: number, keepItemId?: number, keepItemLabel?: string) => {
    const q = itemRichSearch({ checkin: checkInId });
    if (keepItemId) {
      const sel: WorkbenchSelection = {
        type: 'item',
        id: keepItemId,
        label: keepItemLabel || `Item #${keepItemId}`,
      };
      tabSelectionMemory.current.items = sel;
      tableAutoSelectRef.current = tableAutoSelectKey('items', q);
      setSearch(q);
      setDebouncedSearch(q);
      setSelected(sel);
        syncUrl({ tab: 'items', q, selected: sel });
      return;
    }
    tableAutoSelectRef.current = null;
    navigateWorkbenchTab({
      tab: 'items',
      q,
      selected: null,
    });
  }, [navigateWorkbenchTab, syncUrl]);

  const openCheckInsForCheckIn = useCallback((checkInId: number) => {
    tableAutoSelectRef.current = null;
    navigateWorkbenchTab({
      tab: 'checkins',
      q: checkInRichSearch({ checkin: checkInId }),
      selected: null,
    });
  }, [navigateWorkbenchTab]);

  const seeAllItemsForProduct = useCallback((productId: number, status?: string) => {
    navigateWorkbenchTab({
      tab: 'items',
      q: itemRichSearch({ product: productId, status }),
      selected: null,
    });
  }, [navigateWorkbenchTab]);

  const startNewCheckIn = useCallback((productId: number) => {
    setSelected(null);
    setDraftCheckIn(true);
    setDraftCheckInProductId(productId);
    syncUrl({ tab: 'checkins', selected: null, draft: 'checkin' });
  }, [syncUrl]);

  const cancelDraftCheckIn = useCallback(() => {
    setDraftCheckIn(false);
    setDraftCheckInProductId(null);
    syncUrl({ draft: null });
  }, [syncUrl]);

  const handleCheckInCreated = useCallback((checkInId: number) => {
    setDraftCheckIn(false);
    setDraftCheckInProductId(null);
    selectRecord({ type: 'checkin', id: checkInId, label: `Check-in #${checkInId}` }, { tab: 'checkins' });
  }, [selectRecord]);

  const applyCheckInSearch = useCallback((checkInId: number) => {
    const q = checkInRichSearch({ checkin: checkInId });
    const sel: WorkbenchSelection = {
      type: 'checkin',
      id: checkInId,
      label: `Check-in #${checkInId}`,
    };
    tabSelectionMemory.current.checkins = sel;
    tableAutoSelectRef.current = tableAutoSelectKey('checkins', q);
    navigateWorkbenchTab({
      tab: 'checkins',
      q,
      selected: sel,
    });
  }, [navigateWorkbenchTab]);

  const applyItemSearch = useCallback((sku: string) => {
    const q = itemRichSearch({ sku });
    setSearch(q);
    setDebouncedSearch(q);
    syncUrl({ tab: 'items', q });
  }, [syncUrl]);

  useEffect(() => {
    const tabForAutoSelect = pendingNavigationTabRef.current ?? activeTab;
    if (tabForAutoSelect !== 'products' || draftCheckIn || productsQuery.isFetching) return;
    if (selected && selected.type !== 'product') return;

    if (selected?.type === 'product' && products.some((p) => p.id === selected.id)) {
      tabSelectionMemory.current.products = selected;
      return;
    }

    const productFilter = parsedProducts.filters.product;
    const hasProductFilter = Boolean(productFilter);
    const remembered = tabSelectionMemory.current.products;
    if (
      remembered?.type === 'product'
      && products.some((p) => p.id === remembered.id)
    ) {
      if (selected?.id !== remembered.id || selected?.type !== 'product') {
        selectRecord(remembered, { tab: 'products' });
      }
      return;
    }

    if (!hasProductFilter && !querySearch.trim()) return;

    const autoKey = tableAutoSelectKey('products', querySearch);
    if (tableAutoSelectRef.current === autoKey) return;

    const filterId = Number(productFilter);
    const match =
      (Number.isFinite(filterId) ? products.find((p) => p.id === filterId) : undefined)
      ?? products[0];
    if (!match) {
      if (selected?.type === 'product') {
        setSelected(null);
        syncUrl({ selected: null });
      }
      return;
    }

    tableAutoSelectRef.current = autoKey;
    productAutoSelectRef.current = querySearch;
    selectRecord(
      {
        type: 'product',
        id: match.id,
        label: match.title || match.product_number || `#${match.id}`,
      },
      { tab: 'products' },
    );
  }, [
    activeTab,
    selected,
    draftCheckIn,
    querySearch,
    parsedProducts.filters.product,
    products,
    productsQuery.isFetching,
    selectRecord,
    syncUrl,
  ]);

  useEffect(() => {
    const tabForAutoSelect = pendingNavigationTabRef.current ?? activeTab;
    if (tabForAutoSelect !== 'items') return;
    if (!querySearch || selected || draftCheckIn) return;
    if (looksLikeSku(querySearch) && items.length === 1) {
      const it = items[0];
      selectRecord({ type: 'item', id: it.id, label: it.sku }, { tab: 'items' });
    }
  }, [activeTab, items, querySearch, selected, draftCheckIn, selectRecord]);

  useEffect(() => {
    const tabForAutoSelect = pendingNavigationTabRef.current ?? activeTab;
    if (tabForAutoSelect !== 'checkins' || draftCheckIn || checkInsQuery.isFetching) return;
    if (selected && selected.type !== 'checkin') return;

    if (selected?.type === 'checkin' && checkIns.some((ci) => ci.id === selected.id)) {
      tabSelectionMemory.current.checkins = selected;
      return;
    }

    const hasFilter = Boolean(
      parsedCheckIns.filters.product
      || parsedCheckIns.filters.checkin
      || parsedCheckIns.filters.order,
    );
    const remembered = tabSelectionMemory.current.checkins;
    if (
      remembered?.type === 'checkin'
      && checkIns.some((ci) => ci.id === remembered.id)
    ) {
      if (selected?.id !== remembered.id || selected?.type !== 'checkin') {
        selectRecord(remembered, { tab: 'checkins' });
      }
      return;
    }

    if (!hasFilter && !querySearch.trim()) {
      if (selected?.type === 'checkin') {
        setSelected(null);
        syncUrl({ selected: null });
      }
      return;
    }

    const autoKey = tableAutoSelectKey('checkins', querySearch);
    if (tableAutoSelectRef.current === autoKey) return;

    const first = checkIns[0];
    if (!first) {
      if (selected?.type === 'checkin') {
        setSelected(null);
        syncUrl({ selected: null });
      }
      return;
    }

    tableAutoSelectRef.current = autoKey;
    selectRecord(
      { type: 'checkin', id: first.id, label: `Check-in #${first.id}` },
      { tab: 'checkins' },
    );
  }, [
    activeTab,
    selected,
    draftCheckIn,
    querySearch,
    parsedCheckIns.filters.product,
    parsedCheckIns.filters.checkin,
    parsedCheckIns.filters.order,
    checkIns,
    checkInsQuery.isFetching,
    selectRecord,
    syncUrl,
  ]);

  useEffect(() => {
    const tabForAutoSelect = pendingNavigationTabRef.current ?? activeTab;
    if (tabForAutoSelect !== 'items' || itemsQuery.isFetching) return;
    if (looksLikeSku(querySearch)) return;
    if (selected && selected.type !== 'item') return;

    if (selected?.type === 'item' && items.some((it) => it.id === selected.id)) {
      tabSelectionMemory.current.items = selected;
      return;
    }

    const hasFilter = Boolean(parsedItems.filters.checkin || parsedItems.filters.product);
    const remembered = tabSelectionMemory.current.items;
    if (
      remembered?.type === 'item'
      && items.some((it) => it.id === remembered.id)
    ) {
      if (selected?.id !== remembered.id || selected?.type !== 'item') {
        selectRecord(remembered, { tab: 'items' });
      }
      return;
    }

    if (!hasFilter && !querySearch.trim()) {
      if (selected?.type === 'item') {
        setSelected(null);
        syncUrl({ selected: null });
      }
      return;
    }

    const autoKey = tableAutoSelectKey('items', querySearch);
    if (tableAutoSelectRef.current === autoKey) return;

    const first = items[0];
    if (!first) {
      if (selected?.type === 'item') {
        setSelected(null);
        syncUrl({ selected: null });
      }
      return;
    }

    tableAutoSelectRef.current = autoKey;
    selectRecord(
      { type: 'item', id: first.id, label: first.sku || String(first.id) },
      { tab: 'items' },
    );
  }, [
    activeTab,
    selected,
    querySearch,
    parsedItems.filters.checkin,
    parsedItems.filters.product,
    items,
    itemsQuery.isFetching,
    selectRecord,
    syncUrl,
  ]);

  const handleTabChange = (_: unknown, value: WorkbenchTab) => {
    pendingNavigationTabRef.current = value;

    if (selected && selectionMatchesTab(selected, activeTab)) {
      tabSelectionMemory.current[activeTab] = selected;
    }

    const nextDraftCheckIn = value === 'checkins' && draftCheckIn;
    if (value !== 'checkins') setDraftCheckIn(false);

    const resolved = resolveTabSelection(value, {
      selected,
      remembered: tabSelectionMemory.current[value],
      products,
      checkIns,
      items,
      draftCheckIn: nextDraftCheckIn,
    });

    if (resolved) {
      tabSelectionMemory.current[value] = resolved;
    }

    tableAutoSelectRef.current = resolved ? tableAutoSelectKey(value, querySearch) : null;
    setSelected(resolved);
    syncUrl({
      tab: value,
      selected: resolved,
      draft: nextDraftCheckIn ? 'checkin' : null,
    });
  };

  const startNewProduct = useCallback(() => {
    productAutoSelectRef.current = querySearch.trim() || null;
    setSelected(null);
    setDraftCheckIn(false);
    syncUrl({ tab: 'products', selected: null, draft: null });
  }, [syncUrl, querySearch]);

  const columnResetRef = useRef<(() => void) | null>(null);
  const registerColumnReset = useCallback((reset: (() => void) | null) => {
    columnResetRef.current = reset;
  }, []);

  const tableToolbarAction =
    activeTab === 'products' ?
      <Button size="small" startIcon={<AddOutlinedIcon />} variant="outlined" onClick={startNewProduct}>
        New product
      </Button>
    : null;

  const tablePane = (
    <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <CatalogFilterRow
        totalCount={
          activeTab === 'products' ? productCount
          : activeTab === 'checkins' ? checkInCount
          : itemCount
        }
        shownCount={
          activeTab === 'products' ? products.length
          : activeTab === 'checkins' ? checkIns.length
          : items.length
        }
        search={querySearch}
        isFetching={isFetching}
        entityPlural={
          activeTab === 'products' ? 'products'
          : activeTab === 'checkins' ? 'check-ins'
          : 'items'
        }
        columnReset={
          <CatalogTableColumnResetButton
            variant="text"
            onReset={() => columnResetRef.current?.()}
          />
        }
        actions={tableToolbarAction}
      />
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {activeTab === 'products' ?
          <ProductCatalogTable
            products={products}
            search={querySearch}
            selectedProductId={selected?.type === 'product' ? selected.id : null}
            onOpenProduct={(p) => selectRecord({ type: 'product', id: p.id, label: p.title || p.product_number || `#${p.id}` })}
            onRegisterColumnReset={registerColumnReset}
          />
        : activeTab === 'checkins' ?
          <ItemCheckInCatalogTable
            rows={checkIns}
            search={querySearch}
            selectedCheckInId={selected?.type === 'checkin' ? selected.id : null}
            onOpenCheckIn={(ci) => selectRecord({ type: 'checkin', id: ci.id, label: `Check-in #${ci.id}` })}
            onRegisterColumnReset={registerColumnReset}
          />
        : <ItemCatalogTable
            items={items}
            search={querySearch}
            selectedItemId={selected?.type === 'item' ? selected.id : null}
            onOpenItem={selectItemFromTable}
            onRegisterColumnReset={registerColumnReset}
          />}
      </Box>
    </Box>
  );

  const workspacePane = (
    <Paper
      variant="outlined"
      sx={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: processingTokens.surfaceRaised,
        borderColor: processingTokens.border,
      }}
    >
      {activeTab === 'products' ?
        <ProductManagePanel
          key={selectedProductId ?? 'new-product'}
          open
          embedded
          initialProduct={productEditorInitialProduct}
          onClose={startNewProduct}
          onProductSaved={(product) => {
            selectRecord(
              { type: 'product', id: product.id, label: product.title || product.product_number || `#${product.id}` },
              { tab: 'products' },
            );
          }}
          onApplyProductSearch={applyProductSearch}
          onStartProductCheckIn={startNewCheckIn}
          onOpenProductCheckIns={openProductCheckInsTab}
          onOpenItemsForProduct={seeAllItemsForProduct}
        />
      : activeTab === 'checkins' ?
        draftCheckIn ?
          <ItemCheckInManagePanel
            key={`draft-checkin-${draftCheckInProductId ?? 'blank'}`}
            mode="create"
            productId={draftCheckInProductId}
            onNavigate={navigateRelated}
            onApplyProductSearch={applyProductSearch}
            onOpenProductTab={openProductTab}
            onFilterCheckInsByProduct={filterCheckInsByProduct}
            onFilterCheckInsByOrder={filterCheckInsByOrder}
            onSeeAllFromProduct={openProductCheckInsTab}
            onCancelCreate={cancelDraftCheckIn}
            onCheckInCreated={handleCheckInCreated}
          />
        : selected?.type === 'checkin' ?
          <ItemCheckInManagePanel
            key={selected.id}
            mode="edit"
            checkInId={selected.id}
            onNavigate={navigateRelated}
            onApplyProductSearch={applyProductSearch}
            onOpenProductTab={openProductTab}
            onFilterCheckInById={filterCheckInsInPlace}
            onFilterCheckInsByProduct={filterCheckInsByProduct}
            onFilterCheckInsByOrder={filterCheckInsByOrder}
            onOpenItemsForCheckIn={openItemsForCheckIn}
            onSeeAllFromProduct={openProductCheckInsTab}
            onCheckInDuplicated={handleCheckInCreated}
          />
        : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
            <Typography variant="body2" color="text.secondary" align="center">
              Select a check-in from the table, or check in items from the Products tab.
            </Typography>
          </Box>
        )
      : selected?.type === 'item' ?
        <ItemManagePanel
          key={selected.id}
          itemId={selected.id}
          onFilterItemsByProduct={filterItemsByProduct}
          onFilterItemsByOrder={filterItemsByOrder}
          onFilterItemBySku={filterItemBySkuInPlace}
          onOpenCheckIn={applyCheckInSearch}
          onOpenItemsForCheckIn={openItemsForCheckIn}
        />
      : (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
          <Typography variant="body2" color="text.secondary" align="center">
            Select an item from the table to view and edit details.
          </Typography>
        </Box>
      )}
    </Paper>
  );

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        alignSelf: 'stretch',
        m: -3,
        p: 0,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ flexShrink: 0, px: 2, py: 1.5, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          Inventory catalog
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Search products, check-ins, and items in one place. Tables find records; the detail panel shows context and actions.
        </Typography>
      </Box>

      <Box sx={{ flexShrink: 0 }}>
        <ProcessingScanBar
          search={search}
          onSearchChange={setSearch}
          onSearchEnter={handleSearchEnter}
          onHistorySelect={commitSearch}
          historyStorageKey={SEARCH_HISTORY_KEYS.workbench}
          isFetching={isFetching}
          mode="queue"
          placeholder="Search SKU, product, PO… or filters like {product=123; checkin=99}"
          ariaLabel="Search inventory catalog"
        />
      </Box>

      <Box sx={{ flexShrink: 0, px: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={activeTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
          <Tab value="products" label={`Products (${productCount})`} />
          <Tab value="checkins" label={`Check-ins (${checkInCount})`} />
          <Tab value="items" label={`Items (${itemCount})`} />
        </Tabs>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: isStacked ? 'column' : 'row',
          gap: 1.5,
          p: 1.5,
          bgcolor: processingTokens.cardDeckBg,
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            flex: isStacked ? '0 0 45%' : '0 1 38%',
            minHeight: isStacked ? 280 : 0,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderColor: processingTokens.border,
          }}
        >
          {tablePane}
        </Paper>
        <Box sx={{ flex: isStacked ? '1 1 55%' : '1 1 62%', minHeight: isStacked ? 320 : 0, minWidth: 0, display: 'flex' }}>
          {workspacePane}
        </Box>
      </Box>
    </Box>
  );
}
