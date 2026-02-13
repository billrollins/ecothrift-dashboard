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
  'in_transit',
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
  const [form, setForm] = useState({ vendor: '', notes: '' });

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

  const columns: GridColDef[] = [
    { field: 'order_number', headerName: 'Order #', width: 120 },
    { field: 'vendor_name', headerName: 'Vendor', flex: 1, minWidth: 160 },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: ({ value }) => <StatusBadge status={value} size="small" />,
    },
    {
      field: 'ordered_date',
      headerName: 'Ordered',
      width: 110,
      valueFormatter: (value) => (value ? format(new Date(value), 'MMM d, yyyy') : '—'),
    },
    {
      field: 'expected_delivery',
      headerName: 'Expected',
      width: 110,
      valueFormatter: (value) => (value ? format(new Date(value), 'MMM d, yyyy') : '—'),
    },
    {
      field: 'delivered_date',
      headerName: 'Delivered',
      width: 110,
      valueFormatter: (value) => (value ? format(new Date(value), 'MMM d, yyyy') : '—'),
    },
    {
      field: 'total_cost',
      headerName: 'Cost',
      width: 100,
      valueFormatter: (value) => formatCurrency(value),
    },
  ];

  const handleCreate = async () => {
    if (!form.vendor) return;
    try {
      await createOrder.mutateAsync({ vendor: parseInt(form.vendor, 10), notes: form.notes });
      enqueueSnackbar('Order created', { variant: 'success' });
      setNewOpen(false);
      setForm({ vendor: '', notes: '' });
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
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
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
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Grid>
          </Grid>
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
