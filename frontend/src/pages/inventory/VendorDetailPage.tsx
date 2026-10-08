import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
import { DataGrid } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { getOneVendorMetrics } from '../../api/inventory.api';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useVendor, useUpdateVendor, usePurchaseOrders, usePurchaseOrderPageMetrics } from '../../hooks/useInventory';
import { buildOrderListColumns, type OrderListRowView } from './orderList/orderListColumns';
import { parsePeriod, PeriodChoice, VendorMetricCards } from './vendors/vendorMetrics';
import type { VendorType } from '../../types/inventory.types';
import { IconBack as ArrowBack } from '../../icons/ecoIcons';

const VENDOR_TYPES: VendorType[] = ['liquidation', 'retail', 'direct', 'other'];

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const vendorId = id ? parseInt(id, 10) : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const period = parsePeriod(searchParams.get('period'));
  const setPeriod = (next: string) =>
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set('period', next);
        return n;
      },
      { replace: true },
    );
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
  const metrics = useQuery({
    queryKey: ['vendorMetrics', 'one', vendorId, period],
    queryFn: async () => (await getOneVendorMetrics(vendorId as number, period)).data,
    enabled: vendorId != null,
  });
  const periodStart = metrics.data?.start ?? null;
  const { data: ordersData, isLoading: ordersLoading } = usePurchaseOrders(
    vendorId != null
      ? {
          vendor: vendorId,
          page_size: 200,
          ordering: '-ordered_date',
          ...(periodStart ? { date_field: 'ordered_date', date_after: periodStart } : {}),
        }
      : undefined,
  );
  const updateVendor = useUpdateVendor();

  const orders = useMemo(() => ordersData?.results ?? [], [ordersData?.results]);
  const { data: orderMetrics } = usePurchaseOrderPageMetrics(orders.map((o) => o.id));
  const orderRows: OrderListRowView[] = useMemo(
    () => orders.map((o) => ({ ...o, metrics: orderMetrics?.orders?.[String(o.id)] ?? null })),
    [orders, orderMetrics?.orders],
  );
  // The Orders page's own columns (intake_updates Phase 6).
  const orderColumns = useMemo(
    () => buildOrderListColumns({ onReceive: (oid) => navigate(`/inventory/receiving/${oid}`) }),
    [navigate],
  );

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
            onClick={() => navigate(`/inventory/vendors?period=${period}`)}
          >
            Back
          </Button>
        }
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
        <PeriodChoice value={period} onChange={setPeriod} />
        <Typography variant="caption" color="text.secondary">
          By ordered date. Percents are weighted over this vendor's orders; - means no data yet.
        </Typography>
      </Box>
      <Box sx={{ mb: 2.5 }}>
        <VendorMetricCards m={metrics.data?.metrics} loading={metrics.isLoading} />
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Purchase Orders" />
        <Tab label="Details" />
      </Tabs>

      {tab === 1 && (
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

      {tab === 0 && (
        <Box sx={{ height: 600 }}>
          <DataGrid
            rows={orderRows}
            columns={orderColumns}
            rowHeight={64}
            loading={ordersLoading}
            getRowId={(row: OrderListRowView) => row.id}
            localeText={{ noRowsLabel: 'No orders from this vendor in this period.' }}
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
