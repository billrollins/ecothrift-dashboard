import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useVendor, useUpdateVendor, usePurchaseOrders } from '../../hooks/useInventory';
import type { VendorType, PurchaseOrder } from '../../types/inventory.types';

const VENDOR_TYPES: VendorType[] = ['liquidation', 'retail', 'direct', 'other'];

function formatCurrency(value: string | null): string {
  if (value == null) return '—';
  const n = parseFloat(value);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const vendorId = id ? parseInt(id, 10) : null;
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState({
    name: '',
    code: '',
    vendor_type: 'other' as VendorType,
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    address: '',
    notes: '',
  });

  const { data: vendor, isLoading } = useVendor(vendorId);
  const { data: ordersData, isLoading: ordersLoading } = usePurchaseOrders(
    vendorId != null ? { vendor: vendorId } : undefined
  );
  const updateVendor = useUpdateVendor();

  const orders = ordersData?.results ?? [];

  useEffect(() => {
    if (vendor) {
      setForm({
        name: vendor.name,
        code: vendor.code,
        vendor_type: vendor.vendor_type,
        contact_name: vendor.contact_name ?? '',
        contact_email: vendor.contact_email ?? '',
        contact_phone: vendor.contact_phone ?? '',
        address: vendor.address ?? '',
        notes: vendor.notes ?? '',
      });
    }
  }, [vendor]);

  const handleSave = async () => {
    if (!vendorId) return;
    try {
      await updateVendor.mutateAsync({ id: vendorId, data: form });
      enqueueSnackbar('Vendor updated', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to update vendor', { variant: 'error' });
    }
  };

  const orderColumns: GridColDef[] = [
    { field: 'order_number', headerName: 'Order #', width: 120 },
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
      field: 'total_cost',
      headerName: 'Cost',
      width: 100,
      valueFormatter: (value) => formatCurrency(value),
    },
  ];

  if (isLoading && !vendor) return <LoadingScreen />;
  if (!vendor) return <Typography>Vendor not found.</Typography>;

  return (
    <Box>
      <PageHeader
        title={vendor.name}
        subtitle={`Code: ${vendor.code} • ${vendor.vendor_type.replace(/_/g, ' ')}`}
        action={
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={() => navigate('/inventory/vendors')}
          >
            Back
          </Button>
        }
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Details" />
        <Tab label="Purchase Orders" />
      </Tabs>

      {tab === 0 && (
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  select
                  label="Type"
                  value={form.vendor_type}
                  onChange={(e) => setForm((f) => ({ ...f, vendor_type: e.target.value as VendorType }))}
                >
                  {VENDOR_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Contact Name"
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Contact Email"
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Contact Phone"
                  value={form.contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Address"
                  multiline
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Notes"
                  multiline
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={updateVendor.isPending}
                >
                  {updateVendor.isPending ? 'Saving...' : 'Save'}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {tab === 1 && (
        <Box sx={{ height: 400 }}>
          <DataGrid
            rows={orders}
            columns={orderColumns}
            loading={ordersLoading}
            getRowId={(row: PurchaseOrder) => row.id}
            onRowClick={(params) => navigate(`/inventory/orders/${params.id}`)}
            sx={{
              border: 'none',
              '& .MuiDataGrid-row': { cursor: 'pointer' },
            }}
          />
        </Box>
      )}
    </Box>
  );
}
