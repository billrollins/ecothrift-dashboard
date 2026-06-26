import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Collapse,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import LocalShipping from '@mui/icons-material/LocalShipping';
import Search from '@mui/icons-material/Search';

import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format } from 'date-fns';
import CreatePurchaseOrderDialog from '../../components/inventory/CreatePurchaseOrderDialog';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useVendors,
  usePurchaseOrders,
  usePurchaseOrderSummary,
} from '../../hooks/useInventory';
import { formatCurrencyWhole, formatNumber } from '../../utils/format';
import type { PurchaseOrderListRow, PurchaseOrderStatus } from '../../types/inventory.types';
import { parseRichSearch, orderFiltersToApiParams } from '../../utils/richInventorySearch';

import { isPurchaseOrderDashboardVendorName } from '../../constants/purchaseOrdersDashboard';

type StatusBucket = 'all' | 'pending' | 'in_transit' | 'delivered' | 'processing' | 'complete';

function quietCurrency(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number.parseFloat(value);
  if (Number.isNaN(n) || n === 0) return '—';
  return formatCurrencyWhole(value);
}

function quietItems(n: number | null | undefined): string {
  if (n == null || n === 0) return '—';
  return formatNumber(n);
}

function vendorInitials(name: string, code?: string): string {
  const s = `${name || ''} ${code || ''}`.trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return s.slice(0, 2).toUpperCase();
}

function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}

function statusDotColor(status: PurchaseOrderStatus): string {
  switch (status) {
    case 'delivered':
    case 'complete':
      return '#2e7d32';
    case 'shipped':
      return '#3b82f6';
    case 'ordered':
    case 'paid':
      return '#eab308';
    case 'processing':
      return '#a855f7';
    case 'cancelled':
      return '#94a3b8';
    default:
      return '#64748b';
  }
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusParams(bucket: StatusBucket): Record<string, string> {
  switch (bucket) {
    case 'pending':
      return { status__in: 'ordered,paid' };
    case 'in_transit':
      return { status: 'shipped' };
    case 'delivered':
      return { status: 'delivered' };
    case 'processing':
      return { status: 'processing' };
    case 'complete':
      return { status: 'complete' };
    default:
      return {};
  }
}

function statusEligibleForReceiving(status: PurchaseOrderStatus): boolean {
  return !['delivered', 'complete', 'cancelled'].includes(status);
}

const BUCKET_TOGGLE_SX = {
  '& .MuiToggleButton-root': {
    textTransform: 'none',
    fontWeight: 500,
    fontSize: '0.8125rem',
    px: 1.5,
    py: 0.5,
    borderColor: '#e2e8f0',
    color: '#475569',
  },
  '& .Mui-selected': {
    bgcolor: '#f1f5f9 !important',
    color: '#0f172a !important',
  },
};

function focusIsInEditableField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(el.isContentEditable);
}

