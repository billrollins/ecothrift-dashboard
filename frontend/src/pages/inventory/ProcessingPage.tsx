import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import CallSplit from '@mui/icons-material/CallSplit';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import OpenInNew from '@mui/icons-material/OpenInNew';
import PrintDisabled from '@mui/icons-material/PrintDisabled';
import Search from '@mui/icons-material/Search';
import Settings from '@mui/icons-material/Settings';
import Tune from '@mui/icons-material/Tune';
import { DataGrid, type GridColDef, type GridRenderCellParams } from '@mui/x-data-grid';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  ProcessingDrawer,
  buildItemForm,
  buildBatchForm,
  EMPTY_FORM,
  type DrawerMode,
  type ProcessingFormState,
} from '../../components/inventory/ProcessingDrawer';
import { ProcessingSettingsModal } from '../../components/inventory/ProcessingSettingsModal';
import { ProcessingStatsBar } from '../../components/inventory/ProcessingStatsBar';
import {
  useBatchGroups,
  useBulkUncheckIn,
  useCheckInBatchGroup,
  useCheckInItem,
  useCheckInOrderItems,
  useCreateItems,
  useDetachBatchItem,
  useItems,
  useMarkItemBroken,
  useMarkOrderComplete,
  usePurchaseOrder,
  usePurchaseOrders,
  useUncheckInItem,
  useUpdateBatchGroup,
  useUpdateItem,
} from '../../hooks/useInventory';
import { useGridColumnState } from '../../hooks/useGridColumnState';
import { useLocalPrintStatus } from '../../hooks/useLocalPrintStatus';
import { localPrintService } from '../../services/localPrintService';
import { formatCurrency } from '../../utils/format';
import type { BatchGroup, Item, PurchaseOrder, PurchaseOrderStatus } from '../../types/inventory.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<PurchaseOrderStatus, 'default' | 'primary' | 'warning' | 'success' | 'error'> = {
  ordered: 'default',
  paid: 'default',
  shipped: 'primary',
  delivered: 'warning',
  processing: 'primary',
  complete: 'success',
  cancelled: 'error',
};

const STICKY_KEY = 'processing_sticky_defaults';

