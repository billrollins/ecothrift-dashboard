import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Edit from '@mui/icons-material/Edit';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Inventory2 from '@mui/icons-material/Inventory2';
import LocalShipping from '@mui/icons-material/LocalShipping';
import Payment from '@mui/icons-material/Payment';
import UploadFile from '@mui/icons-material/UploadFile';
import Download from '@mui/icons-material/Download';
import Clear from '@mui/icons-material/Clear';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useSnackbar } from 'notistack';
import { format, parseISO } from 'date-fns';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import {
  usePurchaseOrder,
  useUpdateOrder,
  useDeleteOrder,
  useMarkOrderPaid,
  useRevertOrderPaid,
  useMarkOrderShipped,
  useRevertOrderShipped,
  useDeliverOrder,
  useRevertOrderDelivered,
  useUploadManifest,
} from '../../hooks/useInventory';
import type { PurchaseOrderStatus, PurchaseOrderCondition, ManifestRow } from '../../types/inventory.types';

const CONDITION_OPTIONS: { value: PurchaseOrderCondition; label: string }[] = [
  { value: '', label: 'Not Set' },
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Used - Good' },
  { value: 'fair', label: 'Used - Fair' },
  { value: 'salvage', label: 'Salvage' },
  { value: 'mixed', label: 'Mixed' },
];

const conditionLabel = (val: string) =>
  CONDITION_OPTIONS.find((o) => o.value === val)?.label ?? val;

const STATUS_STEPS: PurchaseOrderStatus[] = [
  'ordered',
  'paid',
  'shipped',
  'delivered',
  'processing',
  'complete',
];

