import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useVendors, usePurchaseOrders, useCreatePurchaseOrder } from '../../hooks/useInventory';
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types/inventory.types';

const ORDER_STATUSES: PurchaseOrderStatus[] = [
  'ordered',
  'paid',
  'shipped',
  'delivered',
  'processing',
  'complete',
  'cancelled',
];

function formatCurrency(value: string | null): string {
  if (value == null) return '—';
  const n = parseFloat(value);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

export default function OrderListPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [vendorFilter, setVendorFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({
    vendor: '',
    order_number: '',
    ordered_date: null as Date | null,
    expected_delivery: null as Date | null,
    description: '',
    condition: '',
    retail_value: '',
    item_count: '',
    purchase_cost: '',
    shipping_cost: '',
    fees: '',
    notes: '',
  });

  const params = useMemo(() => {
    const p: Record<string, string | number> = {};
    if (statusFilter) p.status = statusFilter;
    if (vendorFilter) p.vendor = vendorFilter;
    if (dateFrom) p.ordered_date_after = format(dateFrom, 'yyyy-MM-dd');
    if (dateTo) p.ordered_date_before = format(dateTo, 'yyyy-MM-dd');
    return p;
  }, [statusFilter, vendorFilter, dateFrom, dateTo]);

  const { data: vendorsData } = useVendors();
  const { data: ordersData, isLoading } = usePurchaseOrders(params);
  const createOrder = useCreatePurchaseOrder();

  const vendors = vendorsData?.results ?? [];
  const orders = ordersData?.results ?? [];

  const conditionLabel = (val: string) => {
    const map: Record<string, string> = {
      new: 'New', like_new: 'Like New', good: 'Good', fair: 'Fair',
      salvage: 'Salvage', mixed: 'Mixed',
    };
    return map[val] ?? '—';
  };

  const columns: GridColDef[] = [
    { field: 'order_number', headerName: 'Order #', width: 110 },
    { field: 'vendor_name', headerName: 'Vendor', width: 130 },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: ({ value }) => <StatusBadge status={value} size="small" />,
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'condition',
      headerName: 'Condition',
      width: 100,
      valueFormatter: (value) => (value ? conditionLabel(value) : '—'),
    },
    {
      field: 'item_count',
      headerName: 'Items',
      width: 70,
      type: 'number',
    },
    {
      field: 'ordered_date',
      headerName: 'Ordered',
      width: 105,
      valueFormatter: (value) => (value ? format(new Date(value), 'MMM d, yyyy') : '—'),
    },
    {
      field: 'expected_delivery',
      headerName: 'Expected',
      width: 105,
      valueFormatter: (value) => (value ? format(new Date(value), 'MMM d, yyyy') : '—'),
    },
    {
      field: 'delivered_date',
      headerName: 'Delivered',
      width: 105,
      valueFormatter: (value) => (value ? format(new Date(value), 'MMM d, yyyy') : '—'),
    },
    {
      field: 'total_cost',
      headerName: 'Cost',
      width: 95,
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'retail_value',
      headerName: 'Retail',
      width: 95,
      valueFormatter: (value) => formatCurrency(value),
    },
  ];

  const handleCreate = async () => {
    if (!form.vendor) return;
    try {
      const payload: Record<string, unknown> = {
        vendor: parseInt(form.vendor, 10),
        notes: form.notes,
      };
      if (form.order_number.trim()) payload.order_number = form.order_number.trim();
      if (form.ordered_date) {
        payload.ordered_date = format(form.ordered_date, 'yyyy-MM-dd');
      }
      if (form.expected_delivery) {
        payload.expected_delivery = format(form.expected_delivery, 'yyyy-MM-dd');
      }
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.condition) payload.condition = form.condition;
      if (form.retail_value) payload.retail_value = form.retail_value;
      if (form.item_count) payload.item_count = parseInt(form.item_count, 10);
      if (form.purchase_cost) payload.purchase_cost = form.purchase_cost;
      if (form.shipping_cost) payload.shipping_cost = form.shipping_cost;
      if (form.fees) payload.fees = form.fees;
      await createOrder.mutateAsync(payload);
      enqueueSnackbar('Order created', { variant: 'success' });
      setNewOpen(false);
      setForm({ vendor: '', order_number: '', ordered_date: null, expected_delivery: null, description: '', condition: '', retail_value: '', item_count: '', purchase_cost: '', shipping_cost: '', fees: '', notes: '' });
    } catch {
      enqueueSnackbar('Failed to create order', { variant: 'error' });
    }
  };

  const handleRowClick = ({ id }: { id: unknown }) => {
    navigate(`/inventory/orders/${id}`);
  };

  if (isLoading && orders.length === 0) return <LoadingScreen />;

  return (
    <Box>
      <PageHeader
        title="Purchase Orders"
        subtitle="Manage inventory purchase orders"
        action={
          <Button variant="contained" startIcon={<Add />} onClick={() => setNewOpen(true)}>
            New Order
          </Button>
        }
      />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            fullWidth
            size="small"
            select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {ORDER_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            fullWidth
            size="small"
            select
            label="Vendor"
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {vendors.map((v) => (
              <MenuItem key={v.id} value={String(v.id)}>
                {v.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <DatePicker
            label="From"
            value={dateFrom}
            onChange={setDateFrom}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <DatePicker
            label="To"
            value={dateTo}
            onChange={setDateTo}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
        </Grid>
      </Grid>

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={orders}
          columns={columns}
          loading={isLoading}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          onRowClick={(params) => handleRowClick({ id: params.id })}
          getRowId={(row: PurchaseOrder) => row.id}
          sx={{
            border: 'none',
            '& .MuiDataGrid-row': { cursor: 'pointer' },
          }}
        />
      </Box>

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Purchase Order</DialogTitle>
        <DialogContent dividers>
          {/* Vendor, Order # & Date */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                size="small"
                select
                label="Vendor"
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                required
              >
                <MenuItem value="">Select vendor</MenuItem>
                {vendors.map((v) => (
                  <MenuItem key={v.id} value={String(v.id)}>
                    {v.name} ({v.code})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Order Number"
                placeholder="Leave blank to auto-generate"
                value={form.order_number}
                onChange={(e) => setForm((f) => ({ ...f, order_number: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <DatePicker
                label="Ordered Date"
                value={form.ordered_date}
                onChange={(date) => setForm((f) => ({ ...f, ordered_date: date }))}
                slotProps={{ textField: { fullWidth: true, size: 'small', placeholder: 'Defaults to today' } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <DatePicker
                label="Expected Delivery"
                value={form.expected_delivery}
                onChange={(date) => setForm((f) => ({ ...f, expected_delivery: date }))}
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
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                select
                label="Condition"
                value={form.condition}
                onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
              >
                <MenuItem value="">Not Set</MenuItem>
                <MenuItem value="new">New</MenuItem>
                <MenuItem value="like_new">Like New</MenuItem>
                <MenuItem value="good">Used - Good</MenuItem>
                <MenuItem value="fair">Used - Fair</MenuItem>
                <MenuItem value="salvage">Salvage</MenuItem>
                <MenuItem value="mixed">Mixed</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Retail Value"
                type="number"
                inputProps={{ min: 0, step: '0.01' }}
                value={form.retail_value}
                onChange={(e) => setForm((f) => ({ ...f, retail_value: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="# Items"
                type="number"
                inputProps={{ min: 0 }}
                value={form.item_count}
                onChange={(e) => setForm((f) => ({ ...f, item_count: e.target.value }))}
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
                value={form.purchase_cost}
                onChange={(e) => setForm((f) => ({ ...f, purchase_cost: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Shipping"
                type="number"
                inputProps={{ min: 0, step: '0.01' }}
                value={form.shipping_cost}
                onChange={(e) => setForm((f) => ({ ...f, shipping_cost: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Fees"
                type="number"
                inputProps={{ min: 0, step: '0.01' }}
                value={form.fees}
                onChange={(e) => setForm((f) => ({ ...f, fees: e.target.value }))}
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
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            sx={{ mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!form.vendor || createOrder.isPending}
          >
            {createOrder.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
