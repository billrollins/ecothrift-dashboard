import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import Payment from '@mui/icons-material/Payment';
import LocalShipping from '@mui/icons-material/LocalShipping';
import Inventory2 from '@mui/icons-material/Inventory2';
import UploadFile from '@mui/icons-material/UploadFile';
import DeleteForever from '@mui/icons-material/DeleteForever';
import PlayArrow from '@mui/icons-material/PlayArrow';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { formatCurrencyWhole, formatNumber } from '../../utils/format';
import {
  useDeliverOrder,
  useMarkOrderPaid,
  useMarkOrderShipped,
  usePurgeDeleteOrder,
  usePurchaseOrder,
  useRevertOrderDelivered,
  useRevertOrderPaid,
  useRevertOrderShipped,
  useOrderDeletePreview,
} from '../../hooks/useInventory';
import type { OrderDeletePreviewResponse } from '../../api/inventory.api';
import type {
  ManifestRow,
  PurchaseOrderCondition,
  PurchaseOrderStatus,
} from '../../types/inventory.types';

const STATUS_STEPS: PurchaseOrderStatus[] = [
  'ordered', 'paid', 'shipped', 'delivered', 'processing', 'complete',
];

const CONDITION_OPTIONS: { value: PurchaseOrderCondition; label: string }[] = [
  { value: '', label: 'Not Set' },
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Used - Good' },
  { value: 'fair', label: 'Used - Fair' },
  { value: 'salvage', label: 'Salvage' },
  { value: 'mixed', label: 'Mixed' },
];

function formatDate(value: string | null) {
  if (!value) return '—';
  return format(new Date(value), 'MMM d, yyyy');
}