export default function OrderListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [statusBucket, setStatusBucket] = useState<StatusBucket>('all');
  const [vendorFilter, setVendorFilter] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const st = location.state as { openCreatePo?: boolean } | undefined;
    if (!st?.openCreatePo) return;
    setNewOpen(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'n') return;
      if (focusIsInEditableField()) return;
      e.preventDefault();
      setNewOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const listFilters = useMemo(() => {
    const parsed = parseRichSearch(debouncedSearch, 'orders');
    const rich = orderFiltersToApiParams(parsed);
    const p: Record<string, string | number> = {
      ...statusParams(statusBucket),
    };
    if (rich.search) p.search = rich.search;
    if (rich.order) p.order = rich.order;
    if (rich.vendor) p.vendor = rich.vendor;
    if (rich.status) p.status = rich.status;
    if (vendorFilter) p.vendor = vendorFilter;
    if (dateFrom) p.ordered_date_after = format(dateFrom, 'yyyy-MM-dd');
    if (dateTo) p.ordered_date_before = format(dateTo, 'yyyy-MM-dd');
    return p;
  }, [statusBucket, debouncedSearch, vendorFilter, dateFrom, dateTo]);

  const ordersParams = useMemo(
    () => ({
      ...listFilters,
      page: paginationModel.page + 1,
      page_size: paginationModel.pageSize,
    }),
    [listFilters, paginationModel.page, paginationModel.pageSize],
  );

  useEffect(() => {
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, [statusBucket, vendorFilter, dateFrom, dateTo, debouncedSearch]);

  const { data: vendorsData } = useVendors();
  const { data: ordersData, isLoading } = usePurchaseOrders(ordersParams, {
    placeholderData: keepPreviousData,
    staleTime: 45_000,
  });
  const { data: summary } = usePurchaseOrderSummary(listFilters, {
    placeholderData: keepPreviousData,
    staleTime: 45_000,
  });

  const vendors = useMemo(
    () => (vendorsData?.results ?? []).filter((v) => isPurchaseOrderDashboardVendorName(v.name)),
    [vendorsData?.results],
  );
  const orders = ordersData?.results ?? [];
  const totalCount = ordersData?.count ?? 0;

  const conditionLabel = (val: string) => {
    const map: Record<string, string> = {
      new: 'NEW',
      like_new: 'LIKE NEW',
      good: 'GOOD',
      fair: 'FAIR',
      salvage: 'SALV',
      mixed: 'MIXED',
    };
    return map[val] ?? '—';
  };

  if (isLoading && orders.length === 0) return <LoadingScreen />;

  const kpis = [
    {
      label: 'Total cost',
      value: summary ? formatCurrencyWhole(summary.total_cost) : '—',
      sub: `${summary?.total_orders ?? '—'} orders`,
    },
    {
      label: 'Est. retail value',
      value: summary ? formatCurrencyWhole(summary.retail_value) : '—',
      sub:
        summary != null ? `${summary.delivered_count} delivered (filtered)` : undefined,
    },
    {
      label: 'Items (line qty)',
      value: summary ? formatNumber(summary.items_received) : '—',
      sub: 'Sum of PO item counts',
    },
    {
      label: 'Margin',
      value:
        summary?.margin_percent != null ? `${summary.margin_percent.toFixed(1)}%` : '—',
      sub: summary?.margin_percent != null ? '(retail − cost) / retail' : undefined,
    },
  ];

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: '#f8fafc',
        fontFamily: '"DM Sans", "Inter", system-ui, sans-serif',
      }}
    >
      <Box sx={{ px: 2.5, pt: 2.5, pb: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            mb: 2,
          }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Purchase Orders
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {summary != null ? `${summary.total_orders} orders match filters` : ' '}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="medium"
            startIcon={<Add />}
            onClick={() => setNewOpen(true)}
            sx={{
              bgcolor: '#1e293b',
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': { bgcolor: '#334155' },
            }}
          >
            New Order
          </Button>
        </Box>

        {/* KPI cards */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
            gap: 2,
            mb: 2,
          }}
        >
          {kpis.map((k) => (
            <Paper key={k.label} variant="outlined" sx={{ p: 2, borderColor: '#e2e8f0', bgcolor: '#fff', borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: '0.04em' }}>
                {k.label}
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                {k.value}
              </Typography>
              {k.sub ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {k.sub}
                </Typography>
              ) : null}
            </Paper>
          ))}
        </Box>

        {/* Search + segments */}
        <Paper variant="outlined" sx={{ p: 2, mb: 1.5, borderColor: '#e2e8f0', borderRadius: 2, bgcolor: '#fff' }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search order #, vendor… or filters like {order=123; vendor=5; status=processing}"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              sx={{ minWidth: 260, flex: '1 1 200px' }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ color: '#94a3b8', fontSize: 22 }} />
                  </InputAdornment>
                ),
              }}
            />
            <ToggleButtonGroup
              exclusive
              size="small"
              color="standard"
              value={statusBucket}
              onChange={(_, v: StatusBucket | null) => v && setStatusBucket(v)}
              sx={BUCKET_TOGGLE_SX}
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="pending">Pending</ToggleButton>
              <ToggleButton value="in_transit">In transit</ToggleButton>
              <ToggleButton value="delivered">Delivered</ToggleButton>
              <ToggleButton value="processing">Processing</ToggleButton>
              <ToggleButton value="complete">Complete</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Button
            size="small"
            onClick={() => setAdvancedOpen((o) => !o)}
            endIcon={advancedOpen ? <ExpandLess /> : <ExpandMore />}
            sx={{ mt: 1, textTransform: 'none', color: 'text.secondary' }}
          >
            Vendor & date filters
          </Button>
        </Paper>

        <Collapse in={advancedOpen}>
          <Paper variant="outlined" sx={{ p: 2, mb: 1.5, borderColor: '#e2e8f0', borderRadius: 2, bgcolor: '#fff' }}>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 4 }}>
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
              <Grid size={{ xs: 6, sm: 3 }}>
                <DatePicker
                  label="Ordered from"
                  value={dateFrom}
                  onChange={setDateFrom}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <DatePicker label="Ordered to" value={dateTo} onChange={setDateTo} slotProps={{ textField: { size: 'small', fullWidth: true } }} />
              </Grid>
            </Grid>
          </Paper>
        </Collapse>

        {/* Table */}
        <Paper
          variant="outlined"
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            borderColor: '#e2e8f0',
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: '#fff',
          }}
        >
          <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 44, bgcolor: '#fff' }} />
                  <TableCell sx={{ fontWeight: 600, color: '#64748b', bgcolor: '#fff' }}>Order #</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#64748b', bgcolor: '#fff' }}>Vendor</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#64748b', bgcolor: '#fff' }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#64748b', bgcolor: '#fff' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#64748b', bgcolor: '#fff' }}>Cond.</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: '#64748b', bgcolor: '#fff' }}>
                    Items
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#64748b', bgcolor: '#fff' }}>Ordered</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#64748b', bgcolor: '#fff' }}>Delivered</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: '#64748b', bgcolor: '#fff' }}>
                    Cost
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: '#64748b', bgcolor: '#fff' }}>
                    Retail
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!isLoading && orders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={12}
                      sx={{
                        py: 6,
                        textAlign: 'center',
                        color: 'text.secondary',
                        borderBottom: 'none',
                      }}
                    >
                      No purchase orders match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    onClick={() => navigate(`/inventory/orders/${row.id}`)}
                    sx={{
                      cursor: 'pointer',
                      transition: 'background-color 120ms ease',
                      '& td': {
                        borderBottom: '1px solid #f1f5f9',
                        verticalAlign: 'middle',
                      },
                      '&:hover': { bgcolor: '#f8fafc' },
                      '& .row-actions': { opacity: 0, transition: 'opacity 120ms ease' },
                      '&:hover .row-actions': { opacity: 1 },
                    }}
                  >
                    <TableCell
                      sx={{ width: 44, py: 0.5 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {statusEligibleForReceiving(row.status) ? (
                        <Tooltip title="Receive shipment">
                          <IconButton
                            size="small"
                            className="row-actions"
                            aria-label={`Receive shipment — order ${row.order_number ?? row.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/inventory/receiving/${row.id}`);
                            }}
                          >
                            <LocalShipping fontSize="small" sx={{ color: '#2e7d32' }} />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Box sx={{ width: 34, height: 34 }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#0f172a' }}>
                      {row.order_number}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <Avatar
                          sx={{
                            width: 32,
                            height: 32,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            bgcolor: `hsl(${hueFromString(row.vendor_name || '')}, 45%, 88%)`,
                            color: `hsl(${hueFromString(row.vendor_name || '')}, 50%, 30%)`,
                          }}
                          variant="rounded"
                        >
                          {vendorInitials(row.vendor_name, row.vendor_code)}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" noWrap title={row.vendor_name} sx={{ fontWeight: 600, color: '#334155' }}>
                            {row.vendor_name || '—'}
                          </Typography>
                          {row.vendor_code ? (
                            <Typography variant="caption" color="text.secondary">
                              {row.vendor_code}
                            </Typography>
                          ) : null}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" noWrap title={row.description} sx={{ color: '#475569' }}>
                        {row.description || (
                          <Box component="span" sx={{ color: '#cbd5e1' }}>
                            —
                          </Box>
                        )}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: statusDotColor(row.status),
                                flexShrink: 0,
                              }}
                            />
                            <Box component="span" sx={{ textTransform: 'capitalize' }}>
                              {formatStatusLabel(row.status)}
                            </Box>
                          </Box>
                        }
                        sx={{
                          fontWeight: 600,
                          bgcolor: `${statusDotColor(row.status)}14`,
                          color: '#0f172a',
                          border: 'none',
                          height: 28,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ letterSpacing: 0.08, fontWeight: 700, color: '#64748b' }}>
                        {conditionLabel(row.condition)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#334155' }}>
                      {quietItems(row.item_count)}
                    </TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums', color: '#475569', whiteSpace: 'nowrap' }}>
                      {row.ordered_date ? format(new Date(row.ordered_date), 'MMM d, yyyy') : (
                        <Box component="span" sx={{ color: '#cbd5e1' }}>—</Box>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums', color: '#475569', whiteSpace: 'nowrap' }}>
                      {row.delivered_date ? format(new Date(row.delivered_date), 'MMM d, yyyy') : (
                        <Box component="span" sx={{ color: '#cbd5e1' }}>—</Box>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#334155' }}>
                      {quietCurrency(row.total_cost)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#334155' }}>
                      {quietCurrency(row.retail_value)}
                    </TableCell>
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={totalCount}
            page={paginationModel.page}
            onPageChange={(_, p) => setPaginationModel((m) => ({ ...m, page: p }))}
            rowsPerPage={paginationModel.pageSize}
            onRowsPerPageChange={(e) =>
              setPaginationModel({
                page: 0,
                pageSize: parseInt(e.target.value, 10),
              })
            }
            rowsPerPageOptions={[25, 50, 100]}
          />
        </Paper>
      </Box>

      <CreatePurchaseOrderDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </Box>
  );
}
