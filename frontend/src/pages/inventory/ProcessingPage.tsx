import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  LinearProgress,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import TaskAlt from '@mui/icons-material/TaskAlt';
import Tune from '@mui/icons-material/Tune';
import CallSplit from '@mui/icons-material/CallSplit';
import OpenInNew from '@mui/icons-material/OpenInNew';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import { DataGrid, type GridColDef, type GridRenderCellParams } from '@mui/x-data-grid';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useBatchGroups,
  useCheckInBatchGroup,
  useCheckInItem,
  useCreateItems,
  useDetachBatchItem,
  useItems,
  useMarkOrderComplete,
  usePurchaseOrder,
  usePurchaseOrders,
  useUpdateBatchGroup,
  useUpdateItem,
} from '../../hooks/useInventory';
import { localPrintService } from '../../services/localPrintService';
import type { BatchGroup, Item, PurchaseOrderStatus } from '../../types/inventory.types';

type DialogMode = 'item' | 'batch' | null;

type ProcessingFormState = {
  title: string;
  brand: string;
  category: string;
  condition: string;
  location: string;
  price: string;
  cost: string;
  notes: string;
};

const STATUS_COLOR: Record<
  PurchaseOrderStatus,
  'default' | 'primary' | 'warning' | 'success' | 'error'
> = {
  ordered: 'default',
  paid: 'default',
  shipped: 'primary',
  delivered: 'warning',
  processing: 'primary',
  complete: 'success',
  cancelled: 'error',
};

function formatCurrency(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? '—' : `$${parsed.toFixed(2)}`;
}

function buildItemForm(item: Item): ProcessingFormState {
  return {
    title: item.title || '',
    brand: item.brand || '',
    category: item.category || '',
    condition: item.condition || 'unknown',
    location: item.location || '',
    price: item.price || '',
    cost: item.cost || '',
    notes: item.notes || '',
  };
}

function buildBatchForm(batch: BatchGroup): ProcessingFormState {
  return {
    title: '',
    brand: '',
    category: '',
    condition: batch.condition || 'unknown',
    location: batch.location || '',
    price: batch.unit_price || '',
    cost: batch.unit_cost || '',
    notes: batch.notes || '',
  };
}

const EMPTY_FORM: ProcessingFormState = {
  title: '',
  brand: '',
  category: '',
  condition: 'unknown',
  location: '',
  price: '',
  cost: '',
  notes: '',
};