function conditionLabel(value: string) {
  return CONDITION_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id ? Number.parseInt(id, 10) : null;
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { data: order, isLoading } = usePurchaseOrder(orderId);
  const markPaid = useMarkOrderPaid();
  const revertPaid = useRevertOrderPaid();
  const markShipped = useMarkOrderShipped();
  const revertShipped = useRevertOrderShipped();
  const deliverOrder = useDeliverOrder();
  const revertDelivered = useRevertOrderDelivered();
  const orderDeletePreview = useOrderDeletePreview();
  const purgeDeleteOrder = usePurgeDeleteOrder();

  const [paidDialogOpen, setPaidDialogOpen] = useState(false);
  const [paidDate, setPaidDate] = useState<Date | null>(new Date());
  const [shippedDialogOpen, setShippedDialogOpen] = useState(false);
  const [shippedDate, setShippedDate] = useState<Date | null>(new Date());
  const [expectedDelivery, setExpectedDelivery] = useState<Date | null>(null);
  const [deliverDialogOpen, setDeliverDialogOpen] = useState(false);
  const [deliverDate, setDeliverDate] = useState<Date | null>(new Date());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletePreview, setDeletePreview] = useState<OrderDeletePreviewResponse | null>(null);

  const manifestRows = (order as { manifest_rows?: ManifestRow[] } | null)?.manifest_rows ?? [];
  const statusIndex = order ? STATUS_STEPS.indexOf(order.status) : -1;

  const handleOpenDeleteDialog = async () => {
    if (!orderId) return;
    setDeleteDialogOpen(true);
    setDeleteConfirmation('');
    setDeletePreview(null);
    try {
      const preview = await orderDeletePreview.mutateAsync(orderId);
      setDeletePreview(preview);
    } catch {
      enqueueSnackbar('Failed to load order deletion preview', { variant: 'error' });
      setDeleteDialogOpen(false);
    }
  };

  const handlePurgeDeleteOrder = async () => {
    if (!orderId || !order) return;
    if (deleteConfirmation.trim() !== order.order_number) {
      enqueueSnackbar(`Type ${order.order_number} to confirm deletion`, { variant: 'warning' });
      return;
    }
    try {
      const result = await purgeDeleteOrder.mutateAsync({
        orderId,
        data: { confirm_order_number: deleteConfirmation.trim() },
      });
      enqueueSnackbar(`Deleted order ${result.order_number} and related artifacts`, { variant: 'success' });
      navigate('/inventory/orders');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete order artifacts';
      enqueueSnackbar(message, { variant: 'error' });
    }
  };

  const handleMarkPaid = async () => {
    if (!orderId) return;
    try {
      await markPaid.mutateAsync({ id: orderId, date: paidDate ? format(paidDate, 'yyyy-MM-dd') : undefined });
      enqueueSnackbar('Order marked paid', { variant: 'success' });
      setPaidDialogOpen(false);
    } catch {
      enqueueSnackbar('Failed to mark paid', { variant: 'error' });
    }
  };

  const handleMarkShipped = async () => {
    if (!orderId) return;
    try {
      await markShipped.mutateAsync({
        id: orderId,
        data: {
          shipped_date: shippedDate ? format(shippedDate, 'yyyy-MM-dd') : undefined,
          expected_delivery: expectedDelivery ? format(expectedDelivery, 'yyyy-MM-dd') : undefined,
        },
      });
      enqueueSnackbar('Order marked shipped', { variant: 'success' });
      setShippedDialogOpen(false);
    } catch {
      enqueueSnackbar('Failed to mark shipped', { variant: 'error' });
    }
  };

  const handleDeliver = async () => {
    if (!orderId) return;
    try {
      const result = await deliverOrder.mutateAsync({
        id: orderId,
        date: deliverDate ? format(deliverDate, 'yyyy-MM-dd') : undefined,
      });
      const itemsCreated = (result as { items_created?: number }).items_created;
      const batchesCreated = (result as { batch_groups_created?: number }).batch_groups_created;
      if (itemsCreated != null && itemsCreated > 0) {
        const batchMsg = batchesCreated != null && batchesCreated > 0 ? `, ${batchesCreated} batch(es)` : '';
        enqueueSnackbar(`Order delivered. Created ${itemsCreated} item(s)${batchMsg} for check-in.`, { variant: 'success' });
      } else {
        enqueueSnackbar('Order marked delivered', { variant: 'success' });
      }
      setDeliverDialogOpen(false);
    } catch {
      enqueueSnackbar('Failed to mark delivered', { variant: 'error' });
    }
  };

  if (isLoading && !order) return <LoadingScreen />;
  if (!order) return <Typography>Order not found.</Typography>;

  const canMarkPaid = order.status === 'ordered';
  const canRevertPaid = order.status === 'paid';
  const canMarkShipped = order.status === 'paid';
  const canEditShipped = order.status === 'shipped';
  const canDeliver = order.status === 'shipped';
  const canRevertDelivered = order.status === 'delivered';

  const canGoToPreprocessing = Boolean(order.manifest_file);
  const canGoToProcessing = ['delivered', 'processing', 'complete'].includes(order.status);

  return (
    <Box>
      <PageHeader
        title={`Order #${order.order_number}`}
        subtitle={`${order.vendor_name} (${order.vendor_code})`}
        action={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" size="small" startIcon={<ArrowBack />} onClick={() => navigate('/inventory/orders')}>
              Back
            </Button>
            <Button
              variant="contained" size="small" startIcon={<BuildOutlined />}
              onClick={() => navigate(`/inventory/preprocessing/${order.id}`)}
              disabled={!canGoToPreprocessing}
            >
              Preprocessing
            </Button>
            <Button
              variant="contained" size="small" startIcon={<PlayArrow />}
              onClick={() => navigate(`/inventory/processing?order=${order.id}`)}
              disabled={!canGoToProcessing}
            >
              Processing
            </Button>
            <Button
              variant="outlined" size="small" color="error" startIcon={<DeleteForever />}
              onClick={handleOpenDeleteDialog}
              disabled={orderDeletePreview.isPending || purgeDeleteOrder.isPending}
            >
              Delete
            </Button>
          </Box>
        )}
      />

      {/* ── Order Details ── */}
      <Card sx={{ mb: 1.5 }}>
        <CardContent sx={{ pb: '12px !important' }}>
          {/* Status: compact inline */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            <StatusBadge status={order.status} />
            <Typography variant="body2" color="text.secondary">
              {STATUS_STEPS.map((step, i) => (
                <Box
                  key={step}
                  component="span"
                  sx={{
                    fontWeight: i === statusIndex ? 700 : 400,
                    color: i < statusIndex ? 'success.main' : i === statusIndex ? 'text.primary' : 'text.disabled',
                  }}
                >
                  {i > 0 && <Box component="span" sx={{ mx: 0.5, color: 'text.disabled' }}>›</Box>}
                  {step.replace('_', ' ')}
                </Box>
              ))}
            </Typography>
            {order.status === 'cancelled' && <Chip label="Cancelled" color="error" size="small" />}
          </Box>

          {/* Key dates — compact horizontal */}
          <Box sx={{ display: 'flex', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
            {[
              { label: 'Ordered', value: order.ordered_date },
              { label: 'Paid', value: order.paid_date },
              { label: 'Shipped', value: order.shipped_date },
              { label: 'Expected', value: order.expected_delivery },
              { label: 'Delivered', value: order.delivered_date },
            ].map(({ label, value }) => (
              <Box key={label}>
                <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                <Typography variant="body2">{formatDate(value)}</Typography>
              </Box>
            ))}
          </Box>

          <Divider sx={{ mb: 1.5 }} />

          {/* Description + key figures */}
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Typography variant="caption" color="text.secondary" display="block">Description</Typography>
              <Typography variant="body2">{order.description || '—'}</Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <Typography variant="caption" color="text.secondary" display="block">Condition</Typography>
              <Typography variant="body2">{order.condition ? conditionLabel(order.condition) : '—'}</Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <Typography variant="caption" color="text.secondary" display="block">Items</Typography>
              <Typography variant="body2">{formatNumber(order.item_count)}</Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
              <Typography variant="caption" color="text.secondary" display="block">Retail</Typography>
              <Typography variant="body2">{formatCurrencyWhole(order.retail_value)}</Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
              <Typography variant="caption" color="text.secondary" display="block">Total Cost</Typography>
              <Typography variant="body2">{formatCurrencyWhole(order.total_cost)}</Typography>
            </Grid>
          </Grid>

          {/* Status action buttons */}
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            {canMarkPaid && (
              <Button variant="contained" size="small" startIcon={<Payment />} onClick={() => setPaidDialogOpen(true)}>
                Mark Paid
              </Button>
            )}
            {canRevertPaid && (
              <Button variant="outlined" size="small" color="warning" onClick={() => revertPaid.mutate(order.id)}>
                Undo Paid
              </Button>
            )}
            {canMarkShipped && (
              <Button variant="contained" size="small" startIcon={<LocalShipping />} onClick={() => setShippedDialogOpen(true)}>
                Mark Shipped
              </Button>
            )}
            {canEditShipped && (
              <Button variant="outlined" size="small" startIcon={<LocalShipping />} onClick={() => setShippedDialogOpen(true)}>
                Edit Shipped
              </Button>
            )}
            {order.status === 'shipped' && (
              <Button variant="outlined" size="small" color="warning" onClick={() => revertShipped.mutate(order.id)}>
                Undo Shipped
              </Button>
            )}
            {canDeliver && (
              <Button variant="contained" size="small" startIcon={<Inventory2 />} onClick={() => setDeliverDialogOpen(true)}>
                Mark Delivered
              </Button>
            )}
            {canRevertDelivered && (
              <Button variant="outlined" size="small" color="warning" onClick={() => revertDelivered.mutate(order.id)}>
                Undo Delivered
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* ── Raw Manifest File ── */}
      <Card sx={{ mb: 1.5 }}>
        <CardContent sx={{ pb: '12px !important' }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>Raw Manifest</Typography>
          {order.manifest_file ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="body2">{order.manifest_file.filename}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {manifestRows.length > 0 ? `${formatNumber(manifestRows.length)} standardized rows` : 'Not yet standardized'}
                </Typography>
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">No manifest uploaded yet.</Typography>
          )}
        </CardContent>
      </Card>


      {/* ── Dialogs ── */}
      <Dialog open={deleteDialogOpen} onClose={() => { if (purgeDeleteOrder.isPending) return; setDeleteDialogOpen(false); }} maxWidth="md" fullWidth>
        <DialogTitle>Delete Order and All Artifacts</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This action is permanent. Artifacts will be deleted in reverse sequence.
          </Typography>
          {orderDeletePreview.isPending && <Typography variant="body2">Loading deletion preview...</Typography>}
          {!orderDeletePreview.isPending && deletePreview && (
            <>
              {deletePreview.warnings.map((warning) => (
                <Typography key={warning} variant="body2" color="warning.main" sx={{ mb: 1 }}>{warning}</Typography>
              ))}
              <Typography variant="subtitle2" sx={{ mt: 1.5, mb: 1 }}>Reverse Deletion Sequence</Typography>
              <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width={60}>Step</TableCell>
                      <TableCell>Action</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell align="right">Count</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {deletePreview.steps.map((step, index) => (
                      <TableRow key={step.key}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{step.label}</TableCell>
                        <TableCell>{step.description}</TableCell>
                        <TableCell align="right">{step.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Items to Be Deleted ({deletePreview.items.length})</Typography>
              <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 200 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>SKU</TableCell>
                      <TableCell>Title</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Tier</TableCell>
                      <TableCell>Batch</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {deletePreview.items.length === 0 && (
                      <TableRow><TableCell colSpan={5}>No items linked to this order.</TableCell></TableRow>
                    )}
                    {deletePreview.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.sku}</TableCell>
                        <TableCell>{item.title}</TableCell>
                        <TableCell>{item.status}</TableCell>
                        <TableCell>{item.processing_tier}</TableCell>
                        <TableCell>{item.batch_number || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
          {!orderDeletePreview.isPending && !deletePreview && (
            <Typography variant="body2" color="error">Could not load deletion preview.</Typography>
          )}
          <TextField
            fullWidth sx={{ mt: 2 }}
            label={`Type ${order.order_number} to confirm`}
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            disabled={purgeDeleteOrder.isPending}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={purgeDeleteOrder.isPending}>Cancel</Button>
          <Button
            variant="contained" color="error"
            onClick={handlePurgeDeleteOrder}
            disabled={purgeDeleteOrder.isPending || orderDeletePreview.isPending || deleteConfirmation.trim() !== order.order_number}
          >
            {purgeDeleteOrder.isPending ? 'Deleting...' : 'Delete All in Reverse Order'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={paidDialogOpen} onClose={() => setPaidDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Mark Paid</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <DatePicker label="Payment Date" value={paidDate} onChange={setPaidDate} slotProps={{ textField: { fullWidth: true } }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaidDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleMarkPaid} disabled={markPaid.isPending}>
            {markPaid.isPending ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={shippedDialogOpen} onClose={() => setShippedDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{order.status === 'shipped' ? 'Edit Shipped' : 'Mark Shipped'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <DatePicker label="Shipped Date" value={shippedDate} onChange={setShippedDate} slotProps={{ textField: { fullWidth: true } }} />
            <DatePicker label="Expected Delivery" value={expectedDelivery} onChange={setExpectedDelivery} slotProps={{ textField: { fullWidth: true } }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShippedDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleMarkShipped} disabled={markShipped.isPending}>
            {markShipped.isPending ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deliverDialogOpen} onClose={() => setDeliverDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Mark Delivered</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <DatePicker label="Delivered Date" value={deliverDate} onChange={setDeliverDate} slotProps={{ textField: { fullWidth: true } }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeliverDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleDeliver} disabled={deliverOrder.isPending}>
            {deliverOrder.isPending ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
