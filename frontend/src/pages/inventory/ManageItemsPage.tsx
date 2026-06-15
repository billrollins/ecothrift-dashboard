import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { Box, Button, Chip, Typography } from '@mui/material';
import { getItems, getProduct } from '../../api/inventory.api';
import type { Item, Product } from '../../types/inventory.types';
import { productManageCatalogSearchTerm } from '../../utils/productCatalog';
import { ProcessingScanBar } from './processing/ProcessingScanBar';
import { CatalogFilterRow } from './manage/CatalogFilterRow';
import { ItemCatalogTable } from './manage/ItemCatalogTable';
import { ItemManagePanel } from './manage/ItemManageDrawer';
import { ProductManagePanel } from './manage/ProductManageDrawer';

const ITEM_CATALOG_PAGE_SIZE = 200;

function parseIdsParam(raw: string): number[] {
  const out: number[] = [];
  for (const part of raw.split(',')) {
    const n = Number.parseInt(part.trim(), 10);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export default function ManageItemsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editorActive, setEditorActive] = useState(false);
  const [productCreateOpen, setProductCreateOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<Item | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 450);
    return () => window.clearTimeout(t);
  }, [search]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (!value.trim()) setDebouncedSearch('');
  }, []);

  const handleSearchEnter = useCallback(() => {
    const q = search.trim();
    if (!q) return;
    setDebouncedSearch(q);
  }, [search]);

  const querySearch = debouncedSearch.trim();
  const productFilter = searchParams.get('product') || searchParams.get('product_id') || '';
  const statusFilter = searchParams.get('status') || '';
  const batchFilter = searchParams.get('batch') || '';
  const idsFilter = batchFilter ? '' : (searchParams.get('ids') || '');
  const idsList = useMemo(() => parseIdsParam(idsFilter), [idsFilter]);

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ['items', 'manage-catalog', querySearch, productFilter, statusFilter, batchFilter, idsFilter],
    queryFn: async () => {
      const { data: page } = await getItems({
        search: querySearch || undefined,
        product: productFilter || undefined,
        status: statusFilter || undefined,
        batch: batchFilter || undefined,
        ids: idsFilter || undefined,
        ordering: '-checked_in_at,-id',
        page_size: ITEM_CATALOG_PAGE_SIZE,
      });
      return page;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const productLabelQuery = useQuery({
    queryKey: ['products', 'manage-items-filter', productFilter],
    queryFn: async () => {
      const { data: product } = await getProduct(Number(productFilter));
      return product;
    },
    enabled: Boolean(productFilter),
    staleTime: 60_000,
  });

  const items = data?.results ?? [];
  const totalCount = data?.count ?? items.length;

  const clearUrlFilter = (key: 'product' | 'status' | 'ids' | 'batch') => {
    const next = new URLSearchParams(searchParams);
    if (key === 'product') {
      next.delete('product');
      next.delete('product_id');
    } else {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const filterChips = (
    <>
      {batchFilter ?
        <Chip
          size="small"
          label={`Check-in batch${totalCount ? ` (${totalCount} item${totalCount === 1 ? '' : 's'})` : ''}`}
          onDelete={() => clearUrlFilter('batch')}
          deleteIcon={<CloseOutlinedIcon />}
          color="primary"
          variant="outlined"
        />
      : null}
      {!batchFilter && idsList.length ?
        <Chip
          size="small"
          label={`Created batch (${idsList.length} item${idsList.length === 1 ? '' : 's'})`}
          onDelete={() => clearUrlFilter('ids')}
          deleteIcon={<CloseOutlinedIcon />}
          color="primary"
          variant="outlined"
        />
      : null}
      {productFilter ?
        <Chip
          size="small"
          label={`Product: ${productLabelQuery.data?.title || productLabelQuery.data?.product_number || `#${productFilter}`}`}
          onDelete={() => clearUrlFilter('product')}
          deleteIcon={<CloseOutlinedIcon />}
          variant="outlined"
        />
      : null}
      {statusFilter ?
        <Chip
          size="small"
          label={`Status: ${statusFilter.replace(/_/g, ' ')}`}
          onDelete={() => clearUrlFilter('status')}
          deleteIcon={<CloseOutlinedIcon />}
          variant="outlined"
        />
      : null}
    </>
  );

  const openCreate = () => {
    setProductCreateOpen(true);
  };

  const openEdit = (item: Item) => {
    setActiveItem(item);
    setEditorActive(true);
  };

  const resetEditor = () => {
    setActiveItem(null);
    setEditorActive(false);
  };

  const handleProductCreated = useCallback(
    (product: Product) => {
      const q = productManageCatalogSearchTerm(product);
      navigate(`/inventory/manage-products?${new URLSearchParams({ q }).toString()}`);
    },
    [navigate],
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
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          px: 2,
          py: 1.5,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Manage items
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Item owns the physical unit: SKU, status, price, retail, location, source, condition, and notes.
            </Typography>
          </Box>
          <Button startIcon={<AddOutlinedIcon />} variant="contained" onClick={openCreate}>
            New item
          </Button>
        </Box>
      </Box>

      <Box sx={{ flexShrink: 0 }}>
        <ProcessingScanBar
          search={search}
          onSearchChange={handleSearchChange}
          onSearchEnter={handleSearchEnter}
          isFetching={isFetching && !isLoading}
          mode="queue"
          placeholder="Search SKU, title, brand, UPC, location, product #, model..."
          ariaLabel="Search items"
        />
      </Box>

      <Box sx={{ flexShrink: 0 }}>
        <CatalogFilterRow
          totalCount={totalCount}
          shownCount={items.length}
          search={querySearch}
          isFetching={isFetching && !isLoading}
          entityPlural="items"
          filterChips={filterChips}
        />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex' }}>
        <ItemCatalogTable items={items} search={querySearch} onOpenItem={openEdit} />
      </Box>

      <ItemManagePanel open={editorActive} item={activeItem} onCancel={resetEditor} />
      <ProductManagePanel
        open={productCreateOpen}
        initialProduct={null}
        onClose={() => setProductCreateOpen(false)}
        onProductSaved={(product, ctx) => {
          if (ctx.created) handleProductCreated(product);
        }}
      />
    </Box>
  );
}