export default function ProcessingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderParam = searchParams.get('order');
  const { enqueueSnackbar } = useSnackbar();

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(
    orderParam ? Number.parseInt(orderParam, 10) : null,
  );
  const [search, setSearch] = useState('');
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [activeBatch, setActiveBatch] = useState<BatchGroup | null>(null);
  const [form, setForm] = useState<ProcessingFormState>(EMPTY_FORM);
  const [printOnCheckIn, setPrintOnCheckIn] = useState(true);

  const { data: ordersData } = usePurchaseOrders({
    status__in: 'delivered,processing,complete',
  });
  const { data: order } = usePurchaseOrder(selectedOrderId);
  const { data: batchGroupsData, isLoading: batchLoading } = useBatchGroups(
    selectedOrderId ? { purchase_order: selectedOrderId } : undefined,
  );
  const { data: itemsData, isLoading: itemsLoading } = useItems(
    selectedOrderId
      ? {
          purchase_order: selectedOrderId,
          page_size: 500,
          ...(search ? { search } : {}),
        }
      : undefined,
  );

  const updateItem = useUpdateItem();
  const checkInItem = useCheckInItem();
  const createItemsMutation = useCreateItems();
  const updateBatchGroup = useUpdateBatchGroup();
  const checkInBatchGroup = useCheckInBatchGroup();
  const detachBatchItem = useDetachBatchItem();
  const markComplete = useMarkOrderComplete();

  const orders = ordersData?.results ?? [];
  const items = itemsData?.results ?? [];
  const batchGroups = batchGroupsData?.results ?? [];

  const stats = order?.processing_stats;
  const onShelf = stats?.item_status_counts?.on_shelf ?? 0;
  const pendingCount = stats?.pending_items ?? 0;
  const totalTracked = onShelf + pendingCount;
  const progressValue = totalTracked > 0 ? (onShelf / totalTracked) * 100 : 0;

  const pendingItems = useMemo(
    () => items.filter((item) => ['intake', 'processing'].includes(item.status)),
    [items],
  );
  const individualQueue = useMemo(
    () => pendingItems.filter((item) => item.processing_tier === 'individual' || !item.batch_group),
    [pendingItems],
  );
  const batchQueue = useMemo(
    () => batchGroups.filter((group) => (group.intake_items_count ?? 0) > 0 || group.status !== 'complete'),
    [batchGroups],
  );

  // Pipeline state checks
  const queueNotBuilt = order != null
    && order.status === 'delivered'
    && (order.item_count === 0 || (!itemsLoading && items.length === 0));
  const allCheckedIn = order != null
    && pendingCount === 0
    && onShelf > 0
    && order.item_count > 0;

  const loading = batchLoading || itemsLoading;
  if (loading && !order && selectedOrderId) return <LoadingScreen />;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const openItemDialog = (item: Item) => {
    setDialogMode('item');
    setActiveItem(item);
    setActiveBatch(null);
    setForm(buildItemForm(item));
  };

  const openBatchDialog = (batch: BatchGroup) => {
    setDialogMode('batch');
    setActiveBatch(batch);
    setActiveItem(null);
    setForm(buildBatchForm(batch));
  };

  const closeDialog = () => {
    setDialogMode(null);
    setActiveItem(null);
    setActiveBatch(null);
    setForm(EMPTY_FORM);
  };

  const printLabel = async (item: Pick<Item, 'sku' | 'title' | 'price'>) => {
    const available = await localPrintService.isAvailable();
    if (!available) {
      enqueueSnackbar('Print server unavailable — item checked in without printing.', {
        variant: 'warning',
      });
      return;
    }
    try {
      await localPrintService.printLabel({
        text: item.price ? `$${Number.parseFloat(item.price).toFixed(2)}` : '$0.00',
        qr_data: item.sku,
        product_title: item.title,
        include_text: true,
      });
    } catch {
      enqueueSnackbar(`Failed printing label for ${item.sku}`, { variant: 'error' });
    }
  };

  const handleSaveFieldsOnly = async () => {
    if (dialogMode === 'item' && activeItem) {
      try {
        await updateItem.mutateAsync({
          id: activeItem.id,
          data: {
            title: form.title,
            brand: form.brand,
            category: form.category,
            condition: form.condition,
            location: form.location,
            price: form.price || undefined,
            cost: form.cost || undefined,
            notes: form.notes,
          },
        });
        enqueueSnackbar(`Updated ${activeItem.sku}`, { variant: 'success' });
        closeDialog();
      } catch {
        enqueueSnackbar('Failed to save item updates', { variant: 'error' });
      }
      return;
    }

    if (dialogMode === 'batch' && activeBatch) {
      try {
        await updateBatchGroup.mutateAsync({
          id: activeBatch.id,
          data: {
            unit_price: form.price || undefined,
            unit_cost: form.cost || undefined,
            condition: form.condition || undefined,
            location: form.location,
            notes: form.notes,
          },
        });
        enqueueSnackbar(`Updated ${activeBatch.batch_number}`, { variant: 'success' });
        closeDialog();
      } catch {
        enqueueSnackbar('Failed to save batch updates', { variant: 'error' });
      }
    }
  };

  const handleCheckInAndPrint = async () => {
    if (dialogMode === 'item' && activeItem) {
      try {
        const checkedIn = await checkInItem.mutateAsync({
          id: activeItem.id,
          data: {
            title: form.title,
            brand: form.brand,
            category: form.category,
            condition: form.condition,
            location: form.location,
            price: form.price || undefined,
            cost: form.cost || undefined,
            notes: form.notes,
          },
        });
        enqueueSnackbar(`Checked in ${checkedIn.sku}`, { variant: 'success' });
        if (printOnCheckIn) {
          await printLabel({ sku: checkedIn.sku, title: checkedIn.title, price: checkedIn.price });
        }
        closeDialog();
      } catch {
        enqueueSnackbar('Failed to check in item', { variant: 'error' });
      }
      return;
    }

    if (dialogMode === 'batch' && activeBatch) {
      const printQueue = pendingItems.filter(
        (item) => item.batch_group === activeBatch.id && ['intake', 'processing'].includes(item.status),
      );
      try {
        const result = await checkInBatchGroup.mutateAsync({
          id: activeBatch.id,
          data: {
            unit_price: form.price || undefined,
            unit_cost: form.cost || undefined,
            condition: form.condition || undefined,
            location: form.location,
          },
        });
        enqueueSnackbar(
          `Checked in ${result.checked_in} item(s) from ${activeBatch.batch_number}`,
          { variant: 'success' },
        );
        if (printOnCheckIn) {
          for (const item of printQueue) {
            await printLabel({ sku: item.sku, title: item.title, price: form.price || item.price });
          }
        }
        closeDialog();
      } catch {
        enqueueSnackbar('Failed to check in batch', { variant: 'error' });
      }
    }
  };

  const handleDetachOne = async (batchId: number) => {
    try {
      const result = await detachBatchItem.mutateAsync({ id: batchId });
      enqueueSnackbar(`Detached ${result.detached_item_sku}`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to detach item from batch', { variant: 'error' });
    }
  };

  const handleMarkComplete = async () => {
    if (!selectedOrderId) return;
    try {
      await markComplete.mutateAsync(selectedOrderId);
      enqueueSnackbar('Order marked complete!', { variant: 'success' });
    } catch (err: unknown) {
      const detail =
        err != null &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      enqueueSnackbar(detail || 'Failed to mark order complete', { variant: 'error' });
    }
  };

  // ─── Column definitions ────────────────────────────────────────────────────

  const batchColumns: GridColDef[] = [
    { field: 'batch_number', headerName: 'Batch', width: 130 },
    { field: 'product_number', headerName: 'Product #', width: 120 },
    { field: 'product_title', headerName: 'Product', flex: 1, minWidth: 180 },
    { field: 'total_qty', headerName: 'Qty', width: 70 },
    { field: 'intake_items_count', headerName: 'Pending', width: 90 },
    {
      field: 'unit_price',
      headerName: 'Unit Price',
      width: 110,
      renderCell: (params: GridRenderCellParams<BatchGroup>) => (
        <>{formatCurrency(params.row.unit_price)}</>
      ),
    },
    { field: 'condition', headerName: 'Condition', width: 110 },
    { field: 'location', headerName: 'Location', width: 120 },
    {
      field: 'actions',
      headerName: '',
      width: 200,
      sortable: false,
      filterable: false,
      renderCell: (params: GridRenderCellParams<BatchGroup>) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="contained"
            startIcon={<Tune />}
            onClick={(e) => { e.stopPropagation(); openBatchDialog(params.row); }}
          >
            Process
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={<CallSplit />}
            onClick={(e) => { e.stopPropagation(); handleDetachOne(params.row.id); }}
            disabled={detachBatchItem.isPending}
          >
            Detach 1
          </Button>
        </Box>
      ),
    },
  ];

  const itemColumns: GridColDef[] = [
    { field: 'sku', headerName: 'SKU', width: 130 },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 180 },
    {
      field: 'batch_group_number',
      headerName: 'Batch',
      width: 110,
      valueGetter: (_v, row) => row.batch_group_number || '—',
    },
    { field: 'condition', headerName: 'Condition', width: 110 },
    {
      field: 'price',
      headerName: 'Price',
      width: 90,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <>{formatCurrency(params.row.price)}</>
      ),
    },
    { field: 'location', headerName: 'Location', width: 110 },
    { field: 'status', headerName: 'Status', width: 100 },
    {
      field: 'checked_in_at',
      headerName: 'Checked In',
      width: 145,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <>
          {params.row.checked_in_at
            ? format(new Date(params.row.checked_in_at), 'MM/dd h:mm a')
            : '—'}
        </>
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <Button
          size="small"
          variant="contained"
          startIcon={<Tune />}
          onClick={(e) => { e.stopPropagation(); openItemDialog(params.row); }}
        >
          Process
        </Button>
      ),
    },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Box>
      <PageHeader
        title="Processing Workspace"
        subtitle="Finalize details, check in inventory, and print tags"
      />

      {/* Order selector + context card */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="flex-start">
            <Grid size={{ xs: 12, md: 5 }}>
              <TextField
                fullWidth
                select
                label="Purchase Order"
                value={selectedOrderId ?? ''}
                onChange={(e) =>
                  setSelectedOrderId(e.target.value ? Number.parseInt(e.target.value, 10) : null)}
              >
                <MenuItem value="">Select order</MenuItem>
                {orders.map((o) => (
                  <MenuItem key={o.id} value={o.id}>
                    {o.order_number} — {o.vendor_name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, md: 7 }}>
              {order ? (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {order.vendor_name}
                    </Typography>
                    <Chip
                      label={order.status}
                      size="small"
                      color={STATUS_COLOR[order.status] ?? 'default'}
                    />
                    {order.condition && (
                      <Chip label={order.condition} size="small" variant="outlined" />
                    )}
                    <Button
                      size="small"
                      variant="text"
                      endIcon={<OpenInNew fontSize="small" />}
                      onClick={() => navigate(`/inventory/orders/${order.id}`)}
                      sx={{ ml: 'auto' }}
                    >
                      View Order
                    </Button>
                  </Box>
                  {order.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} noWrap>
                      {order.description}
                    </Typography>
                  )}
                  {order.item_count > 0 && stats && (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                        <LinearProgress
                          variant="determinate"
                          value={progressValue}
                          sx={{ flex: 1, height: 8, borderRadius: 4 }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                          {onShelf} / {order.item_count}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {pendingCount > 0 && (
                          <Chip label={`${pendingCount} pending`} size="small" color="warning" />
                        )}
                        {onShelf > 0 && (
                          <Chip label={`${onShelf} on shelf`} size="small" color="success" />
                        )}
                        {(stats.batch_groups_pending ?? 0) > 0 && (
                          <Chip label={`${stats.batch_groups_pending} batch groups`} size="small" />
                        )}
                      </Box>
                    </>
                  )}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
                  Select a purchase order above to begin processing.
                </Typography>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Smart empty state: queue not built */}
      {selectedOrderId && order && queueNotBuilt && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button
              size="small"
              color="inherit"
              onClick={async () => {
                try {
                  const result = await createItemsMutation.mutateAsync(order.id);
                  enqueueSnackbar(
                    `Created ${result.items_created} item(s), ${result.batch_groups_created} batch(es)`,
                    { variant: 'success' },
                  );
                } catch (err: unknown) {
                  const axiosErr = err as { response?: { data?: { detail?: string } } };
                  enqueueSnackbar(
                    axiosErr?.response?.data?.detail || 'Failed to build check-in queue',
                    { variant: 'error' },
                  );
                }
              }}
              disabled={createItemsMutation.isPending}
            >
              {createItemsMutation.isPending ? 'Building...' : 'Build Check-In Queue'}
            </Button>
          }
        >
          The check-in queue hasn&apos;t been built yet. Click <strong>Build Check-In Queue</strong> to
          create items from the manifest.
        </Alert>
      )}

      {/* Smart empty state: all done */}
      {selectedOrderId && order && allCheckedIn && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          icon={<CheckCircleOutline />}
          action={
            order.status !== 'complete' ? (
              <Button
                size="small"
                color="inherit"
                onClick={handleMarkComplete}
                disabled={markComplete.isPending}
              >
                Mark Complete
              </Button>
            ) : undefined
          }
        >
          All {onShelf} items are checked in.
          {order.status !== 'complete' && ' Mark the order complete to finish.'}
        </Alert>
      )}

      {/* Queues — render when an order is selected (shows empty state until Build Check-In Queue is run) */}
      {selectedOrderId && (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Batch Queue
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Set shared fields once, then check in and print labels for all items in the batch.
              </Typography>
              <Box sx={{ height: 360 }}>
                <DataGrid
                  rows={batchQueue}
                  columns={batchColumns}
                  loading={batchLoading}
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  getRowId={(row: BatchGroup) => row.id}
                  sx={{ border: 'none' }}
                />
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Item Queue
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Individual and detached exception items.
              </Typography>
              <TextField
                size="small"
                placeholder="Search SKU/title/brand..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ mb: 1.5, maxWidth: 320 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <Search fontSize="small" sx={{ mr: 0.75, color: 'text.secondary' }} />
                    ),
                  },
                }}
              />
              <Box sx={{ height: 420 }}>
                <DataGrid
                  rows={individualQueue}
                  columns={itemColumns}
                  loading={itemsLoading}
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  getRowId={(row: Item) => row.id}
                  sx={{ border: 'none' }}
                />
              </Box>
            </CardContent>
          </Card>

          {/* Mark Complete footer */}
          <Card>
            <CardContent
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
            >
              <Box>
                <Typography variant="subtitle2" fontWeight={600}>
                  Finish Order
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {pendingCount > 0
                    ? `${pendingCount} item${pendingCount === 1 ? '' : 's'} still pending.`
                    : 'All items checked in — ready to mark complete.'}
                </Typography>
              </Box>
              <Tooltip title={pendingCount > 0 ? `${pendingCount} items still pending` : ''}>
                <span>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CheckCircleOutline />}
                    onClick={handleMarkComplete}
                    disabled={
                      pendingCount > 0 ||
                      markComplete.isPending ||
                      order?.status === 'complete'
                    }
                  >
                    {order?.status === 'complete' ? 'Order Complete' : 'Mark Complete'}
                  </Button>
                </span>
              </Tooltip>
            </CardContent>
          </Card>
        </>
      )}

      {/* Processing dialog — shared for item and batch */}
      <Dialog open={dialogMode !== null} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {dialogMode === 'item'
            ? `Process Item — ${activeItem?.sku ?? ''}`
            : `Process Batch — ${activeBatch?.batch_number ?? ''}`}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {dialogMode === 'item' && (
              <>
                <TextField
                  label="Title"
                  fullWidth
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                />
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label="Brand"
                      value={form.brand}
                      onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label="Category"
                      value={form.category}
                      onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                    />
                  </Grid>
                </Grid>
              </>
            )}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  select
                  label="Condition"
                  value={form.condition}
                  onChange={(e) => setForm((prev) => ({ ...prev, condition: e.target.value }))}
                >
                  <MenuItem value="new">New</MenuItem>
                  <MenuItem value="like_new">Like New</MenuItem>
                  <MenuItem value="good">Good</MenuItem>
                  <MenuItem value="fair">Fair</MenuItem>
                  <MenuItem value="salvage">Salvage</MenuItem>
                  <MenuItem value="unknown">Unknown</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Location"
                  value={form.location}
                  onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                />
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label={dialogMode === 'batch' ? 'Unit Price' : 'Price'}
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                  slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
                  helperText={
                    dialogMode === 'item' && activeItem?.price
                      ? 'From pre-arrival pricing'
                      : undefined
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label={dialogMode === 'batch' ? 'Unit Cost' : 'Cost'}
                  type="number"
                  value={form.cost}
                  onChange={(e) => setForm((prev) => ({ ...prev, cost: e.target.value }))}
                  slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
                />
              </Grid>
            </Grid>
            <TextField
              label="Notes"
              multiline
              minRows={2}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={printOnCheckIn}
                  onChange={(e) => setPrintOnCheckIn(e.target.checked)}
                />
              }
              label="Print label(s) after check-in"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="outlined"
            onClick={handleSaveFieldsOnly}
            disabled={updateItem.isPending || updateBatchGroup.isPending}
          >
            Save Fields Only
          </Button>
          <Button
            variant="contained"
            startIcon={printOnCheckIn ? <LocalPrintshop /> : <TaskAlt />}
            onClick={handleCheckInAndPrint}
            disabled={checkInItem.isPending || checkInBatchGroup.isPending}
          >
            {printOnCheckIn ? 'Check-In & Print Tags' : 'Check-In'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