function formatCurrency(value: string | null): string {
  if (value == null) return '—';
  const n = parseFloat(value);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return format(new Date(value), 'MMM d, yyyy');
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const orderId = id ? parseInt(id, 10) : null;

  // Paid dialog
  const [paidDate, setPaidDate] = useState<Date | null>(new Date());
  const [paidDialogOpen, setPaidDialogOpen] = useState(false);

  // Shipped dialog
  const [shippedDialogOpen, setShippedDialogOpen] = useState(false);
  const [shippedDate, setShippedDate] = useState<Date | null>(new Date());
  const [expectedDelivery, setExpectedDelivery] = useState<Date | null>(null);

  // Deliver dialog
  const [deliverDate, setDeliverDate] = useState<Date | null>(new Date());
  const [deliverDialogOpen, setDeliverDialogOpen] = useState(false);

  // File upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    order_number: '',
    ordered_date: null as Date | null,
    description: '',
    condition: '' as PurchaseOrderCondition,
    retail_value: '',
    purchase_cost: '',
    shipping_cost: '',
    fees: '',
    item_count: '',
    notes: '',
  });

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: order, isLoading } = usePurchaseOrder(orderId);
  const updateOrder = useUpdateOrder();
  const deleteOrderMut = useDeleteOrder();
  const markPaidMut = useMarkOrderPaid();
  const revertPaidMut = useRevertOrderPaid();
  const markShippedMut = useMarkOrderShipped();
  const revertShippedMut = useRevertOrderShipped();
  const deliverOrder = useDeliverOrder();
  const revertDeliveredMut = useRevertOrderDelivered();
  const uploadManifest = useUploadManifest();

  const manifestRows = (order as { manifest_rows?: ManifestRow[] })?.manifest_rows ?? [];

  const statusIndex = order ? STATUS_STEPS.indexOf(order.status) : -1;
  const canMarkPaid = order && order.status === 'ordered';
  const canRevertPaid = order && order.status === 'paid';
  const canMarkShipped = order && order.status === 'paid';
  const canEditShipped = order && order.status === 'shipped';
  const canDeliver = order && ['shipped'].includes(order.status);
  const canRevertDelivered = order && order.status === 'delivered';
  const canDelete = order && order.item_count === 0;

  const handleOpenEdit = () => {
    if (!order) return;
    setEditForm({
      order_number: order.order_number ?? '',
      ordered_date: order.ordered_date ? parseISO(order.ordered_date) : null,
      description: order.description ?? '',
      condition: order.condition ?? '',
      retail_value: order.retail_value ?? '',
      purchase_cost: order.purchase_cost ?? '',
      shipping_cost: order.shipping_cost ?? '',
      fees: order.fees ?? '',
      item_count: String(order.item_count ?? 0),
      notes: order.notes ?? '',
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!orderId) return;
    try {
      await updateOrder.mutateAsync({
        id: orderId,
        data: {
          order_number: editForm.order_number.trim() || undefined,
          ordered_date: editForm.ordered_date ? format(editForm.ordered_date, 'yyyy-MM-dd') : undefined,
          description: editForm.description,
          condition: editForm.condition,
          retail_value: editForm.retail_value || null,
          purchase_cost: editForm.purchase_cost || null,
          shipping_cost: editForm.shipping_cost || null,
          fees: editForm.fees || null,
          item_count: editForm.item_count ? parseInt(editForm.item_count, 10) : 0,
          notes: editForm.notes,
        },
      });
      enqueueSnackbar('Order updated', { variant: 'success' });
      setEditOpen(false);
    } catch {
      enqueueSnackbar('Failed to update order', { variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!orderId) return;
    try {
      await deleteOrderMut.mutateAsync(orderId);
      enqueueSnackbar('Order deleted', { variant: 'success' });
      navigate('/inventory/orders');
    } catch {
      enqueueSnackbar('Failed to delete order', { variant: 'error' });
    }
  };

  const handleMarkPaid = async () => {
    if (!orderId) return;
    try {
      await markPaidMut.mutateAsync({
        id: orderId,
        date: paidDate ? format(paidDate, 'yyyy-MM-dd') : undefined,
      });
      enqueueSnackbar('Order marked as paid', { variant: 'success' });
      setPaidDialogOpen(false);
    } catch {
      enqueueSnackbar('Failed to mark order paid', { variant: 'error' });
    }
  };

  const handleRevertPaid = async () => {
    if (!orderId) return;
    try {
      await revertPaidMut.mutateAsync(orderId);
      enqueueSnackbar('Payment reverted', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to revert payment', { variant: 'error' });
    }
  };

  const handleOpenShipped = () => {
    if (!order) return;
    setShippedDate(order.shipped_date ? new Date(order.shipped_date) : new Date());
    setExpectedDelivery(order.expected_delivery ? new Date(order.expected_delivery) : null);
    setShippedDialogOpen(true);
  };

  const handleMarkShipped = async () => {
    if (!orderId) return;
    try {
      await markShippedMut.mutateAsync({
        id: orderId,
        data: {
          shipped_date: shippedDate ? format(shippedDate, 'yyyy-MM-dd') : undefined,
          expected_delivery: expectedDelivery ? format(expectedDelivery, 'yyyy-MM-dd') : undefined,
        },
      });
      enqueueSnackbar('Order marked as shipped', { variant: 'success' });
      setShippedDialogOpen(false);
    } catch {
      enqueueSnackbar('Failed to mark order shipped', { variant: 'error' });
    }
  };

  const handleRevertShipped = async () => {
    if (!orderId) return;
    try {
      await revertShippedMut.mutateAsync(orderId);
      enqueueSnackbar('Shipment reverted', { variant: 'success' });
      setShippedDialogOpen(false);
    } catch {
      enqueueSnackbar('Failed to revert shipment', { variant: 'error' });
    }
  };

  const handleDeliver = async () => {
    if (!orderId) return;
    try {
      await deliverOrder.mutateAsync({
        id: orderId,
        date: deliverDate ? format(deliverDate, 'yyyy-MM-dd') : undefined,
      });
      enqueueSnackbar('Order marked as delivered', { variant: 'success' });
      setDeliverDialogOpen(false);
    } catch {
      enqueueSnackbar('Failed to mark order delivered', { variant: 'error' });
    }
  };

  const handleRevertDelivered = async () => {
    if (!orderId) return;
    try {
      await revertDeliveredMut.mutateAsync(orderId);
      enqueueSnackbar('Delivery reverted', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to revert delivery', { variant: 'error' });
    }
  };

  const handleUploadManifest = async () => {
    if (!orderId || !selectedFile) return;
    try {
      await uploadManifest.mutateAsync({ orderId, file: selectedFile });
      enqueueSnackbar('Manifest uploaded successfully', { variant: 'success' });
      setSelectedFile(null);
    } catch {
      enqueueSnackbar('Failed to upload manifest', { variant: 'error' });
    }
  };

  if (isLoading && !order) return <LoadingScreen />;
  if (!order) return <Typography>Order not found.</Typography>;

  return (
    <Box>
      <PageHeader
        title={`Order #${order.order_number}`}
        subtitle={`${order.vendor_name} (${order.vendor_code})`}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" startIcon={<Edit />} onClick={handleOpenEdit}>
              Edit
            </Button>
            {canDelete && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteOutline />}
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<ArrowBack />}
              onClick={() => navigate('/inventory/orders')}
            >
              Back
            </Button>
          </Box>
        }
      />

      {/* Status Stepper */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Status
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {STATUS_STEPS.map((step, i) => (
                <Box key={step} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 600,
                      bgcolor:
                        i <= statusIndex
                          ? 'primary.main'
                          : i === statusIndex + 1
                            ? 'action.selected'
                            : 'action.hover',
                      color: i <= statusIndex ? 'primary.contrastText' : 'text.secondary',
                    }}
                  >
                    {i + 1}
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      ml: 0.5,
                      fontWeight: i <= statusIndex ? 600 : 400,
                      color: i <= statusIndex ? 'text.primary' : 'text.secondary',
                    }}
                  >
                    {step.replace(/_/g, ' ')}
                  </Typography>
                  {i < STATUS_STEPS.length - 1 && (
                    <Box
                      sx={{
                        width: 24,
                        height: 2,
                        bgcolor: i < statusIndex ? 'primary.main' : 'divider',
                        mx: 0.5,
                      }}
                    />
                  )}
                </Box>
              ))}
              {order.status === 'cancelled' && (
                <Chip label="Cancelled" color="error" size="small" sx={{ ml: 1 }} />
              )}
            </Box>
          </Box>

          {/* Dates */}
          <Typography variant="overline" color="text.secondary">Dates</Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 6, md: 2.4 }}>
              <Typography variant="body2" color="text.secondary">Ordered</Typography>
              <Typography variant="body1">{formatDate(order.ordered_date)}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 2.4 }}>
              <Typography variant="body2" color="text.secondary">Paid</Typography>
              <Typography variant="body1">{formatDate(order.paid_date)}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 2.4 }}>
              <Typography variant="body2" color="text.secondary">Shipped</Typography>
              <Typography variant="body1">{formatDate(order.shipped_date)}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 2.4 }}>
              <Typography variant="body2" color="text.secondary">Expected</Typography>
              <Typography variant="body1">{formatDate(order.expected_delivery)}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 2.4 }}>
              <Typography variant="body2" color="text.secondary">Delivered</Typography>
              <Typography variant="body1">{formatDate(order.delivered_date)}</Typography>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Details */}
          <Typography variant="overline" color="text.secondary">Details</Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {order.description && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="body2" color="text.secondary">Description</Typography>
                <Typography variant="body1">{order.description}</Typography>
              </Grid>
            )}
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Condition</Typography>
              <Typography variant="body1">{order.condition ? conditionLabel(order.condition) : '—'}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Retail Value</Typography>
              <Typography variant="body1">{formatCurrency(order.retail_value)}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Items</Typography>
              <Typography variant="body1">{order.item_count}</Typography>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Costs */}
          <Typography variant="overline" color="text.secondary">Costs</Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Purchase Cost</Typography>
              <Typography variant="body1">{formatCurrency(order.purchase_cost)}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Shipping</Typography>
              <Typography variant="body1">{formatCurrency(order.shipping_cost)}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Fees</Typography>
              <Typography variant="body1">{formatCurrency(order.fees)}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Total Cost</Typography>
              <Typography variant="body1" fontWeight={600}>{formatCurrency(order.total_cost)}</Typography>
            </Grid>
          </Grid>

          {/* Notes */}
          {order.notes && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="overline" color="text.secondary">Notes</Typography>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                {order.notes}
              </Typography>
            </>
          )}

          {/* Meta footer */}
          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" color="text.secondary">
            Created by {order.created_by_name ?? 'Unknown'}
          </Typography>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            {canMarkPaid && (
              <Button
                variant="contained"
                startIcon={<Payment />}
                onClick={() => setPaidDialogOpen(true)}
              >
                Mark Paid
              </Button>
            )}
            {canRevertPaid && (
              <Button
                variant="outlined"
                color="warning"
                size="small"
                onClick={handleRevertPaid}
                disabled={revertPaidMut.isPending}
              >
                {revertPaidMut.isPending ? 'Reverting...' : 'Undo Paid'}
              </Button>
            )}
            {canMarkShipped && (
              <Button
                variant="contained"
                startIcon={<LocalShipping />}
                onClick={handleOpenShipped}
              >
                Mark Shipped
              </Button>
            )}
            {canEditShipped && (
              <Button
                variant="outlined"
                startIcon={<LocalShipping />}
                onClick={handleOpenShipped}
              >
                Edit Shipped
              </Button>
            )}
            {canDeliver && (
              <Button
                variant="contained"
                startIcon={<Inventory2 />}
                onClick={() => setDeliverDialogOpen(true)}
              >
                Mark Delivered
              </Button>
            )}
            {canRevertDelivered && (
              <Button
                variant="outlined"
                color="warning"
                size="small"
                onClick={handleRevertDelivered}
                disabled={revertDeliveredMut.isPending}
              >
                {revertDeliveredMut.isPending ? 'Reverting...' : 'Undo Delivered'}
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Manifest Section */}
      {order.status !== 'cancelled' && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Manifest
            </Typography>

            {/* Uploaded file info + download */}
            {order.manifest_file && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <UploadFile color="action" />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={600}>{order.manifest_file.filename}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(order.manifest_file.size / 1024).toFixed(1)} KB &middot; Uploaded {format(new Date(order.manifest_file.uploaded_at), 'MMM d, yyyy h:mm a')}
                  </Typography>
                </Box>
                {order.manifest_file.url && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<Download />}
                    href={order.manifest_file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download
                  </Button>
                )}
              </Box>
            )}

            {/* Upload / Replace */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button variant="outlined" component="label" startIcon={<UploadFile />}>
                {order.manifest_file ? 'Replace CSV' : 'Select CSV'}
                <input
                  type="file"
                  hidden
                  accept=".csv"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </Button>
              {selectedFile && (
                <>
                  <Typography variant="body2">{selectedFile.name}</Typography>
                  <Button
                    variant="contained"
                    onClick={handleUploadManifest}
                    disabled={uploadManifest.isPending}
                  >
                    {uploadManifest.isPending ? 'Uploading...' : 'Upload'}
                  </Button>
                  <Button size="small" onClick={() => setSelectedFile(null)}>Cancel</Button>
                </>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* CSV Preview (persisted) */}
      {order.manifest_preview && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              CSV Preview — {order.manifest_preview.row_count} rows
            </Typography>
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>#</TableCell>
                    {order.manifest_preview.headers.map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {order.manifest_preview.rows.map((row) => (
                    <TableRow key={row.row_number}>
                      <TableCell>{row.row_number}</TableCell>
                      {order.manifest_preview!.headers.map((h) => (
                        <TableCell key={h} sx={{ whiteSpace: 'nowrap', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.raw[h] ?? ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {order.manifest_preview.row_count > 20 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Showing first 20 of {order.manifest_preview.row_count} rows
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manifest Rows (from processed data) */}
      {manifestRows.length > 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Manifest Rows
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Brand</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Qty</TableCell>
                    <TableCell>UPC</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {manifestRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.row_number}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell>{row.brand}</TableCell>
                      <TableCell>{row.category}</TableCell>
                      <TableCell>{row.quantity}</TableCell>
                      <TableCell>{row.upc}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {['delivered', 'processing', 'complete'].includes(order.status) && (
              <Button
                variant="contained"
                sx={{ mt: 2 }}
                onClick={() => navigate(`/inventory/processing?order=${orderId}`)}
              >
                Go to Processing
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mark Paid Dialog */}
      <Dialog open={paidDialogOpen} onClose={() => setPaidDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Mark Paid</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <DatePicker
              label="Payment Date"
              value={paidDate}
              onChange={setPaidDate}
              slotProps={{ textField: { fullWidth: true } }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaidDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleMarkPaid} disabled={markPaidMut.isPending}>
            {markPaidMut.isPending ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Shipped Dialog */}
      <Dialog open={shippedDialogOpen} onClose={() => setShippedDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{canEditShipped ? 'Edit Shipped' : 'Mark Shipped'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <DatePicker
              label="Shipped On"
              value={shippedDate}
              onChange={setShippedDate}
              slotProps={{ textField: { fullWidth: true } }}
            />
            <DatePicker
              label="Expected Delivery"
              value={expectedDelivery}
              onChange={setExpectedDelivery}
              slotProps={{ textField: { fullWidth: true } }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          {canEditShipped && (
            <Button
              color="warning"
              onClick={handleRevertShipped}
              disabled={revertShippedMut.isPending}
              sx={{ mr: 'auto' }}
            >
              {revertShippedMut.isPending ? 'Reverting...' : 'Not Shipped'}
            </Button>
          )}
          <Button onClick={() => setShippedDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleMarkShipped}
            disabled={markShippedMut.isPending}
          >
            {markShippedMut.isPending ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deliver Dialog */}
      <Dialog open={deliverDialogOpen} onClose={() => setDeliverDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Mark Delivered</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <DatePicker
              label="Delivery Date"
              value={deliverDate}
              onChange={setDeliverDate}
              slotProps={{ textField: { fullWidth: true } }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeliverDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleDeliver} disabled={deliverOrder.isPending}>
            {deliverOrder.isPending ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Order #{order.order_number}</DialogTitle>
        <DialogContent dividers>
          {/* Order # & Date */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                label="Order Number"
                value={editForm.order_number}
                onChange={(e) => setEditForm((f) => ({ ...f, order_number: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <DatePicker
                label="Ordered Date"
                value={editForm.ordered_date}
                onChange={(date) => setEditForm((f) => ({ ...f, ordered_date: date }))}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Grid>
          </Grid>

          {/* Details */}
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
            Details
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                size="small"
                label="Description"
                placeholder="e.g. 6 Pallets of Small Appliances, 130 Units..."
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                select
                label="Condition"
                value={editForm.condition}
                onChange={(e) => setEditForm((f) => ({ ...f, condition: e.target.value as PurchaseOrderCondition }))}
              >
                {CONDITION_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Retail Value"
                type="number"
                inputProps={{ min: 0, step: '0.01' }}
                value={editForm.retail_value}
                onChange={(e) => setEditForm((f) => ({ ...f, retail_value: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="# Items"
                type="number"
                inputProps={{ min: 0 }}
                value={editForm.item_count}
                onChange={(e) => setEditForm((f) => ({ ...f, item_count: e.target.value }))}
              />
            </Grid>
          </Grid>

          {/* Costs */}
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
            Costs
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Purchase Cost"
                type="number"
                inputProps={{ min: 0, step: '0.01' }}
                value={editForm.purchase_cost}
                onChange={(e) => setEditForm((f) => ({ ...f, purchase_cost: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Shipping"
                type="number"
                inputProps={{ min: 0, step: '0.01' }}
                value={editForm.shipping_cost}
                onChange={(e) => setEditForm((f) => ({ ...f, shipping_cost: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Fees"
                type="number"
                inputProps={{ min: 0, step: '0.01' }}
                value={editForm.fees}
                onChange={(e) => setEditForm((f) => ({ ...f, fees: e.target.value }))}
              />
            </Grid>
          </Grid>

          {/* Notes */}
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
            Notes
          </Typography>
          <TextField
            fullWidth
            size="small"
            multiline
            rows={3}
            value={editForm.notes}
            onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
            sx={{ mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEdit} disabled={updateOrder.isPending}>
            {updateOrder.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete Order"
        message={`Delete order #${order.order_number}? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        loading={deleteOrderMut.isPending}
      />
    </Box>
  );
}