function loadStickyDefaults(): { condition?: string; location?: string } {
  try {
    return JSON.parse(localStorage.getItem(STICKY_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStickyDefaults(condition: string, location: string) {
  localStorage.setItem(STICKY_KEY, JSON.stringify({ condition, location }));
}

// ─── Print helpers ────────────────────────────────────────────────────────────

async function printSingleLabel(
  item: Pick<Item, 'sku' | 'title' | 'price'> & Partial<Pick<Item, 'brand' | 'product_number'>>,
  priceOverride?: string,
): Promise<boolean> {
  try {
    const price = priceOverride || item.price;
    await localPrintService.printLabel({
      text: price ? `$${Number.parseFloat(price).toFixed(2)}` : '$0.00',
      qr_data: item.sku,
      product_title: item.title,
      product_brand: item.brand?.trim() || undefined,
      product_model: item.product_number?.trim() || undefined,
      include_text: true,
    });
    return true;
  } catch {
    return false;
  }
}

async function printBatchLabels(
  items: Array<Pick<Item, 'sku' | 'title' | 'price'> & Partial<Pick<Item, 'brand' | 'product_number'>>>,
  priceOverride?: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;
  const STAGGER_MS = 200;

  const results = await Promise.allSettled(
    items.map((item, i) =>
      new Promise<boolean>((resolve) => {
        setTimeout(async () => {
          const ok = await printSingleLabel(item, priceOverride);
          if (ok) succeeded++;
          else failed++;
          onProgress?.(succeeded + failed, items.length);
          resolve(ok);
        }, i * STAGGER_MS);
      }),
    ),
  );
  void results;
  return { succeeded, failed };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProcessingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderParam = searchParams.get('order');
  const { enqueueSnackbar } = useSnackbar();
  const printStatus = useLocalPrintStatus();

  // ─── State ──────────────────────────────────────────────────────────────────

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(
    orderParam ? Number.parseInt(orderParam, 10) : null,
  );
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState('');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [activeBatch, setActiveBatch] = useState<BatchGroup | null>(null);
  const [form, setForm] = useState<ProcessingFormState>(EMPTY_FORM);
  const [printOnCheckIn, setPrintOnCheckIn] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [lastCheckedIn, setLastCheckedIn] = useState<ProcessingFormState | null>(null);
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const sessionStartRef = useRef(Date.now());
  const scannerRef = useRef<HTMLInputElement>(null);
  const [scanInput, setScanInput] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ condition: '', location: '', price: '', cost: '' });
  const [printProgress, setPrintProgress] = useState<{ done: number; total: number } | null>(null);
  const [selectedCheckedInIds, setSelectedCheckedInIds] = useState<number[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<number[]>([]);
  const [checkedInBulkDialogOpen, setCheckedInBulkDialogOpen] = useState(false);
  const [checkedInBulkForm, setCheckedInBulkForm] = useState({ condition: '', location: '', price: '' });
  const [batchApplyForm, setBatchApplyForm] = useState({ condition: '', location: '', price: '' });

  // Detach confirmation
  const [detachDialogOpen, setDetachDialogOpen] = useState(false);
  const [detachBatchId, setDetachBatchId] = useState<number | null>(null);
  const [detachCount, setDetachCount] = useState(1);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState('');
  const generalSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInputValue.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInputValue]);

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: ordersData } = usePurchaseOrders({ status__in: 'delivered,processing,complete' });
  const { data: order } = usePurchaseOrder(selectedOrderId);
  const { data: batchGroupsData, isLoading: batchLoading } = useBatchGroups(
    {
      purchase_order: selectedOrderId,
      ...(search ? { search } : {}),
    },
    selectedOrderId != null,
  );
  const { data: itemsData, isLoading: itemsLoading } = useItems(
    {
      purchase_order: selectedOrderId,
      page_size: 1000,
      ...(search ? { search } : {}),
    },
    selectedOrderId != null,
  );

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const updateItem = useUpdateItem();
  const checkInItem = useCheckInItem();
  const createItemsMutation = useCreateItems();
  const updateBatchGroup = useUpdateBatchGroup();
  const checkInBatchGroup = useCheckInBatchGroup();
  const detachBatchItem = useDetachBatchItem();
  const markComplete = useMarkOrderComplete();
  const bulkCheckIn = useCheckInOrderItems();
  const markItemBrokenMutation = useMarkItemBroken();
  const bulkUncheckInMutation = useBulkUncheckIn();
  const uncheckInItemMutation = useUncheckInItem();

  // ─── Derived data ───────────────────────────────────────────────────────────

  const orders = ordersData?.results ?? [];
  const items = itemsData?.results ?? [];
  const batchGroups = batchGroupsData?.results ?? [];

  const stats = order?.processing_stats;
  const onShelf = stats?.item_status_counts?.on_shelf ?? 0;
  const pendingCount = stats?.pending_items ?? 0;
  const totalTracked = onShelf + pendingCount;
  const progressValue = totalTracked > 0 ? (onShelf / totalTracked) * 100 : 0;

  const pendingItems = useMemo(
    () => items.filter((i) => ['intake', 'processing'].includes(i.status)),
    [items],
  );
  const individualQueue = useMemo(
    () => pendingItems.filter((i) => i.processing_tier === 'individual' || !i.batch_group),
    [pendingItems],
  );
  const checkedInItems = useMemo(
    () => items.filter((i) => i.status === 'on_shelf'),
    [items],
  );
  const batchQueue = useMemo(
    () => batchGroups.filter((g) => (g.intake_items_count ?? 0) > 0 || g.status !== 'complete'),
    [batchGroups],
  );

  const batchPendingItems = useMemo(
    () =>
      activeBatch
        ? items.filter(
            (i) => i.batch_group === activeBatch.id && ['intake', 'processing'].includes(i.status),
          )
        : [],
    [items, activeBatch],
  );
  const batchCheckedInItems = useMemo(
    () =>
      activeBatch
        ? items.filter(
            (i) => i.batch_group === activeBatch.id && ['on_shelf', 'scrapped'].includes(i.status),
          )
        : [],
    [items, activeBatch],
  );

  const queueNotBuilt =
    order != null &&
    ['delivered', 'processing'].includes(order.status) &&
    (order.item_count === 0 || (!itemsLoading && items.length === 0));

  const allCheckedIn =
    order != null && pendingCount === 0 && onShelf > 0 && order.item_count > 0;

  const loading = batchLoading || itemsLoading;

  // ─── Drawer handlers ───────────────────────────────────────────────────────

  const stickyDefaults = loadStickyDefaults();

  const openItemDrawer = useCallback((item: Item) => {
    setDrawerMode('item');
    setActiveItem(item);
    setActiveBatch(null);
    setForm(buildItemForm(item, stickyDefaults));
    setJustCheckedIn(false);
  }, [stickyDefaults]);

  const openBatchDrawer = useCallback((batch: BatchGroup) => {
    setDrawerMode('batch');
    setActiveBatch(batch);
    setActiveItem(null);
    setForm(buildBatchForm(batch, stickyDefaults));
    setJustCheckedIn(false);
  }, [stickyDefaults]);

  const closeDrawer = useCallback(() => {
    setDrawerMode(null);
    setActiveItem(null);
    setActiveBatch(null);
    setForm(EMPTY_FORM);
    setJustCheckedIn(false);
  }, []);

  const advanceToNext = useCallback(() => {
    if (activeTab === 0 && batchQueue.length > 0) {
      const currentIdx = activeBatch ? batchQueue.findIndex((b) => b.id === activeBatch.id) : -1;
      const next = batchQueue[currentIdx + 1] ?? batchQueue[0];
      if (next) openBatchDrawer(next);
      else closeDrawer();
    } else {
      const currentIdx = activeItem ? individualQueue.findIndex((i) => i.id === activeItem.id) : -1;
      const next = individualQueue[currentIdx + 1] ?? individualQueue[0];
      if (next) openItemDrawer(next);
      else closeDrawer();
    }
  }, [activeTab, batchQueue, individualQueue, activeBatch, activeItem, openBatchDrawer, openItemDrawer, closeDrawer]);

  // ─── Print handler ──────────────────────────────────────────────────────────

  const handlePrint = useCallback(async (
    item: Pick<Item, 'sku' | 'title' | 'price'> & Partial<Pick<Item, 'brand' | 'product_number'>>,
    priceOverride?: string,
  ) => {
    if (!printStatus.online) {
      enqueueSnackbar('Print server offline — label not printed.', { variant: 'warning' });
      return;
    }
    const ok = await printSingleLabel(item, priceOverride);
    if (!ok) enqueueSnackbar(`Failed printing label for ${item.sku}`, { variant: 'error' });
  }, [printStatus.online, enqueueSnackbar]);

  // ─── Save / Check-In handlers ──────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (drawerMode === 'item' && activeItem) {
      try {
        await updateItem.mutateAsync({
          id: activeItem.id,
          data: {
            title: form.title, brand: form.brand, category: form.category,
            condition: form.condition, location: form.location,
            price: form.price || undefined, cost: form.cost || undefined,
            notes: form.notes,
          },
        });
        saveStickyDefaults(form.condition, form.location);
        enqueueSnackbar(`Updated ${activeItem.sku}`, { variant: 'success' });
        closeDrawer();
      } catch {
        enqueueSnackbar('Failed to save item updates', { variant: 'error' });
      }
    } else if (drawerMode === 'batch' && activeBatch) {
      try {
        await updateBatchGroup.mutateAsync({
          id: activeBatch.id,
          data: {
            unit_price: form.price || undefined, unit_cost: form.cost || undefined,
            condition: form.condition || undefined, location: form.location,
            notes: form.notes,
          },
        });
        saveStickyDefaults(form.condition, form.location);
        enqueueSnackbar(`Updated ${activeBatch.batch_number}`, { variant: 'success' });
        closeDrawer();
      } catch {
        enqueueSnackbar('Failed to save batch updates', { variant: 'error' });
      }
    }
  }, [drawerMode, activeItem, activeBatch, form, updateItem, updateBatchGroup, enqueueSnackbar, closeDrawer]);

  const handleCheckIn = useCallback(async (extra?: { checkInCount?: number; scrapCount?: number }) => {
    if (drawerMode === 'item' && activeItem) {
      try {
        const checkedIn = await checkInItem.mutateAsync({
          id: activeItem.id,
          data: {
            title: form.title, brand: form.brand, category: form.category,
            condition: form.condition, location: form.location,
            price: form.price || undefined, cost: form.cost || undefined,
            notes: form.notes,
          },
        });
        saveStickyDefaults(form.condition, form.location);
        setLastCheckedIn({ ...form });
        setSessionCount((c) => c + 1);
        enqueueSnackbar(`Checked in ${checkedIn.sku}`, { variant: 'success' });

        if (printOnCheckIn) {
          await handlePrint({
            sku: checkedIn.sku,
            title: checkedIn.title,
            price: checkedIn.price,
            brand: checkedIn.brand,
            product_number: checkedIn.product_number,
          });
        }

        setJustCheckedIn(true);
        if (autoAdvance) {
          setTimeout(advanceToNext, 300);
        }
      } catch {
        enqueueSnackbar('Failed to check in item', { variant: 'error' });
      }
    } else if (drawerMode === 'batch' && activeBatch) {
      const batchItems = pendingItems.filter(
        (i) => i.batch_group === activeBatch.id && ['intake', 'processing'].includes(i.status),
      );
      const hasPartial = extra && (extra.scrapCount != null || extra.checkInCount != null);
      try {
        const result = await checkInBatchGroup.mutateAsync({
          id: activeBatch.id,
          data: {
            unit_price: form.price || undefined, unit_cost: form.cost || undefined,
            condition: form.condition || undefined, location: form.location,
            ...(hasPartial && extra
              ? {
                  check_in_count: extra.checkInCount,
                  scrap_count: extra.scrapCount,
                }
              : {}),
          },
        });
        saveStickyDefaults(form.condition, form.location);
        setLastCheckedIn({ ...form });
        setSessionCount((c) => c + (result.checked_in ?? batchItems.length));
        const msg = result.marked_broken
          ? `Checked in ${result.checked_in}, marked ${result.marked_broken} broken`
          : `Checked in ${result.checked_in} item(s) from ${activeBatch.batch_number}`;
        enqueueSnackbar(msg, { variant: 'success' });

        if (printOnCheckIn && !hasPartial && batchItems.length > 0) {
          setPrintProgress({ done: 0, total: batchItems.length });
          const { failed } = await printBatchLabels(batchItems, form.price, (done, total) => {
            setPrintProgress({ done, total });
          });
          setPrintProgress(null);
          if (failed > 0) {
            enqueueSnackbar(`${failed} label(s) failed to print`, { variant: 'warning' });
          }
        }

        setJustCheckedIn(true);
        if (autoAdvance) {
          setTimeout(advanceToNext, 300);
        }
      } catch {
        enqueueSnackbar('Failed to check in batch', { variant: 'error' });
      }
    }
  }, [drawerMode, activeItem, activeBatch, form, pendingItems, printOnCheckIn, autoAdvance,
    checkInItem, checkInBatchGroup, handlePrint, advanceToNext, enqueueSnackbar]);

  const handleReprint = useCallback(async () => {
    if (activeItem) {
      await handlePrint({
        sku: activeItem.sku,
        title: activeItem.title,
        price: activeItem.price,
        brand: activeItem.brand,
        product_number: activeItem.product_number,
      });
    }
  }, [activeItem, handlePrint]);

  const handleCopyLast = useCallback(() => {
    if (!lastCheckedIn) return;
    setForm((prev) => ({
      ...prev,
      condition: lastCheckedIn.condition,
      location: lastCheckedIn.location,
      notes: lastCheckedIn.notes,
    }));
    enqueueSnackbar('Copied from last item', { variant: 'info' });
  }, [lastCheckedIn, enqueueSnackbar]);

  const handleMarkBroken = useCallback(async () => {
    if (!activeItem) return;
    try {
      await markItemBrokenMutation.mutateAsync(activeItem.id);
      enqueueSnackbar(`Marked ${activeItem.sku} as broken`, { variant: 'success' });
      closeDrawer();
    } catch {
      enqueueSnackbar('Failed to mark item broken', { variant: 'error' });
    }
  }, [activeItem, markItemBrokenMutation, enqueueSnackbar, closeDrawer]);

  const handleUncheckInBatchItem = useCallback(
    async (id: number) => {
      try {
        await uncheckInItemMutation.mutateAsync(id);
        enqueueSnackbar('Item reverted to pending', { variant: 'success' });
      } catch {
        enqueueSnackbar('Failed to unprocess item', { variant: 'error' });
      }
    },
    [uncheckInItemMutation, enqueueSnackbar],
  );

  const handleCheckedInBulkUncheckIn = useCallback(async () => {
    if (!selectedOrderId || selectedCheckedInIds.length === 0) return;
    try {
      const result = await bulkUncheckInMutation.mutateAsync({ orderId: selectedOrderId, itemIds: selectedCheckedInIds });
      enqueueSnackbar(`Unchecked in ${result.unchecked_in} item(s)`, { variant: 'success' });
      setSelectedCheckedInIds([]);
    } catch {
      enqueueSnackbar('Failed to uncheck in items', { variant: 'error' });
    }
  }, [selectedOrderId, selectedCheckedInIds, bulkUncheckInMutation, enqueueSnackbar]);

  const handleBatchApplyToItems = useCallback(async () => {
    if (!selectedOrderId) return;
    const ids = individualQueue.map((i) => i.id);
    if (ids.length === 0) return;
    const data: Record<string, unknown> = { item_ids: ids };
    if (batchApplyForm.condition) data.condition = batchApplyForm.condition;
    if (batchApplyForm.location !== undefined) data.location = batchApplyForm.location;
    if (batchApplyForm.price) data.price = batchApplyForm.price;
    try {
      const result = await bulkCheckIn.mutateAsync({ orderId: selectedOrderId, data });
      enqueueSnackbar(`Applied to ${result.checked_in} item(s)`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to apply to items', { variant: 'error' });
    }
  }, [selectedOrderId, individualQueue, batchApplyForm, bulkCheckIn, enqueueSnackbar]);

  const handleBatchApplyToBatches = useCallback(async () => {
    const updates: Record<string, string> = {};
    if (batchApplyForm.condition) updates.condition = batchApplyForm.condition;
    if (batchApplyForm.location !== undefined) updates.location = batchApplyForm.location;
    if (batchApplyForm.price) updates.unit_price = batchApplyForm.price;
    if (Object.keys(updates).length === 0) return;
    const targets =
      selectedBatchIds.length > 0
        ? batchQueue.filter((b) => selectedBatchIds.includes(b.id))
        : batchQueue;
    try {
      for (const batch of targets) {
        await updateBatchGroup.mutateAsync({ id: batch.id, data: updates });
      }
      enqueueSnackbar(`Applied to ${targets.length} batch(es)`, { variant: 'success' });
      setSelectedBatchIds([]);
    } catch {
      enqueueSnackbar('Failed to apply to batches', { variant: 'error' });
    }
  }, [batchQueue, selectedBatchIds, batchApplyForm, updateBatchGroup, enqueueSnackbar]);

  const handleCheckedInBulkUpdate = useCallback(async () => {
    const updates: Record<string, string> = {};
    if (checkedInBulkForm.condition) updates.condition = checkedInBulkForm.condition;
    if (checkedInBulkForm.location !== undefined) updates.location = checkedInBulkForm.location;
    if (checkedInBulkForm.price) updates.price = checkedInBulkForm.price;
    if (Object.keys(updates).length === 0) {
      setCheckedInBulkDialogOpen(false);
      return;
    }
    try {
      for (const id of selectedCheckedInIds) {
        await updateItem.mutateAsync({ id, data: updates });
      }
      enqueueSnackbar(`Updated ${selectedCheckedInIds.length} item(s)`, { variant: 'success' });
      setSelectedCheckedInIds([]);
      setCheckedInBulkDialogOpen(false);
      setCheckedInBulkForm({ condition: '', location: '', price: '' });
    } catch {
      enqueueSnackbar('Failed to update some items', { variant: 'error' });
    }
  }, [selectedCheckedInIds, checkedInBulkForm, updateItem, enqueueSnackbar]);

  // ─── Detach handler ─────────────────────────────────────────────────────────

  const confirmDetach = useCallback(async () => {
    if (detachBatchId == null) return;
    try {
      let lastSku = '';
      for (let i = 0; i < detachCount; i++) {
        const result = await detachBatchItem.mutateAsync({ id: detachBatchId });
        lastSku = result.detached_item_sku;
      }
      enqueueSnackbar(
        detachCount === 1
          ? `Detached ${lastSku}`
          : `Detached ${detachCount} item(s) from batch`,
        { variant: 'success' },
      );
    } catch {
      enqueueSnackbar('Failed to detach item(s) from batch', { variant: 'error' });
    }
    setDetachDialogOpen(false);
    setDetachBatchId(null);
    setDetachCount(1);
  }, [detachBatchId, detachCount, detachBatchItem, enqueueSnackbar]);

  // ─── Mark complete ──────────────────────────────────────────────────────────

  const handleMarkComplete = useCallback(async () => {
    if (!selectedOrderId) return;
    try {
      await markComplete.mutateAsync(selectedOrderId);
      enqueueSnackbar('Order marked complete!', { variant: 'success' });
    } catch (err: unknown) {
      const detail =
        err != null && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      enqueueSnackbar(detail || 'Failed to mark order complete', { variant: 'error' });
    }
  }, [selectedOrderId, markComplete, enqueueSnackbar]);

  // ─── Build queue ────────────────────────────────────────────────────────────

  const handleBuildQueue = useCallback(async () => {
    if (!order) return;
    try {
      const result = await createItemsMutation.mutateAsync(order.id);
      enqueueSnackbar(
        `Created ${result.items_created} item(s), ${result.batch_groups_created} batch(es)`,
        { variant: 'success' },
      );
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      enqueueSnackbar(axiosErr?.response?.data?.detail || 'Failed to build check-in queue', { variant: 'error' });
    }
  }, [order, createItemsMutation, enqueueSnackbar]);

  // ─── Bulk check-in ─────────────────────────────────────────────────────────

  const handleBulkCheckIn = useCallback(async () => {
    if (!selectedOrderId || selectedItemIds.length === 0) return;
    try {
      const result = await bulkCheckIn.mutateAsync({
        orderId: selectedOrderId,
        data: {
          item_ids: selectedItemIds.map(Number),
          ...(bulkForm.condition ? { condition: bulkForm.condition } : {}),
          ...(bulkForm.location ? { location: bulkForm.location } : {}),
          ...(bulkForm.price ? { price: bulkForm.price } : {}),
          ...(bulkForm.cost ? { cost: bulkForm.cost } : {}),
        },
      });
      setSessionCount((c) => c + (result.checked_in ?? 0));
      enqueueSnackbar(`Bulk checked in ${result.checked_in} item(s)`, { variant: 'success' });

      if (printOnCheckIn && printStatus.online) {
        const idSet = new Set(selectedItemIds.map(Number));
        const itemsToPrint = items.filter((i) => idSet.has(i.id));
        if (itemsToPrint.length > 0) {
          setPrintProgress({ done: 0, total: itemsToPrint.length });
          const { failed } = await printBatchLabels(
            itemsToPrint,
            bulkForm.price || undefined,
            (done, total) => setPrintProgress({ done, total }),
          );
          setPrintProgress(null);
          if (failed > 0) enqueueSnackbar(`${failed} label(s) failed to print`, { variant: 'warning' });
        }
      }

      setSelectedItemIds([]);
      setBulkDialogOpen(false);
      setBulkForm({ condition: '', location: '', price: '', cost: '' });
    } catch {
      enqueueSnackbar('Failed to bulk check in items', { variant: 'error' });
    }
  }, [selectedOrderId, selectedItemIds, bulkForm, printOnCheckIn, printStatus.online,
    items, bulkCheckIn, enqueueSnackbar]);

  // ─── Scanner ────────────────────────────────────────────────────────────────

  const handleScan = useCallback(() => {
    const sku = scanInput.trim().toUpperCase();
    if (!sku) return;
    const found = items.find((i) => i.sku.toUpperCase() === sku);
    if (found) {
      openItemDrawer(found);
      if (activeTab !== 1) setActiveTab(1);
    } else {
      enqueueSnackbar(`No item found with SKU "${sku}"`, { variant: 'warning' });
    }
    setScanInput('');
  }, [scanInput, items, openItemDrawer, activeTab, enqueueSnackbar]);

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === 'F2') {
        e.preventDefault();
        scannerRef.current?.focus();
        return;
      }
      if (e.key === '/' && !isInput) {
        e.preventDefault();
        generalSearchRef.current?.focus();
        return;
      }
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        generalSearchRef.current?.focus();
        return;
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSettingsModalOpen(true);
        return;
      }
      if (!isInput && ['1', '2', '3'].includes(e.key) && selectedOrderId) {
        e.preventDefault();
        setActiveTab(Number(e.key) - 1);
        return;
      }

      if (drawerMode) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeDrawer();
          return;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          handleCheckIn();
          return;
        }
        if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          handleReprint();
          return;
        }
        if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (drawerMode === 'item' && activeItem) handleMarkBroken();
          return;
        }
        if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (drawerMode === 'batch' && activeBatch) {
            setDetachDialogOpen(true);
            setDetachBatchId(activeBatch.id);
            setDetachCount(1);
          }
          return;
        }
        if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          advanceToNext();
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerMode, activeItem, activeBatch, selectedOrderId, closeDrawer, handleCheckIn, handleReprint, advanceToNext, handleMarkBroken]);

  // ─── Column definitions (actions first for layout) ──────────────────────────

  const batchColumnsBase: GridColDef[] = useMemo(() => [
    {
      field: 'actions', headerName: 'Actions', width: 180, sortable: false, filterable: false,
      renderCell: (params: GridRenderCellParams<BatchGroup>) => (
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Button size="small" variant="contained" startIcon={<Tune />}
            onClick={(e) => { e.stopPropagation(); openBatchDrawer(params.row); }}
            sx={{ minWidth: { xs: 40, sm: 'auto' }, '& .MuiButton-startIcon': { marginRight: { xs: 0, sm: 0.5 } } }}>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Process</Box>
          </Button>
          <Tooltip title="Detach one item to individual processing">
            <IconButton size="small" color="warning"
              onClick={(e) => {
                e.stopPropagation();
                setDetachDialogOpen(true);
                setDetachBatchId(params.row.id);
                setDetachCount(1);
              }}
              disabled={detachBatchItem.isPending}>
              <CallSplit fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
    { field: 'batch_number', headerName: 'Batch', width: 120 },
    { field: 'product_title', headerName: 'Product', flex: 1, minWidth: 160 },
    { field: 'total_qty', headerName: 'Qty', width: 60, type: 'number' },
    {
      field: 'intake_items_count', headerName: 'Pending', width: 80, type: 'number',
      renderCell: (params: GridRenderCellParams<BatchGroup>) => {
        const count = params.row.intake_items_count ?? 0;
        return count > 0
          ? <Chip label={count} size="small" color="warning" sx={{ fontWeight: 600, minWidth: 32 }} />
          : <Chip label="0" size="small" color="success" variant="outlined" />;
      },
    },
    {
      field: 'unit_price', headerName: 'Price', width: 90, editable: true,
      renderCell: (params: GridRenderCellParams<BatchGroup>) => <>{formatCurrency(params.row.unit_price)}</>,
    },
    { field: 'condition', headerName: 'Condition', width: 100, editable: true },
    { field: 'location', headerName: 'Location', width: 100, editable: true },
  ], [openBatchDrawer, detachBatchItem.isPending]);

  const batchColumnState = useGridColumnState({
    storageKey: 'processing_grid_batches',
    columns: batchColumnsBase,
  });

  const itemColumnsBase: GridColDef[] = useMemo(() => [
    {
      field: 'actions', headerName: 'Actions', width: 100, sortable: false, filterable: false,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Button size="small" variant="contained" startIcon={<Tune />}
            onClick={(e) => { e.stopPropagation(); openItemDrawer(params.row); }}
            sx={{ minWidth: { xs: 40, sm: 'auto' }, '& .MuiButton-startIcon': { marginRight: { xs: 0, sm: 0.5 } } }}>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Process</Box>
          </Button>
          <Tooltip title="Mark broken">
            <IconButton size="small" color="error"
              onClick={(e) => {
                e.stopPropagation();
                markItemBrokenMutation.mutate(params.row.id);
              }}
              disabled={markItemBrokenMutation.isPending}>
              <span style={{ fontSize: 14 }}>✕</span>
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
    {
      field: 'sku', headerName: 'SKU', width: 120,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500, display: 'flex', alignItems: 'center' }}>
          {params.row.sku}
        </Typography>
      ),
    },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 160 },
    { field: 'brand', headerName: 'Brand', width: 100 },
    {
      field: 'condition', headerName: 'Condition', width: 100, editable: true,
      renderCell: (params: GridRenderCellParams<Item>) => {
        const val = params.row.condition;
        return val && val !== 'unknown'
          ? <Chip label={val.replace('_', ' ')} size="small" variant="outlined" />
          : <Typography variant="body2" color="text.secondary">--</Typography>;
      },
    },
    {
      field: 'price', headerName: 'Price', width: 85, editable: true,
      renderCell: (params: GridRenderCellParams<Item>) => <>{formatCurrency(params.row.price)}</>,
    },
    { field: 'location', headerName: 'Location', width: 90, editable: true },
  ], [openItemDrawer, markItemBrokenMutation]);

  const itemColumnState = useGridColumnState({
    storageKey: 'processing_grid_items',
    columns: itemColumnsBase,
  });

  const checkedInColumnsBase: GridColDef[] = useMemo(() => [
    {
      field: 'actions', headerName: '', width: 60, sortable: false, filterable: false,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <Tooltip title="Reprint label">
          <IconButton size="small"
            onClick={(e) => {
              e.stopPropagation();
              handlePrint({
                sku: params.row.sku,
                title: params.row.title,
                price: params.row.price,
                brand: params.row.brand,
                product_number: params.row.product_number,
              });
            }}>
            <LocalPrintshop fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
    {
      field: 'sku', headerName: 'SKU', width: 120,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500, display: 'flex', alignItems: 'center' }}>
          {params.row.sku}
        </Typography>
      ),
    },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 160 },
    {
      field: 'price', headerName: 'Price', width: 85,
      renderCell: (params: GridRenderCellParams<Item>) => <>{formatCurrency(params.row.price)}</>,
    },
    { field: 'condition', headerName: 'Condition', width: 100 },
    { field: 'location', headerName: 'Location', width: 90 },
    {
      field: 'checked_in_at', headerName: 'Checked In', width: 140,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <>{params.row.checked_in_at ? format(new Date(params.row.checked_in_at), 'MM/dd h:mm a') : '—'}</>
      ),
    },
  ], [handlePrint]);

  const checkedInColumnState = useGridColumnState({
    storageKey: 'processing_grid_checked_in',
    columns: checkedInColumnsBase,
  });

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading && !order && selectedOrderId) return <LoadingScreen />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <PageHeader
        title="Processing Workspace"
        subtitle="Check in inventory, finalize details, and print tags"
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Print server status */}
            <Tooltip title={
              printStatus.online
                ? `v${printStatus.version} — ${printStatus.printersAvailable} printer(s)`
                : 'Print server not detected at localhost:8888'
            }>
              <Chip
                icon={printStatus.online ? <LocalPrintshop /> : <PrintDisabled />}
                label={printStatus.online ? 'Printer Online' : 'Printer Offline'}
                size="small"
                color={printStatus.online ? 'success' : 'default'}
                variant={printStatus.online ? 'filled' : 'outlined'}
              />
            </Tooltip>
            {/* Navigation */}
            {selectedOrderId && order && (
              <>
                <Button size="small" variant="outlined" startIcon={<ArrowBack />}
                  onClick={() => navigate(`/inventory/preprocessing/${order.id}`)}>
                  Preprocessing
                </Button>
                <Button size="small" variant="outlined" startIcon={<OpenInNew />}
                  onClick={() => navigate(`/inventory/orders/${order.id}`)}>
                  Order
                </Button>
              </>
            )}
          </Box>
        }
      />

      {/* ── Order Context Bar ───────────────────────────────────────── */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', '&:last-child': { pb: 2 } }}>
          <Autocomplete
            sx={{ minWidth: 460, maxWidth: 600, flex: '1 1 300px' }}
            size="small"
            options={orders}
            value={orders.find((o) => o.id === selectedOrderId) ?? null}
            onChange={(_e, val) => {
              setSelectedOrderId(val?.id ?? null);
              setActiveTab(0);
              closeDrawer();
              setSelectedItemIds([]);
            }}
            getOptionLabel={(o: PurchaseOrder) => `${o.order_number} — ${o.vendor_name}`}
            renderOption={(props, o: PurchaseOrder) => (
              <li {...props} key={o.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                  <Typography variant="body2" fontWeight={600}>{o.order_number}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }} noWrap>
                    {o.vendor_name}
                  </Typography>
                  <Chip label={o.status} size="small" color={STATUS_COLOR[o.status]} />
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} label="Purchase Order" placeholder="Search orders..." />
            )}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
          />

          {selectedOrderId && (
            <TextField
              inputRef={generalSearchRef}
              size="small"
              placeholder="Search SKU, brand, title, description, UPC…"
              value={searchInputValue}
              onChange={(e) => setSearchInputValue(e.target.value)}
              sx={{ flex: '1 1 280px', minWidth: 200, maxWidth: 400 }}
              slotProps={{
                input: {
                  startAdornment: <Search fontSize="small" sx={{ mr: 0.75, color: 'text.secondary' }} />,
                },
              }}
            />
          )}

          {selectedOrderId && (
            <Tooltip title="Settings and hotkeys (?)">
              <IconButton size="small" onClick={() => setSettingsModalOpen(true)}>
                <Settings fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {/* Progress ring + stats */}
          {order && stats && order.item_count > 0 && (
            <>
              <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                <CircularProgress variant="determinate" value={progressValue} size={52} thickness={4}
                  color={progressValue >= 100 ? 'success' : 'primary'} />
                <Box sx={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    {Math.round(progressValue)}%
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip
                  label={`${onShelf} / ${order.item_count} on shelf`}
                  size="small"
                  color="success"
                  variant={onShelf === order.item_count ? 'filled' : 'outlined'}
                />
                {pendingCount > 0 && (
                  <Chip label={`${pendingCount} pending`} size="small" color="warning" />
                )}
                {(stats.batch_groups_pending ?? 0) > 0 && (
                  <Chip label={`${stats.batch_groups_pending} batches`} size="small" variant="outlined" />
                )}
                <Chip
                  label={order.status}
                  size="small"
                  color={STATUS_COLOR[order.status]}
                />
              </Box>
            </>
          )}

          {/* Mark Complete */}
          {allCheckedIn && order?.status !== 'complete' && (
            <Button
              variant="contained" color="success" size="small"
              startIcon={markComplete.isPending ? <CircularProgress size={14} color="inherit" /> : <CheckCircleOutline />}
              onClick={handleMarkComplete}
              disabled={markComplete.isPending}
              sx={{ ml: 'auto' }}
            >
              Mark Complete
            </Button>
          )}
          {order?.status === 'complete' && (
            <Chip label="Complete" color="success" size="small" icon={<CheckCircleOutline />} sx={{ ml: 'auto' }} />
          )}

          {/* Session stats row (embedded stats bar) */}
          {selectedOrderId && (
            <Box sx={{ width: '100%', pt: 1 }}>
              <ProcessingStatsBar
                sessionCheckedIn={sessionCount}
                sessionStartTime={sessionStartRef.current}
                totalPending={pendingCount}
                autoAdvance={autoAdvance}
                onAutoAdvanceToggle={setAutoAdvance}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Smart alerts ────────────────────────────────────────────── */}
      {selectedOrderId && order && queueNotBuilt && (
        <Alert severity="warning" sx={{ mb: 2 }} action={
          <Button size="small" color="inherit" onClick={handleBuildQueue} disabled={createItemsMutation.isPending}>
            {createItemsMutation.isPending ? 'Building...' : 'Build Check-In Queue'}
          </Button>
        }>
          The check-in queue hasn&apos;t been built yet. Click <strong>Build Check-In Queue</strong> to
          create items from the manifest.
        </Alert>
      )}

      {allCheckedIn && order?.status === 'complete' && (
        <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircleOutline />}>
          All {onShelf} items are checked in and the order is complete.
        </Alert>
      )}

      {/* ── Print progress indicator ────────────────────────────────── */}
      {printProgress && (
        <Alert severity="info" sx={{ mb: 2 }} icon={<LocalPrintshop />}>
          Printing labels... {printProgress.done} / {printProgress.total}
        </Alert>
      )}

      {/* ── Scanner Input ───────────────────────────────────────────── */}
      {selectedOrderId && (
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ display: 'flex', gap: 1, alignItems: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Chip label="F2" size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontWeight: 600 }} />
            <TextField
              inputRef={scannerRef}
              size="small"
              placeholder="Scan or type SKU..."
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              sx={{ flex: 1, maxWidth: 400 }}
              slotProps={{
                input: {
                  startAdornment: <Search fontSize="small" sx={{ mr: 0.75, color: 'text.secondary' }} />,
                },
              }}
            />
            <Button size="small" variant="outlined" onClick={handleScan}>Find</Button>
          </CardContent>
        </Card>
      )}

      {/* ── Tabbed Queues ───────────────────────────────────────────── */}
      {selectedOrderId && (
        <Card sx={{ flex: 1, minHeight: 0, mb: 2, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
            <Tabs value={activeTab} onChange={(_e, v) => setActiveTab(v)}>
              <Tab label={
                <Badge badgeContent={batchQueue.length} color="warning" max={999}>
                  <Box sx={{ pr: batchQueue.length > 0 ? 2 : 0 }}>Batches</Box>
                </Badge>
              } />
              <Tab label={
                <Badge badgeContent={individualQueue.length} color="warning" max={999}>
                  <Box sx={{ pr: individualQueue.length > 0 ? 2 : 0 }}>Items</Box>
                </Badge>
              } />
              <Tab label={
                <Badge badgeContent={checkedInItems.length} color="success" max={999}>
                  <Box sx={{ pr: checkedInItems.length > 0 ? 2 : 0 }}>Checked In</Box>
                </Badge>
              } />
            </Tabs>

            {/* Bulk actions for Batches tab */}
            {activeTab === 0 && selectedBatchIds.length > 0 && (
              <Box sx={{ ml: 'auto', mr: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                <Chip label={`${selectedBatchIds.length} selected`} size="small" color="primary" />
              </Box>
            )}
            {/* Bulk actions for Items tab */}
            {activeTab === 1 && selectedItemIds.length > 0 && (
              <Box sx={{ ml: 'auto', mr: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                <Chip label={`${selectedItemIds.length} selected`} size="small" color="primary" />
                <Button size="small" variant="contained" onClick={() => setBulkDialogOpen(true)}>
                  Bulk Check-In
                </Button>
              </Box>
            )}
            {/* Bulk actions for Checked In tab */}
            {activeTab === 2 && selectedCheckedInIds.length > 0 && (
              <Box sx={{ ml: 'auto', mr: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip label={`${selectedCheckedInIds.length} selected`} size="small" color="primary" />
                <Button size="small" variant="outlined" onClick={() => setCheckedInBulkDialogOpen(true)}>
                  Set Condition / Location / Price
                </Button>
                <Button size="small" variant="outlined" color="warning" onClick={handleCheckedInBulkUncheckIn}
                  disabled={bulkUncheckInMutation.isPending}>
                  Uncheck In
                </Button>
              </Box>
            )}
          </Box>

          <CardContent sx={{ p: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Batch apply toolbar (Batches + Items tabs) */}
            {(activeTab === 0 || activeTab === 1) && (
              <Box
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  px: 2,
                  py: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  flexShrink: 0,
                }}
              >
                <TextField
                  select
                  size="small"
                  label="Condition"
                  value={batchApplyForm.condition}
                  onChange={(e) => setBatchApplyForm((p) => ({ ...p, condition: e.target.value }))}
                  sx={{ minWidth: 120 }}
                >
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="new">New</MenuItem>
                  <MenuItem value="like_new">Like New</MenuItem>
                  <MenuItem value="good">Good</MenuItem>
                  <MenuItem value="fair">Fair</MenuItem>
                  <MenuItem value="salvage">Salvage</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  label="Location"
                  value={batchApplyForm.location}
                  onChange={(e) => setBatchApplyForm((p) => ({ ...p, location: e.target.value }))}
                  sx={{ minWidth: 100 }}
                />
                <TextField
                  size="small"
                  label="Price"
                  type="number"
                  value={batchApplyForm.price}
                  onChange={(e) => setBatchApplyForm((p) => ({ ...p, price: e.target.value }))}
                  slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
                  sx={{ minWidth: 80 }}
                />
                {activeTab === 0 && (
                  <Button size="small" variant="outlined" onClick={handleBatchApplyToBatches}
                    disabled={batchQueue.length === 0}>
                    {selectedBatchIds.length > 0
                      ? `Apply to ${selectedBatchIds.length} selected`
                      : 'Apply to visible batches'}
                  </Button>
                )}
                {activeTab === 1 && (
                  <Button size="small" variant="outlined" onClick={handleBatchApplyToItems}
                    disabled={individualQueue.length === 0 || bulkCheckIn.isPending}>
                    Apply to visible items
                  </Button>
                )}
              </Box>
            )}

            {/* Batches tab */}
            {activeTab === 0 && (
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <DataGrid
                  rows={batchQueue}
                  columns={batchColumnState.columns}
                  onColumnWidthChange={batchColumnState.onColumnWidthChange}
                  processRowUpdate={async (newRow: BatchGroup) => {
                    await updateBatchGroup.mutateAsync({
                      id: newRow.id,
                      data: {
                        condition: newRow.condition || undefined,
                        location: newRow.location,
                        unit_price: newRow.unit_price ?? undefined,
                      },
                    });
                    return newRow;
                  }}
                  onProcessRowUpdateError={(err) => enqueueSnackbar(err.message || 'Update failed', { variant: 'error' })}
                  loading={batchLoading}
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  getRowId={(row: BatchGroup) => row.id}
                  onRowClick={(params) => openBatchDrawer(params.row as BatchGroup)}
                  checkboxSelection
                  rowSelectionModel={{ type: 'include' as const, ids: new Set(selectedBatchIds) }}
                  onRowSelectionModelChange={(model) => setSelectedBatchIds(Array.from(model.ids).map(Number))}
                  sx={{ border: 'none', cursor: 'pointer', height: '100%' }}
                  density="compact"
                />
              </Box>
            )}

            {/* Items tab */}
            {activeTab === 1 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <Box sx={{ px: 2, pt: 1.5, pb: 0.5, flexShrink: 0 }}>
                  {/* Filter is now the general search in header */}
                </Box>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <DataGrid
                    rows={individualQueue}
                    columns={itemColumnState.columns}
                    onColumnWidthChange={itemColumnState.onColumnWidthChange}
                    processRowUpdate={async (newRow: Item) => {
                      await updateItem.mutateAsync({
                        id: newRow.id,
                        data: {
                          condition: newRow.condition || undefined,
                          location: newRow.location,
                          price: newRow.price ?? undefined,
                        },
                      });
                      return newRow;
                    }}
                    onProcessRowUpdateError={(err) => enqueueSnackbar(err.message || 'Update failed', { variant: 'error' })}
                    loading={itemsLoading}
                    pageSizeOptions={[10, 25, 50]}
                    initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                    getRowId={(row: Item) => row.id}
                    onRowClick={(params) => openItemDrawer(params.row as Item)}
                    checkboxSelection
                    rowSelectionModel={{ type: 'include' as const, ids: new Set(selectedItemIds) }}
                    onRowSelectionModelChange={(model) => setSelectedItemIds(Array.from(model.ids).map(Number))}
                    sx={{ border: 'none', cursor: 'pointer', height: '100%' }}
                    density="compact"
                  />
                </Box>
              </Box>
            )}

            {/* Checked In tab */}
            {activeTab === 2 && (
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <DataGrid
                  rows={checkedInItems}
                  columns={checkedInColumnState.columns}
                  onColumnWidthChange={checkedInColumnState.onColumnWidthChange}
                  loading={itemsLoading}
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 10 } },
                    sorting: { sortModel: [{ field: 'checked_in_at', sort: 'desc' }] },
                  }}
                  getRowId={(row: Item) => row.id}
                  checkboxSelection
                  rowSelectionModel={{ type: 'include' as const, ids: new Set(selectedCheckedInIds) }}
                  onRowSelectionModelChange={(model) => setSelectedCheckedInIds(Array.from(model.ids).map(Number))}
                  sx={{ border: 'none', height: '100%' }}
                  density="compact"
                />
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Side Drawer ─────────────────────────────────────────────── */}
      <ProcessingDrawer
        mode={drawerMode}
        item={activeItem}
        batch={activeBatch}
        form={form}
        onFormChange={setForm}
        printOnCheckIn={printOnCheckIn}
        onPrintToggle={setPrintOnCheckIn}
        onClose={closeDrawer}
        onSave={handleSave}
        onCheckIn={handleCheckIn}
        onSkipNext={advanceToNext}
        onCopyLast={handleCopyLast}
        onReprint={handleReprint}
        saving={updateItem.isPending || updateBatchGroup.isPending}
        checkingIn={checkInItem.isPending || checkInBatchGroup.isPending}
        hasLastItem={lastCheckedIn != null}
        autoAdvance={autoAdvance}
        batchItemCount={activeBatch?.intake_items_count ?? 0}
        justCheckedIn={justCheckedIn}
        onMarkBroken={drawerMode === 'item' ? handleMarkBroken : undefined}
        batchPendingItems={batchPendingItems}
        batchCheckedInItems={batchCheckedInItems}
        onOpenBatchItem={openItemDrawer}
        onUncheckInItem={handleUncheckInBatchItem}
      />

      {/* ── Detach confirmation dialog ──────────────────────────────── */}
      {(() => {
        const detachMax = batchGroups.find((b) => b.id === detachBatchId)?.intake_items_count ?? 1;
        return (
          <Dialog
            open={detachDialogOpen}
            onClose={() => { setDetachDialogOpen(false); setDetachBatchId(null); setDetachCount(1); }}
            maxWidth="xs"
          >
            <DialogTitle>Detach Items</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>
                Remove items from this batch and move them to individual processing.
              </DialogContentText>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Number of items"
                value={detachCount}
                onChange={(e) => setDetachCount(Math.max(1, Math.min(detachMax, parseInt(e.target.value, 10) || 1)))}
                slotProps={{ input: { inputProps: { min: 1, max: detachMax } } }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => { setDetachDialogOpen(false); setDetachBatchId(null); setDetachCount(1); }}>
                Cancel
              </Button>
              <Button
                variant="contained"
                color="warning"
                onClick={confirmDetach}
                disabled={detachBatchItem.isPending}
              >
                {detachBatchItem.isPending ? 'Detaching...' : `Detach ${detachCount}`}
              </Button>
            </DialogActions>
          </Dialog>
        );
      })()}

      {/* ── Settings modal ───────────────────────────────────────────── */}
      <ProcessingSettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        autoAdvance={autoAdvance}
        onAutoAdvanceChange={setAutoAdvance}
        printOnCheckIn={printOnCheckIn}
        onPrintOnCheckInChange={setPrintOnCheckIn}
        stickyCondition={loadStickyDefaults().condition ?? ''}
        stickyLocation={loadStickyDefaults().location ?? ''}
        onStickyChange={saveStickyDefaults}
      />

      {/* ── Bulk Check-In Dialog ─────────────────────────────────────── */}
      <Dialog open={bulkDialogOpen} onClose={() => setBulkDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Bulk Check-In ({selectedItemIds.length} items)</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Apply shared overrides to all selected items and check them in. Leave fields blank to keep existing values.
          </DialogContentText>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField select size="small" label="Condition" value={bulkForm.condition}
              onChange={(e) => setBulkForm((p) => ({ ...p, condition: e.target.value }))}>
              <MenuItem value="">Keep existing</MenuItem>
              <MenuItem value="new">New</MenuItem>
              <MenuItem value="like_new">Like New</MenuItem>
              <MenuItem value="good">Good</MenuItem>
              <MenuItem value="fair">Fair</MenuItem>
              <MenuItem value="salvage">Salvage</MenuItem>
            </TextField>
            <TextField size="small" label="Location" value={bulkForm.location}
              onChange={(e) => setBulkForm((p) => ({ ...p, location: e.target.value }))} />
            <TextField size="small" label="Price Override" type="number" value={bulkForm.price}
              onChange={(e) => setBulkForm((p) => ({ ...p, price: e.target.value }))}
              slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }} />
            <TextField size="small" label="Cost Override" type="number" value={bulkForm.cost}
              onChange={(e) => setBulkForm((p) => ({ ...p, cost: e.target.value }))}
              slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleBulkCheckIn}
            disabled={bulkCheckIn.isPending}
            startIcon={bulkCheckIn.isPending ? <CircularProgress size={14} color="inherit" /> : <CheckCircleOutline />}>
            {bulkCheckIn.isPending ? 'Checking in...' : `Check In ${selectedItemIds.length} Items`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Checked In bulk update dialog ───────────────────────────── */}
      <Dialog open={checkedInBulkDialogOpen} onClose={() => setCheckedInBulkDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Update {selectedCheckedInIds.length} item(s)</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Set condition, location, and/or price for all selected checked-in items. Leave blank to keep existing.
          </DialogContentText>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField select size="small" label="Condition" value={checkedInBulkForm.condition}
              onChange={(e) => setCheckedInBulkForm((p) => ({ ...p, condition: e.target.value }))} fullWidth>
              <MenuItem value="">Keep existing</MenuItem>
              <MenuItem value="new">New</MenuItem>
              <MenuItem value="like_new">Like New</MenuItem>
              <MenuItem value="good">Good</MenuItem>
              <MenuItem value="fair">Fair</MenuItem>
              <MenuItem value="salvage">Salvage</MenuItem>
              <MenuItem value="unknown">Unknown</MenuItem>
            </TextField>
            <TextField size="small" label="Location" value={checkedInBulkForm.location}
              onChange={(e) => setCheckedInBulkForm((p) => ({ ...p, location: e.target.value }))} fullWidth />
            <TextField size="small" label="Price" type="number" value={checkedInBulkForm.price}
              onChange={(e) => setCheckedInBulkForm((p) => ({ ...p, price: e.target.value }))}
              slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }} fullWidth />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCheckedInBulkDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCheckedInBulkUpdate}
            disabled={!checkedInBulkForm.condition && !checkedInBulkForm.location && !checkedInBulkForm.price}>
            Apply to selected
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
