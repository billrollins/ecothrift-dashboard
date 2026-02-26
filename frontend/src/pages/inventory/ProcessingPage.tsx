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
  Popover,
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
  DRAWER_WIDTH,
  type DrawerMode,
  type ProcessingFormState,
} from '../../components/inventory/ProcessingDrawer';
import { ProcessingStatsBar } from '../../components/inventory/ProcessingStatsBar';
import {
  useBatchGroups,
  useCheckInBatchGroup,
  useCheckInItem,
  useCheckInOrderItems,
  useCreateItems,
  useDetachBatchItem,
  useItems,
  useMarkOrderComplete,
  usePurchaseOrder,
  usePurchaseOrders,
  useUpdateBatchGroup,
  useUpdateItem,
} from '../../hooks/useInventory';
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
  item: Pick<Item, 'sku' | 'title' | 'price'>,
  priceOverride?: string,
): Promise<boolean> {
  try {
    const price = priceOverride || item.price;
    await localPrintService.printLabel({
      text: price ? `$${Number.parseFloat(price).toFixed(2)}` : '$0.00',
      qr_data: item.sku,
      product_title: item.title,
      include_text: true,
    });
    return true;
  } catch {
    return false;
  }
}

async function printBatchLabels(
  items: Pick<Item, 'sku' | 'title' | 'price'>[],
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

  // Detach confirmation
  const [detachAnchor, setDetachAnchor] = useState<HTMLElement | null>(null);
  const [detachBatchId, setDetachBatchId] = useState<number | null>(null);

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: ordersData } = usePurchaseOrders({ status__in: 'delivered,processing,complete' });
  const { data: order } = usePurchaseOrder(selectedOrderId);
  const { data: batchGroupsData, isLoading: batchLoading } = useBatchGroups(
    { purchase_order: selectedOrderId },
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

  const handlePrint = useCallback(async (item: Pick<Item, 'sku' | 'title' | 'price'>, priceOverride?: string) => {
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

  const handleCheckIn = useCallback(async () => {
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
          await handlePrint({ sku: checkedIn.sku, title: checkedIn.title, price: checkedIn.price });
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
      try {
        const result = await checkInBatchGroup.mutateAsync({
          id: activeBatch.id,
          data: {
            unit_price: form.price || undefined, unit_cost: form.cost || undefined,
            condition: form.condition || undefined, location: form.location,
          },
        });
        saveStickyDefaults(form.condition, form.location);
        setLastCheckedIn({ ...form });
        setSessionCount((c) => c + (result.checked_in ?? batchItems.length));
        enqueueSnackbar(
          `Checked in ${result.checked_in} item(s) from ${activeBatch.batch_number}`,
          { variant: 'success' },
        );

        if (printOnCheckIn && batchItems.length > 0) {
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
      await handlePrint({ sku: activeItem.sku, title: activeItem.title, price: activeItem.price });
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

  // ─── Detach handler ─────────────────────────────────────────────────────────

  const confirmDetach = useCallback(async () => {
    if (detachBatchId == null) return;
    try {
      const result = await detachBatchItem.mutateAsync({ id: detachBatchId });
      enqueueSnackbar(`Detached ${result.detached_item_sku}`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to detach item from batch', { variant: 'error' });
    }
    setDetachAnchor(null);
    setDetachBatchId(null);
  }, [detachBatchId, detachBatchItem, enqueueSnackbar]);

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
      }

      if (!isInput && !drawerMode) {
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          advanceToNext();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerMode, closeDrawer, handleCheckIn, handleReprint, advanceToNext]);

  // ─── Column definitions ─────────────────────────────────────────────────────

  const batchColumns: GridColDef[] = useMemo(() => [
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
      field: 'unit_price', headerName: 'Price', width: 90,
      renderCell: (params: GridRenderCellParams<BatchGroup>) => <>{formatCurrency(params.row.unit_price)}</>,
    },
    { field: 'condition', headerName: 'Condition', width: 100 },
    { field: 'location', headerName: 'Location', width: 100 },
    {
      field: 'actions', headerName: 'Actions', width: 180, sortable: false, filterable: false,
      renderCell: (params: GridRenderCellParams<BatchGroup>) => (
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Button size="small" variant="contained" startIcon={<Tune />}
            onClick={(e) => { e.stopPropagation(); openBatchDrawer(params.row); }}>
            Process
          </Button>
          <Tooltip title="Detach one item to individual processing">
            <IconButton size="small" color="warning"
              onClick={(e) => {
                e.stopPropagation();
                setDetachAnchor(e.currentTarget);
                setDetachBatchId(params.row.id);
              }}
              disabled={detachBatchItem.isPending}>
              <CallSplit fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ], [openBatchDrawer, detachBatchItem.isPending]);

  const itemColumns: GridColDef[] = useMemo(() => [
    {
      field: 'sku', headerName: 'SKU', width: 120,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
          {params.row.sku}
        </Typography>
      ),
    },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 160 },
    { field: 'brand', headerName: 'Brand', width: 100 },
    {
      field: 'condition', headerName: 'Condition', width: 100,
      renderCell: (params: GridRenderCellParams<Item>) => {
        const val = params.row.condition;
        return val && val !== 'unknown'
          ? <Chip label={val.replace('_', ' ')} size="small" variant="outlined" />
          : <Typography variant="body2" color="text.secondary">--</Typography>;
      },
    },
    {
      field: 'price', headerName: 'Price', width: 85,
      renderCell: (params: GridRenderCellParams<Item>) => <>{formatCurrency(params.row.price)}</>,
    },
    { field: 'location', headerName: 'Location', width: 90 },
    {
      field: 'actions', headerName: 'Actions', width: 100, sortable: false, filterable: false,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <Button size="small" variant="contained" startIcon={<Tune />}
          onClick={(e) => { e.stopPropagation(); openItemDrawer(params.row); }}>
          Process
        </Button>
      ),
    },
  ], [openItemDrawer]);

  const checkedInColumns: GridColDef[] = useMemo(() => [
    {
      field: 'sku', headerName: 'SKU', width: 120,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
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
    {
      field: 'actions', headerName: '', width: 60, sortable: false, filterable: false,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <Tooltip title="Reprint label">
          <IconButton size="small"
            onClick={(e) => {
              e.stopPropagation();
              handlePrint({ sku: params.row.sku, title: params.row.title, price: params.row.price });
            }}>
            <LocalPrintshop fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ], [handlePrint]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading && !order && selectedOrderId) return <LoadingScreen />;

  return (
    <Box>
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
            sx={{ minWidth: 300, flexShrink: 0 }}
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
        <Card sx={{ mb: 2 }}>
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

            {/* Bulk actions for Items tab */}
            {activeTab === 1 && selectedItemIds.length > 0 && (
              <Box sx={{ ml: 'auto', mr: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                <Chip label={`${selectedItemIds.length} selected`} size="small" color="primary" />
                <Button size="small" variant="contained" onClick={() => setBulkDialogOpen(true)}>
                  Bulk Check-In
                </Button>
              </Box>
            )}
          </Box>

          <CardContent sx={{ p: 0 }}>
            {/* Batches tab */}
            {activeTab === 0 && (
              <Box sx={{ height: 440 }}>
                <DataGrid
                  rows={batchQueue}
                  columns={batchColumns}
                  loading={batchLoading}
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  getRowId={(row: BatchGroup) => row.id}
                  onRowClick={(params) => openBatchDrawer(params.row as BatchGroup)}
                  sx={{ border: 'none', cursor: 'pointer' }}
                  density="compact"
                />
              </Box>
            )}

            {/* Items tab */}
            {activeTab === 1 && (
              <Box>
                <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
                  <TextField
                    size="small"
                    placeholder="Filter items..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ maxWidth: 300 }}
                    slotProps={{
                      input: {
                        startAdornment: <Search fontSize="small" sx={{ mr: 0.75, color: 'text.secondary' }} />,
                      },
                    }}
                  />
                </Box>
                <Box sx={{ height: 440 }}>
                  <DataGrid
                    rows={individualQueue}
                    columns={itemColumns}
                    loading={itemsLoading}
                    pageSizeOptions={[10, 25, 50]}
                    initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                    getRowId={(row: Item) => row.id}
                    onRowClick={(params) => openItemDrawer(params.row as Item)}
                    checkboxSelection
                    rowSelectionModel={{ type: 'include' as const, ids: new Set(selectedItemIds) }}
                    onRowSelectionModelChange={(model) => setSelectedItemIds(Array.from(model.ids).map(Number))}
                    sx={{ border: 'none', cursor: 'pointer' }}
                    density="compact"
                  />
                </Box>
              </Box>
            )}

            {/* Checked In tab */}
            {activeTab === 2 && (
              <Box sx={{ height: 440 }}>
                <DataGrid
                  rows={checkedInItems}
                  columns={checkedInColumns}
                  loading={itemsLoading}
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 10 } },
                    sorting: { sortModel: [{ field: 'checked_in_at', sort: 'desc' }] },
                  }}
                  getRowId={(row: Item) => row.id}
                  sx={{ border: 'none' }}
                  density="compact"
                />
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Session Stats Bar ───────────────────────────────────────── */}
      {selectedOrderId && (
        <ProcessingStatsBar
          sessionCheckedIn={sessionCount}
          sessionStartTime={sessionStartRef.current}
          totalPending={pendingCount}
          autoAdvance={autoAdvance}
          onAutoAdvanceToggle={setAutoAdvance}
        />
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
      />

      {/* ── Detach confirmation popover ──────────────────────────────── */}
      <Popover
        open={detachAnchor != null}
        anchorEl={detachAnchor}
        onClose={() => { setDetachAnchor(null); setDetachBatchId(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Box sx={{ p: 2, maxWidth: 260 }}>
          <Typography variant="subtitle2" gutterBottom>Detach Item?</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            This will remove one item from the batch and move it to individual processing.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => { setDetachAnchor(null); setDetachBatchId(null); }}>
              Cancel
            </Button>
            <Button size="small" variant="contained" color="warning" onClick={confirmDetach}
              disabled={detachBatchItem.isPending}>
              Detach
            </Button>
          </Box>
        </Box>
      </Popover>

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
    </Box>
  );
}
