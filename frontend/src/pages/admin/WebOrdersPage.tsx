import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useUpdateWebOrder,
  useWebOrder,
  useWebOrders,
} from '../../hooks/useWebStore';
import type { WebOrder } from '../../api/webstore.api';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'failed', label: 'Failed' },
];

const FULFILLMENT_OPTIONS = [
  { value: 'pickup', label: 'In-store pickup' },
  { value: 'ship', label: 'Ship' },
];

const STATUS_COLOR: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  pending: 'warning',
  paid: 'info',
  fulfilled: 'success',
  cancelled: 'default',
};

const PAYMENT_COLOR: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  unpaid: 'default',
  pending: 'warning',
  paid: 'success',
  refunded: 'info',
  failed: 'error',
};

const money = (v: string | number) => `$${Number(v).toFixed(2)}`;
const dateTime = (iso: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '-';

export default function WebOrdersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('');

  const [viewId, setViewId] = useState<number | null>(null);

  const [paymentStatus, setPaymentStatus] = useState('unpaid');
  const [paymentReference, setPaymentReference] = useState('');
  const [staffNote, setStaffNote] = useState('');

  const { data, isLoading } = useWebOrders({
    search: search || undefined,
    status: statusFilter || undefined,
    payment_status: paymentFilter || undefined,
    fulfillment: fulfillmentFilter || undefined,
    ordering: '-created_at',
  });
  const orderQuery = useWebOrder(viewId);
  const order = orderQuery.data ?? null;

  const updateOrder = useUpdateWebOrder();

  // Sync the editable payment fields whenever the viewed order loads/changes.
  useEffect(() => {
    if (order) {
      setPaymentStatus(order.payment_status);
      setPaymentReference(order.payment_reference);
      setStaffNote(order.staff_note);
    }
  }, [order?.id, order?.payment_status, order?.payment_reference, order?.staff_note]);

  const orders = data?.results ?? [];

  const handleSavePayment = async () => {
    if (!order) return;
    try {
      await updateOrder.mutateAsync({
        id: order.id,
        data: {
          payment_status: paymentStatus,
          payment_reference: paymentReference.trim(),
          staff_note: staffNote,
        },
      });
      enqueueSnackbar('Order saved', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to save order', { variant: 'error' });
    }
  };

  const columns: GridColDef<WebOrder>[] = [
    { field: 'order_number', headerName: 'Order', width: 110 },
    {
      field: 'created_at',
      headerName: 'Placed',
      width: 170,
      valueGetter: (_v, row) => dateTime(row.created_at),
    },
    { field: 'customer_name', headerName: 'Customer', flex: 1, minWidth: 160 },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: ({ row }) => (
        <Chip size="small" label={row.status_display} color={STATUS_COLOR[row.status] ?? 'default'} />
      ),
    },
    {
      field: 'payment_status',
      headerName: 'Payment',
      width: 120,
      renderCell: ({ row }) => (
        <Chip
          size="small"
          variant="outlined"
          label={row.payment_status_display}
          color={PAYMENT_COLOR[row.payment_status] ?? 'default'}
        />
      ),
    },
    {
      field: 'fulfillment',
      headerName: 'Fulfillment',
      width: 130,
      valueGetter: (_v, row) => row.fulfillment_display,
    },
    { field: 'item_count', headerName: 'Items', width: 80, type: 'number' },
    {
      field: 'total',
      headerName: 'Total',
      width: 110,
      renderCell: ({ row }) => <span>{money(row.total)}</span>,
    },
    {
      field: 'actions',
      headerName: '',
      width: 90,
      sortable: false,
      renderCell: ({ row }) => (
        <Button size="small" onClick={() => setViewId(row.id)}>
          View
        </Button>
      ),
    },
  ];

  if (isLoading && orders.length === 0) return <LoadingScreen message="Loading web orders..." />;

  return (
    <Box>
      <PageHeader
        title="Web orders"
        subtitle="Online storefront orders - review, update status, and record payment"
      />

      <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search order #, name, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 300 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {STATUS_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Payment"
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">All payments</MenuItem>
          {PAYMENT_STATUS_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Fulfillment"
          value={fulfillmentFilter}
          onChange={(e) => setFulfillmentFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All fulfillment</MenuItem>
          {FULFILLMENT_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box sx={{ height: 560 }}>
        <DataGrid
          rows={orders}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          onRowClick={(params) => setViewId(params.row.id)}
          sx={{ border: 'none', '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>

      <Dialog open={viewId != null} onClose={() => setViewId(null)} maxWidth="sm" fullWidth>
        {!order ? (
          <DialogContent>
            <Typography color="text.secondary">Loading order…</Typography>
          </DialogContent>
        ) : (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {order.order_number}
              <Chip
                size="small"
                label={order.status_display}
                color={STATUS_COLOR[order.status] ?? 'default'}
              />
              <Chip
                size="small"
                variant="outlined"
                label={order.payment_status_display}
                color={PAYMENT_COLOR[order.payment_status] ?? 'default'}
              />
            </DialogTitle>
            <DialogContent dividers>
              <Typography variant="caption" color="text.secondary">
                Placed {dateTime(order.created_at)}
              </Typography>

              <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="subtitle2">Customer</Typography>
                  <Typography variant="body2">{order.customer_name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {order.email}
                  </Typography>
                  {order.phone && (
                    <Typography variant="body2" color="text.secondary">
                      {order.phone}
                    </Typography>
                  )}
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="subtitle2">{order.fulfillment_display}</Typography>
                  {order.fulfillment === 'ship' && order.ship_address1 ? (
                    <Typography variant="body2" color="text.secondary">
                      {order.ship_address1}
                      {order.ship_address2 ? `, ${order.ship_address2}` : ''}
                      <br />
                      {order.ship_city}, {order.ship_state} {order.ship_postal}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Pickup at 8425 W Center Rd, Omaha (Canfield)
                    </Typography>
                  )}
                </Grid>
              </Grid>

              {order.customer_note && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="subtitle2">Customer note</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {order.customer_note}
                  </Typography>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              {order.lines.map((line) => (
                <Box
                  key={line.id}
                  sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75, gap: 1 }}
                >
                  <Typography variant="body2">
                    {line.quantity}× {line.title}
                    {line.sku ? (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {' '}
                        ({line.sku})
                      </Typography>
                    ) : null}
                  </Typography>
                  <Typography variant="body2">{money(line.line_total)}</Typography>
                </Box>
              ))}

              <Divider sx={{ my: 1.5 }} />
              <Stack spacing={0.5} sx={{ ml: 'auto', maxWidth: 240 }}>
                <Row label="Subtotal" value={money(order.subtotal)} />
                <Row
                  label="Shipping"
                  value={order.shipping === '0.00' ? 'Free' : money(order.shipping)}
                />
                <Row label="Tax" value={money(order.tax)} />
                <Row label="Total" value={money(order.total)} bold />
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Order status
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Legacy checkout status changes are retired. Use{' '}
                <strong>Online Sales → Inbox</strong> for holds and pickup.
                Current status: {order.status_display}.
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Payment &amp; notes
              </Typography>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Payment status"
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                  >
                    {PAYMENT_STATUS_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>
                        {o.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Payment reference"
                    placeholder="Helcim / receipt #"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Staff note (internal)"
                    multiline
                    rows={2}
                    value={staffNote}
                    onChange={(e) => setStaffNote(e.target.value)}
                  />
                </Grid>
              </Grid>
              {order.payment_provider && (
                <Typography variant="caption" color="text.secondary">
                  Provider: {order.payment_provider}
                </Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setViewId(null)}>Close</Button>
              <Button variant="contained" onClick={handleSavePayment} disabled={updateOrder.isPending}>
                {updateOrder.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: bold ? 700 : 400 }}>
        {value}
      </Typography>
    </Box>
  );
}
