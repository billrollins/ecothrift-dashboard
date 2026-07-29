import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Grid,
  InputAdornment,
  MenuItem,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import FilterList from '@mui/icons-material/FilterList';
import Search from '@mui/icons-material/Search';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import {
  DataGrid,
  type GridColumnVisibilityModel,
  type GridRowSelectionModel,
} from '@mui/x-data-grid';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import CreatePurchaseOrderDialog from '../../components/inventory/CreatePurchaseOrderDialog';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  usePurchaseOrders,
  usePurchaseOrderPageMetrics,
  usePurchaseOrderSummary,
} from '../../hooks/useInventory';
import type { PurchaseOrderCondition } from '../../types/inventory.types';
import {
  buildOrderListColumns,
  orderListColumnVisibility,
  orderListIsCompact,
  type OrderListRowView,
} from './orderList/orderListColumns';
import { ProfitabilitySummary } from './orderList/ProfitabilitySummary';
import {
  activeFilterChips,
  applyDelivered90to60,
  applyLast60Days,
  clearAllFilters,
  clearChip,
  filterFingerprint,
  isDelivered90to60Active,
  isLast60DaysActive,
  orderListStateToApiParams,
  orderListStateToSearchParams,
  parseOrderListSearchParams,
  type OrderDateField,
  type OrderListUrlState,
  type StatusBucket,
} from './orderList/urlState';

const QUICK_FILTER_IDLE_SX = {
  textTransform: 'none',
  borderColor: '#cbd5e1',
  color: '#334155',
  fontWeight: 600,
} as const;

const QUICK_FILTER_ACTIVE_SX = {
  textTransform: 'none',
  fontWeight: 700,
  bgcolor: '#1e293b',
  color: '#fff',
  borderColor: '#1e293b',
  '&:hover': { bgcolor: '#334155', borderColor: '#334155' },
} as const;

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

/** Map DataGrid include/exclude model → selected ids on the current page (ids are string GridRowIds). */
function rowSelectionModelToPageIds(
  model: GridRowSelectionModel,
  pageRowIds: number[],
): number[] {
  if (model.type === 'exclude') {
    const excluded = new Set([...model.ids].map(String));
    return pageRowIds.filter((id) => !excluded.has(String(id)));
  }
  const included = new Set([...model.ids].map(String));
  return pageRowIds.filter((id) => included.has(String(id)));
}

const CONDITIONS: PurchaseOrderCondition[] = [
  'new',
  'like_new',
  'good',
  'fair',
  'salvage',
  'mixed',
];

const DATE_FIELD_OPTIONS: Array<{ value: OrderDateField; label: string }> = [
  { value: 'delivered_date', label: 'Delivered' },
  { value: 'shipped_date', label: 'Shipped' },
  { value: 'paid_date', label: 'Paid' },
  { value: 'ordered_date', label: 'Ordered' },
];

