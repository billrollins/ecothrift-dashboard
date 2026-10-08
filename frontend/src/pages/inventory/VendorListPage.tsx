import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  InputAdornment,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataGrid, type GridColDef, type GridRenderCellParams } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { getVendorMetrics, type VendorMetrics } from '../../api/inventory.api';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useVendors, useCreateVendor } from '../../hooks/useInventory';
import { parseRichSearch, vendorFiltersToApiParams } from '../../utils/richInventorySearch';

import type { Vendor, VendorType } from '../../types/inventory.types';
import { days, landedColor, money, num, parsePeriod, pct, PeriodChoice, shortDate } from './vendors/vendorMetrics';
import { IconAdd as Add, IconRefresh as Refresh, IconSearch as Search } from '../../icons/ecoIcons';

const VENDOR_TYPES: VendorType[] = ['liquidation', 'retail', 'direct', 'other'];

type VendorRow = Vendor & { m: VendorMetrics | null };

/** A metric column (intake_updates Phase 6): sorts on the number, shows `-` when there is none. */
function metricCol(
  field: string,
  headerName: string,
  get: (m: VendorMetrics) => string | number | null,
  show: (m: VendorMetrics) => string,
  opts: { width?: number; tip: string; color?: (m: VendorMetrics) => string | undefined; sub?: (m: VendorMetrics) => string },
): GridColDef<VendorRow> {
  return {
    field,
    headerName,
    description: opts.tip,
    width: opts.width ?? 112,
    type: 'number',
    valueGetter: (_v, row) => (row.m ? num(get(row.m)) : null),
    sortComparator: (a, b) => (a ?? -Infinity) - (b ?? -Infinity),
    renderCell: (p: GridRenderCellParams<VendorRow>) => {
      const m = p.row.m;
      return (
        <Box sx={{ textAlign: 'right', width: '100%', lineHeight: 1.2 }}>
          <Typography
            component="div"
            sx={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: m ? opts.color?.(m) : undefined }}
          >
            {m ? show(m) : '-'}
          </Typography>
          {m && opts.sub ? (
            <Typography component="div" variant="caption" color="text.secondary" noWrap>
              {opts.sub(m)}
            </Typography>
          ) : null}
        </Box>
      );
    },
  };
}

