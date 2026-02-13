import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import Edit from '@mui/icons-material/Edit';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import LocalShipping from '@mui/icons-material/LocalShipping';
import UploadFile from '@mui/icons-material/UploadFile';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import {
  usePurchaseOrder,
  useUpdateOrder,
  useDeleteOrder,
  useDeliverOrder,
  useUploadManifest,
} from '../../hooks/useInventory';
import type { PurchaseOrderStatus, ManifestRow } from '../../types/inventory.types';

const STATUS_STEPS: PurchaseOrderStatus[] = [
  'ordered',
  'in_transit',
  'delivered',
  'processing',
  'complete',
];

function formatCurrency(value: string | null): string {
  if (value == null) return '—';
  const n = parseFloat(value);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const orderId = id ? parseInt(id, 10) : null;

  // Deliver dialog
  const [deliverDate, setDeliverDate] = useState<Date | null>(new Date());
  const [deliverDialogOpen, setDeliverDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    notes: '',
    expected_delivery: '',
    total_cost: '',
  });

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: order, isLoading } = usePurchaseOrder(orderId);
  const updateOrder = useUpdateOrder();
  const deleteOrderMut = useDeleteOrder();
  const deliverOrder = useDeliverOrder();
  const uploadManifest = useUploadManifest();

  const manifestRows = (order as { manifest_rows?: ManifestRow[] })?.manifest_rows ?? [];

  const statusIndex = order ? STATUS_STEPS.indexOf(order.status) : -1;
  const canDeliver = order && ['ordered', 'in_transit'].includes(order.status);
  const canDelete = order && order.item_count === 0;

  const handleOpenEdit = () => {
    if (!order) return;
    setEditForm({
      notes: order.notes ?? '',
      expected_delivery: order.expected_delivery ?? '',
      total_cost: order.total_cost ?? '',
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!orderId) return;
    try {
      await updateOrder.mutateAsync({
        id: orderId,
        data: {
          notes: editForm.notes,
          expected_delivery: editForm.expected_delivery || null,
          total_cost: editForm.total_cost || null,
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

  const handleUploadManifest = async () => {
    if (!orderId || !selectedFile) return;
    try {
      await uploadManifest.mutateAsync({ orderId, file: selectedFile });
      enqueueSnackbar('Manifest uploaded', { variant: 'success' });
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
        subtitle={`${order.vendor_name} • ${order.status.replace(/_/g, ' ')}`}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<Edit />}
              onClick={handleOpenEdit}
            >
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
            </Box>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="body2" color="text.secondary">
                Ordered
              </Typography>
              <Typography variant="body1">
                {order.ordered_date
                  ? format(new Date(order.ordered_date), 'MMM d, yyyy')
                  : '—'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="body2" color="text.secondary">
                Expected Delivery
              </Typography>
              <Typography variant="body1">
                {order.expected_delivery
                  ? format(new Date(order.expected_delivery), 'MMM d, yyyy')
                  : '—'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="body2" color="text.secondary">
                Delivered
              </Typography>
              <Typography variant="body1">
                {order.delivered_date
                  ? format(new Date(order.delivered_date), 'MMM d, yyyy')
                  : '—'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="body2" color="text.secondary">
                Total Cost
              </Typography>
              <Typography variant="body1">{formatCurrency(order.total_cost)}</Typography>
            </Grid>
            {canDeliver && (
              <Grid size={{ xs: 12 }}>
                <Button
                  variant="contained"
                  startIcon={<LocalShipping />}
                  onClick={() => setDeliverDialogOpen(true)}
                >
                  Mark Delivered
                </Button>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {order.status !== 'cancelled' && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Upload Manifest
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button variant="outlined" component="label" startIcon={<UploadFile />}>
                Select CSV
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
                </>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

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
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Expected Delivery"
                type="date"
                value={editForm.expected_delivery}
                onChange={(e) => setEditForm((f) => ({ ...f, expected_delivery: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Total Cost"
                type="number"
                value={editForm.total_cost}
                onChange={(e) => setEditForm((f) => ({ ...f, total_cost: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={3}
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Grid>
          </Grid>
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