export default function OrderListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  // Column fit is driven by the grid's own width, not the viewport: the staff
  // sidebar means the two differ by a few hundred pixels.
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const [state, setState] = useState<OrderListUrlState>(() =>
    parseOrderListSearchParams(searchParams),
  );
  const [searchDraft, setSearchDraft] = useState(state.search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Keep URL in sync with filter/pagination state (shareable views).
  useEffect(() => {
    const next = orderListStateToSearchParams(state);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [state, searchParams, setSearchParams]);

  useEffect(() => {
    const st = location.state as
      | { openCreatePo?: boolean; receiveError?: boolean; receiveEmpty?: boolean }
      | undefined;
    if (!st) return;
    if (st.openCreatePo) setNewOpen(true);
    if (st.receiveError) {
      enqueueSnackbar('Could not open receiving — try again from an order.', { variant: 'error' });
    }
    if (st.receiveEmpty) {
      enqueueSnackbar('No orders are waiting to be received.', { variant: 'info' });
    }
    if (st.openCreatePo || st.receiveError || st.receiveEmpty) {
      navigate(location.pathname + location.search, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate, enqueueSnackbar]);

  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setGridWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  // Clear selection when filters change
  const fingerprint = filterFingerprint(state);
  useEffect(() => {
    setSelectedIds([]);
  }, [fingerprint]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const trimmed = searchDraft.trim();
      setState((s) => (s.search === trimmed ? s : { ...s, search: trimmed, page: 0 }));
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchDraft]);

  const listParams = useMemo(() => orderListStateToApiParams(state), [state]);
  const summaryParams = useMemo(() => {
    const { page: _p, page_size: _ps, ...rest } = listParams;
    if (selectedIds.length) return { ...rest, ids: selectedIds.join(',') };
    return rest;
  }, [listParams, selectedIds]);

  const { data: ordersData, isLoading, isFetching } = usePurchaseOrders(listParams, {
    placeholderData: keepPreviousData,
    staleTime: 45_000,
  });
  const { data: summary, isLoading: summaryLoading } = usePurchaseOrderSummary(summaryParams, {
    placeholderData: keepPreviousData,
    staleTime: 45_000,
  });

  const pageIds = useMemo(
    () => (ordersData?.results ?? []).map((r) => r.id),
    [ordersData?.results],
  );
  const { data: pageMetrics } = usePurchaseOrderPageMetrics(pageIds, {
    placeholderData: keepPreviousData,
    staleTime: 45_000,
  });

  const rows: OrderListRowView[] = useMemo(
    () =>
      (ordersData?.results ?? []).map((r) => ({
        ...r,
        metrics: pageMetrics?.orders?.[String(r.id)] ?? null,
      })),
    [ordersData?.results, pageMetrics?.orders],
  );
  const totalCount = ordersData?.count ?? 0;

  const columns = useMemo(
    () =>
      buildOrderListColumns({
        onReceive: (id) => navigate(`/inventory/receiving/${id}`),
        compact: orderListIsCompact(gridWidth),
      }),
    [navigate, gridWidth],
  );

  const chips = activeFilterChips(state);

  const selectionModel: GridRowSelectionModel = useMemo(
    () => ({ type: 'include', ids: new Set(selectedIds.map(String)) }),
    [selectedIds],
  );

  const handleRowSelectionModelChange = useCallback(
    (model: GridRowSelectionModel) => {
      const selectedOnPage = rowSelectionModelToPageIds(model, pageIds);
      const pageSet = new Set(pageIds);
      setSelectedIds((prev) => {
        const keep = prev.filter((id) => !pageSet.has(id));
        return [...keep, ...selectedOnPage];
      });
    },
    [pageIds],
  );

  const visibilityModel: GridColumnVisibilityModel = useMemo(
    () => orderListColumnVisibility(gridWidth),
    [gridWidth],
  );

  if (isLoading && rows.length === 0) return <LoadingScreen />;

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
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            mb: 1.5,
          }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Purchase Orders
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isFetching && rows.length > 0 ? 'Updating…' : 'Select orders to compare profitability'}
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

        <ProfitabilitySummary
          summary={summary}
          loading={summaryLoading}
          selectedCount={selectedIds.length}
          matchCount={summary?.total_orders ?? totalCount}
          onClearSelection={() => setSelectedIds([])}
        />

        <Paper variant="outlined" sx={{ p: 2, mb: 1.5, borderColor: '#e2e8f0', borderRadius: 2, bgcolor: '#fff' }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search order number or description"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              sx={{ minWidth: 240, flex: '1 1 200px' }}
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
              value={state.statusBucket}
              onChange={(_, v: StatusBucket | null) =>
                v && setState((s) => ({ ...s, statusBucket: v, page: 0 }))
              }
              sx={BUCKET_TOGGLE_SX}
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="pending">Pending</ToggleButton>
              <ToggleButton value="in_transit">In transit</ToggleButton>
              <ToggleButton value="delivered">Delivered</ToggleButton>
              <ToggleButton value="processing">Processing</ToggleButton>
              <ToggleButton value="complete">Complete</ToggleButton>
            </ToggleButtonGroup>
            <Button
              size="small"
              variant={isDelivered90to60Active(state) ? 'contained' : 'outlined'}
              onClick={() => setState((s) => applyDelivered90to60(s))}
              sx={isDelivered90to60Active(state) ? QUICK_FILTER_ACTIVE_SX : QUICK_FILTER_IDLE_SX}
              title="Orders delivered 90–60 days ago"
              aria-pressed={isDelivered90to60Active(state)}
            >
              90–60
            </Button>
            <Button
              size="small"
              variant={isLast60DaysActive(state) ? 'contained' : 'outlined'}
              onClick={() => setState((s) => applyLast60Days(s))}
              sx={isLast60DaysActive(state) ? QUICK_FILTER_ACTIVE_SX : QUICK_FILTER_IDLE_SX}
              title="All orders ordered in the last 60 days"
              aria-pressed={isLast60DaysActive(state)}
            >
              Last 60
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={pageIds.length === 0}
              onClick={() => setSelectedIds(pageIds)}
              sx={{ textTransform: 'none', borderColor: '#cbd5e1', color: '#334155' }}
              title="Select all orders on this page (current filters)"
            >
              Select visible
            </Button>
            <Button
              size="small"
              variant={state.includeOlder ? 'contained' : 'outlined'}
              onClick={() =>
                setState((s) => ({ ...s, includeOlder: !s.includeOlder, page: 0 }))
              }
              sx={{
                textTransform: 'none',
                ...(state.includeOlder
                  ? { bgcolor: '#475569', '&:hover': { bgcolor: '#334155' } }
                  : { borderColor: '#cbd5e1', color: '#64748b' }),
              }}
              title={
                state.includeOlder
                  ? 'Hide orders older than ~6 months'
                  : 'Show orders older than ~6 months (slower)'
              }
            >
              {state.includeOlder ? 'Showing older' : 'Older orders'}
            </Button>
            <Button
              size="small"
              startIcon={<FilterList />}
              endIcon={filtersOpen ? <ExpandLess /> : <ExpandMore />}
              onClick={() => setFiltersOpen((o) => !o)}
              sx={{ textTransform: 'none', color: 'text.secondary' }}
            >
              More filters
            </Button>
          </Box>

          {chips.length > 0 ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.25, alignItems: 'center' }}>
              {chips.map((c) => (
                <Chip
                  key={c.id}
                  size="small"
                  label={c.label}
                  onDelete={() => setState((s) => clearChip(s, c.id))}
                />
              ))}
              <Button
                size="small"
                onClick={() => setState((s) => clearAllFilters(s))}
                sx={{ textTransform: 'none', minWidth: 0 }}
              >
                Clear all
              </Button>
            </Box>
          ) : null}

          <Collapse in={filtersOpen}>
            <Grid container spacing={1.5} sx={{ mt: 1 }}>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  fullWidth
                  size="small"
                  select
                  label="Condition"
                  value={state.condition}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      condition: e.target.value as PurchaseOrderCondition | '',
                      page: 0,
                    }))
                  }
                >
                  <MenuItem value="">All</MenuItem>
                  {CONDITIONS.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c.replace(/_/g, ' ')}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  fullWidth
                  size="small"
                  select
                  label="Date type"
                  value={state.dateField}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      dateField: e.target.value as OrderDateField,
                      page: 0,
                    }))
                  }
                >
                  {DATE_FIELD_OPTIONS.map((o) => (
                    <MenuItem key={o.value} value={o.value}>
                      {o.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 6, sm: 2 }}>
                <DatePicker
                  label="From"
                  value={state.dateFrom ? parseISO(state.dateFrom) : null}
                  onChange={(d) =>
                    setState((s) => ({
                      ...s,
                      dateFrom: d ? format(d, 'yyyy-MM-dd') : null,
                      page: 0,
                    }))
                  }
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 2 }}>
                <DatePicker
                  label="To"
                  value={state.dateTo ? parseISO(state.dateTo) : null}
                  onChange={(d) =>
                    setState((s) => ({
                      ...s,
                      dateTo: d ? format(d, 'yyyy-MM-dd') : null,
                      page: 0,
                    }))
                  }
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Items ≥"
                  value={state.itemCountMin}
                  onChange={(e) =>
                    setState((s) => ({ ...s, itemCountMin: e.target.value.replace(/\D/g, ''), page: 0 }))
                  }
                  inputProps={{ inputMode: 'numeric' }}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Items ≤"
                  value={state.itemCountMax}
                  onChange={(e) =>
                    setState((s) => ({ ...s, itemCountMax: e.target.value.replace(/\D/g, ''), page: 0 }))
                  }
                  inputProps={{ inputMode: 'numeric' }}
                />
              </Grid>
            </Grid>
          </Collapse>
        </Paper>

        <Paper
          ref={gridWrapRef}
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
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(r) => String(r.id)}
            checkboxSelection
            disableRowSelectionOnClick
            disableRowSelectionExcludeModel
            keepNonExistentRowsSelected
            rowSelectionModel={selectionModel}
            onRowSelectionModelChange={handleRowSelectionModelChange}
            columnVisibilityModel={visibilityModel}
            paginationMode="server"
            sortingMode="server"
            rowCount={totalCount}
            rowHeight={64}
            columnHeaderHeight={48}
            paginationModel={{ page: state.page, pageSize: state.pageSize }}
            onPaginationModelChange={(pm) =>
              setState((s) => ({ ...s, page: pm.page, pageSize: pm.pageSize }))
            }
            onSortModelChange={(model) => {
              const first = model[0];
              if (!first?.field) {
                setState((s) => ({ ...s, ordering: 'milestones', page: 0 }));
                return;
              }
              const map: Record<string, string> = {
                status: 'status',
                order_number: 'order_number',
                item_count: 'item_count',
                cost: 'total_cost',
                retail: 'retail_value',
              };
              const field = map[first.field];
              if (!field) return;
              const prefix = first.sort === 'desc' ? '-' : '';
              setState((s) => ({ ...s, ordering: `${prefix}${field}`, page: 0 }));
            }}
            pageSizeOptions={[25, 50, 100]}
            loading={isFetching}
            onRowClick={(params) => navigate(`/inventory/orders/${params.id}`)}
            sx={{
              border: 0,
              width: '100%',
              '& .MuiDataGrid-main': { width: '100%' },
              '& .MuiDataGrid-row': { cursor: 'pointer' },
              '& .MuiDataGrid-columnHeaders': { bgcolor: '#fff', color: '#64748b' },
              '& .MuiDataGrid-cell': {
                borderColor: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                px: 1.25,
              },
              '& .MuiDataGrid-columnHeader': { px: 1.25 },
              '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
            }}
            slotProps={{
              loadingOverlay: { variant: 'linear-progress', noRowsVariant: 'skeleton' },
            }}
            localeText={{
              noRowsLabel: 'No purchase orders match your filters.',
              checkboxSelectionSelectAllRows: 'Select all rows on this page',
              checkboxSelectionUnselectAllRows: 'Deselect all rows on this page',
            }}
          />
        </Paper>
      </Box>

      <CreatePurchaseOrderDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </Box>
  );
}