export default function VendorListPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
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
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    vendor_type: 'other' as VendorType,
    contact_name: '',
    contact_email: '',
    contact_phone: '',
  });

  const params = useMemo(() => {
    const parsed = parseRichSearch(search, 'vendors');
    const p: Record<string, string | number> = { page_size: 200 };
    const rich = vendorFiltersToApiParams(parsed);
    if (rich.search) p.search = rich.search;
    if (rich.vendor) p.vendor = rich.vendor;
    if (rich.vendor_type) p.vendor_type = rich.vendor_type;
    else if (typeFilter) p.vendor_type = typeFilter;
    if (rich.is_active) p.is_active = rich.is_active;
    return p;
  }, [search, typeFilter]);

  const { data, isLoading } = useVendors(params);
  const createVendor = useCreateVendor();

  const vendors = useMemo(() => data?.results ?? [], [data?.results]);
  const metrics = useQuery({
    queryKey: ['vendorMetrics', period],
    queryFn: async () => (await getVendorMetrics(period)).data,
    staleTime: 5 * 60_000,
  });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const { data: fresh } = await getVendorMetrics(period, true);
      queryClient.setQueryData(['vendorMetrics', period], fresh);
    } finally {
      setRefreshing(false);
    }
  };
  const rows: VendorRow[] = useMemo(
    () => vendors.map((v) => ({ ...v, m: metrics.data?.vendors[String(v.id)] ?? null })),
    [vendors, metrics.data],
  );
  const computedAt = metrics.data?.computed_at ? new Date(metrics.data.computed_at) : null;

  const columns: GridColDef<VendorRow>[] = [
    {
      field: 'name',
      headerName: 'Vendor',
      flex: 1,
      minWidth: 200,
      renderCell: ({ row }: GridRenderCellParams<VendorRow>) => {
        const contact = [row.contact_name, row.contact_phone].filter(Boolean).join(' · ');
        return (
          <Box sx={{ minWidth: 0, lineHeight: 1.2 }}>
            <Typography noWrap sx={{ fontWeight: 700, fontSize: 13 }}>
              {row.name}{' '}
              <Typography component="span" color="text.secondary" sx={{ fontSize: 12, fontWeight: 600 }}>
                {row.code}
              </Typography>
            </Typography>
            <Typography noWrap variant="caption" color="text.secondary" component="div">
              {contact || String(row.vendor_type).replace(/_/g, ' ')}
            </Typography>
          </Box>
        );
      },
    },
    metricCol('orders', 'Orders', (m) => m.orders, (m) => String(m.orders), {
      width: 104,
      tip: 'Number of orders in the period; under it, the last order date.',
      sub: (m) => shortDate(m.last_ordered),
    }),
    metricCol('spent', 'Spent', (m) => m.spent, (m) => money(m.spent), {
      width: 110,
      tip: 'Sum of Total cost.',
      color: () => '#7f1d1d',
    }),
    metricCol('landed', 'Landed %', (m) => m.landed_pct, (m) => pct(m.landed_pct), {
      tip: 'Total cost ÷ manifest total retail (orders with a manifest). About 20% is a normal buy.',
      color: (m) => landedColor(m.landed_pct),
    }),
    metricCol('priced', 'Priced %', (m) => m.priced_pct_of_retail, (m) => pct(m.priced_pct_of_retail), {
      tip: 'Priced (starting) ÷ processor-approved retail of the items checked in.',
      color: () => '#14532d',
    }),
    metricCol('accuracy', 'Manifest acc.', (m) => m.manifest_accuracy, (m) => pct(m.manifest_accuracy), {
      width: 120,
      tip: 'Processor-approved retail of everything checked in ÷ manifest total. Near 100% means the manifests can be trusted.',
    }),
    metricCol('sold_pct', '% sold', (m) => m.sold_pct, (m) => pct(m.sold_pct), {
      width: 96,
      tip: 'Sold ÷ Priced (starting): sell-through in dollars.',
      color: () => '#22a35a',
    }),
    metricCol('recovery', 'Recovery', (m) => m.recovery_actual, (m) => pct(m.recovery_actual), {
      width: 104,
      tip: 'Sold ÷ Total cost (recovery actual).',
    }),
    metricCol('days', 'Days to sell', (m) => m.days_to_sell, (m) => days(m.days_to_sell), {
      width: 110,
      tip: 'Median days from check-in to sale, sold items only.',
    }),
    {
      field: 'is_active',
      headerName: 'Status',
      width: 100,
      renderCell: ({ value }) => (
        <StatusBadge status={value ? 'active' : 'closed'} size="small" />
      ),
    },
  ];

  const handleCreate = async () => {
    try {
      await createVendor.mutateAsync(form);
      enqueueSnackbar('Vendor created', { variant: 'success' });
      setAddOpen(false);
      setForm({ name: '', code: '', vendor_type: 'other', contact_name: '', contact_email: '', contact_phone: '' });
    } catch {
      enqueueSnackbar('Failed to create vendor', { variant: 'error' });
    }
  };

  if (isLoading && vendors.length === 0) return <LoadingScreen />;

  return (
    <Box>
      <PageHeader
        title="Vendors"
        subtitle="How each vendor performs. Percents are weighted over the vendor's orders; - means no data yet."
        action={
          <Button variant="contained" startIcon={<Add />} onClick={() => setAddOpen(true)}>
            Add Vendor
          </Button>
        }
      />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search vendors… or filters like {vendor=123; type=liquidation; active=true}"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            size="small"
            select
            label="Type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {VENDOR_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
        <PeriodChoice value={period} onChange={setPeriod} />
        <Typography variant="caption" color="text.secondary">
          {metrics.isFetching || refreshing
            ? 'Working out the numbers…'
            : computedAt
              ? `By ordered date. Numbers as of ${computedAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
              : ''}
        </Typography>
        <Button
          size="small"
          startIcon={<Refresh fontSize="small" />}
          onClick={refresh}
          disabled={refreshing || metrics.isFetching}
          sx={{ textTransform: 'none' }}
        >
          Refresh
        </Button>
      </Box>

      <Box sx={{ height: 640 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          rowHeight={52}
          loading={isLoading}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
            sorting: { sortModel: [{ field: 'spent', sort: 'desc' }] },
          }}
          onRowClick={(p) => navigate(`/inventory/vendors/${p.id}?period=${period}`)}
          getRowId={(row: VendorRow) => row.id}
          sx={{
            border: 'none',
            '& .MuiDataGrid-row': { cursor: 'pointer' },
          }}
        />
      </Box>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Vendor</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
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
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Contact Name"
                value={form.contact_name}
                onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Contact Email"
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Contact Phone"
                value={form.contact_phone}
                onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!form.name || createVendor.isPending}
          >
            {createVendor.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
