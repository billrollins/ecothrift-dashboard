import { useState, useMemo, useEffect, useCallback } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import Clear from '@mui/icons-material/Clear';
import { DataGrid, type GridColDef, type GridRowsProp } from '@mui/x-data-grid';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useCartSummary, useCarts } from '../../hooks/usePOS';
import { paymentMethodLabel } from '../../utils/posPayment';
import { useUsers } from '../../hooks/useEmployees';
import type { Cart } from '../../types/pos.types';
import { useObjectModal } from '../../components/objects/ObjectModal';
import { SalesNumbersBlock } from '../../components/pos/SalesNumbersBlock';
import { format, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { IconSearch as Search } from '../../icons/ecoIcons';
import { useSearchParams } from 'react-router-dom';
import ReturnsGrid, { type ReturnsFilters } from '../../components/pos/returns/ReturnsGrid';
function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

/** One-tap date ranges for the From/To boxes. Weeks start Monday. */
function datePresets(): { label: string; from: string; to: string }[] {
  const today = new Date();
  return [
    { label: 'Today', from: ymd(today), to: ymd(today) },
    { label: 'Yesterday', from: ymd(subDays(today, 1)), to: ymd(subDays(today, 1)) },
    { label: 'This week', from: ymd(startOfWeek(today, { weekStartsOn: 1 })), to: ymd(today) },
    { label: 'This month', from: ymd(startOfMonth(today)), to: ymd(today) },
    { label: 'Last 30 days', from: ymd(subDays(today, 29)), to: ymd(today) },
    { label: 'All time', from: '', to: '' },
  ];
}

/** A Thrift+ money cell: blank for a guest sale or nothing, so the column reads at a glance. */
function thriftMoney(value: number): string {
  return value > 0 ? formatCurrency(value) : '';
}

type Show = 'checkouts' | 'returns';

/**
 * Transactions (Retail, #72 Bill 2026-11-04: "checkouts and returns"): two tabs on one set of filters. Checkouts are
 * the sales; Returns are the Thrift+ returns, each on the day it came back (`ReturnsGrid`). `?show=returns` opens the
 * Returns tab and `&late=1` the late ones only (the Owner page's "Late returns taken" link). A row opens its Sale window.
 */
export default function TransactionListPage() {
  const [urlParams, setUrlParams] = useSearchParams();
  const show: Show = urlParams.get('show') === 'returns' ? 'returns' : 'checkouts';
  const lateOnly = show === 'returns' && urlParams.get('late') === '1';
  const setShow = (next: Show, late = false) => {
    const p = new URLSearchParams(urlParams);
    if (next === 'returns') p.set('show', 'returns');
    else p.delete('show');
    if (late) p.set('late', '1');
    else p.delete('late');
    setUrlParams(p, { replace: true });
  };
  // `?from=` (the Owner page's "last 7 days") starts the range.
  const [dateFrom, setDateFrom] = useState(() => urlParams.get('from') ?? '');
  const [dateTo, setDateTo] = useState('');
  const [receiptDraft, setReceiptDraft] = useState('');
  const [committedReceipt, setCommittedReceipt] = useState('');

  const commitReceiptSearch = useCallback(() => {
    setCommittedReceipt(receiptDraft.trim());
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, [receiptDraft]);

  useEffect(() => {
    const t = setTimeout(() => setCommittedReceipt(receiptDraft.trim()), 400);
    return () => clearTimeout(t);
  }, [receiptDraft]);

  const clearReceiptSearch = useCallback(() => {
    setReceiptDraft('');
    setCommittedReceipt('');
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, []);
  const [cashierFilter, setCashierFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState('');
  const { openObject } = useObjectModal();
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });

  const { data: usersData } = useUsers({ page_size: 200, staff: 1 });
  // Staff only: who can ring a sale or take a return (not Thrift+ members or consignors).
  const users = (usersData?.results ?? []).filter((u: { role?: string | null }) => ['Admin', 'Manager', 'Employee'].includes(u.role ?? ''));

  const params = useMemo(() => {
    const p: Record<string, string | number> = {
      page: paginationModel.page + 1,
      page_size: paginationModel.pageSize,
    };
    if (statusFilter && statusFilter !== 'all') p.status = statusFilter;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (committedReceipt) p.q = committedReceipt;
    if (cashierFilter) p.cashier = cashierFilter;
    if (paymentFilter === 'credit' || paymentFilter === 'debit') {
      p.card_type = paymentFilter;
    } else if (paymentFilter) {
      p.payment_method = paymentFilter;
    }
    return p;
  }, [
    dateFrom,
    dateTo,
    committedReceipt,
    cashierFilter,
    statusFilter,
    paymentFilter,
    paginationModel.page,
    paginationModel.pageSize,
  ]);

  useEffect(() => {
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, [dateFrom, dateTo, committedReceipt, cashierFilter, statusFilter, paymentFilter]);

  // The totals strip uses the same filters as the list, without paging.
  const summaryParams = useMemo(() => {
    const { page: _page, page_size: _size, ...rest } = params;
    return rest;
  }, [params]);
  const { data: summary } = useCartSummary(summaryParams);

  const { data, isLoading } = useCarts(params, {
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const carts = data?.results ?? [];
  const returnsFilters: ReturnsFilters = useMemo(
    () => ({ dateFrom, dateTo, q: committedReceipt, cashier: cashierFilter, late: lateOnly }),
    [dateFrom, dateTo, committedReceipt, cashierFilter, lateOnly],
  );

  const columns: GridColDef[] = [
    {
      field: 'receipt_number',
      headerName: 'Receipt #',
      width: 135,
      // A sale voided before payment never got a receipt; say so instead of showing its cart number.
      valueGetter: (_, row) => row.receipt?.receipt_number ?? (row.status === 'voided' ? 'Not paid' : `Sale ${row.id}`),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 105,
      renderCell: ({ row }) =>
        row.status === 'voided' ? (
          <Chip size="small" label="Voided" color="error" variant="outlined" />
        ) : (
          <Chip size="small" label="Completed" color="success" variant="outlined" />
        ),
    },
    {
      field: 'completed_at',
      headerName: 'Date/Time',
      width: 140,
      valueFormatter: (value, row) => {
        const dt = (row as Cart).completed_at ?? (row as Cart).created_at;
        return dt ? format(new Date(dt as string), 'MM/dd/yyyy HH:mm') : '-';
      },
    },
    {
      field: 'cashier_name',
      headerName: 'Cashier',
      flex: 1,
      minWidth: 150,
      // Cover (2026-10-22): sold while stepping in for someone.
      valueGetter: (_value, row) =>
        row.covering_for_name ? `${row.cashier_name ?? '-'} (covering ${row.covering_for_name})` : row.cashier_name,
    },
    {
      field: 'payment_method',
      headerName: 'Method',
      width: 90,
      valueFormatter: (value) => paymentMethodLabel(value as string),
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 95,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(value ?? 0),
    },
    {
      field: 'tp_member',
      headerName: 'Thrift+ member',
      flex: 1,
      minWidth: 130,
      sortable: false,
      valueGetter: (_, row) => (row as Cart).thrift_row?.member ?? '',
      // The name opens the member's window (Bill 11-09: wherever a member shows); the rest of the row opens the sale.
      renderCell: ({ row }) => {
        const t = (row as Cart).thrift_row;
        if (!t?.member) return '';
        if (!t.person_id) return t.member;
        return (
          <Link
            component="button"
            underline="hover"
            onClick={(e) => {
              e.stopPropagation();
              openObject({ type: 'member', id: t.person_id! });
            }}
            sx={{ fontSize: 'inherit', textAlign: 'left' }}
          >
            {t.member}
          </Link>
        );
      },
    },
    {
      field: 'tp_earned',
      headerName: 'Earned',
      description: "ThriftBucks this sale put in the member's bank",
      width: 80,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      valueGetter: (_, row) => thriftMoney(parseFloat((row as Cart).thrift_row?.earned ?? '0')),
    },
    {
      field: 'tp_used',
      headerName: 'Used',
      description: 'Kept ThriftBucks and Thrift+ credit spent on this sale',
      width: 80,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      valueGetter: (_, row) => {
        const t = (row as Cart).thrift_row;
        return thriftMoney(t ? parseFloat(t.used) + parseFloat(t.credit_used) : 0);
      },
    },
    {
      field: 'tp_instant',
      headerName: 'Instant',
      description: 'ThriftBucks taken off the price right away',
      width: 80,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      valueGetter: (_, row) => thriftMoney(parseFloat((row as Cart).thrift_row?.instant ?? '0')),
    },
  ];

  if (isLoading && carts.length === 0) return <LoadingScreen message="Loading transactions..." />;

  return (
    // The page is the screen's height on a desk, so each list ends at the bottom edge with its paging in view.
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: { md: 'calc(100dvh - 112px)' } }}>
      <PageHeader title="Transactions" dense />
      <Tabs value={show} onChange={(_e, next: Show) => setShow(next)} sx={{ mb: 1.5, minHeight: 40 }}>
        <Tab value="checkouts" label="Checkouts" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 40 }} data-testid="tx-tab-checkouts" />
        <Tab value="returns" label="Returns" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 40 }} data-testid="tx-tab-returns" />
      </Tabs>

      <Grid container spacing={2} sx={{ mb: 1 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            fullWidth
            size="small"
            label="Search"
            placeholder={show === 'returns' ? 'Receipt, member, item' : 'Receipt or member'}
            value={receiptDraft}
            onChange={(e) => setReceiptDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitReceiptSearch();
              }
            }}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {receiptDraft ? (
                      <IconButton size="small" aria-label="Clear search" onClick={clearReceiptSearch} edge="end">
                        <Clear fontSize="small" />
                      </IconButton>
                    ) : null}
                    <IconButton size="small" aria-label="Search" onClick={commitReceiptSearch} edge="end">
                      <Search fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="From"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, input: { inputProps: { max: dateTo || undefined } } }}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="To"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, input: { inputProps: { min: dateFrom || undefined } } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>{show === 'returns' ? 'Taken by' : 'Cashier'}</InputLabel>
            <Select
              value={cashierFilter}
              label={show === 'returns' ? 'Taken by' : 'Cashier'}
              onChange={(e) => setCashierFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {users.map((u: { id: number; full_name: string }) => (
                <MenuItem key={u.id} value={String(u.id)}>
                  {u.full_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        {show === 'returns' ? (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Show</InputLabel>
              <Select
                value={lateOnly ? 'late' : 'all'}
                label="Show"
                onChange={(e) => setShow('returns', e.target.value === 'late')}
                data-testid="returns-late-filter"
              >
                <MenuItem value="all">All returns</MenuItem>
                <MenuItem value="late">Late returns only (past the 3 days)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        ) : (
          <>
          <Grid size={{ xs: 6, md: 1.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="voided">Voided</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 1.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Payment</InputLabel>
              <Select
                value={paymentFilter}
                label="Payment"
                onChange={(e) => setPaymentFilter(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="card">Card</MenuItem>
                <MenuItem value="split">Split</MenuItem>
                <MenuItem value="payroll">Payroll deduction</MenuItem>
                <MenuItem value="thrift">Thrift+ (paid in full)</MenuItem>
                <MenuItem value="credit">Credit</MenuItem>
                <MenuItem value="debit">Debit</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          </>
        )}
      </Grid>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
        {datePresets().map((p) => (
          <Chip
            key={p.label}
            label={p.label}
            clickable
            color={dateFrom === p.from && dateTo === p.to ? 'primary' : 'default'}
            variant={dateFrom === p.from && dateTo === p.to ? 'filled' : 'outlined'}
            onClick={() => {
              setDateFrom(p.from);
              setDateTo(p.to);
            }}
          />
        ))}
      </Stack>

      {show === 'checkouts' && summary ? <SalesNumbersBlock summary={summary} /> : null}

      {show === 'returns' ? <ReturnsGrid filters={returnsFilters} /> : null}
      {/* The table takes the rest of the screen. */}
      <Box sx={{ flex: 1, minHeight: 320, display: show === 'returns' ? 'none' : undefined }}>
        <DataGrid
          rows={carts as GridRowsProp}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          paginationMode="server"
          rowCount={data?.count ?? 0}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[10, 25, 50, 100]}
          density="compact"
          localeText={{ noRowsLabel: 'No sales.' }}
          // One window for a sale wherever it opens (Dash Updates #15): the Transaction window.
          onRowClick={({ row }) => openObject({ type: 'sale', id: (row as Cart).id })}
          sx={{
            border: 'none',
            '& .MuiDataGrid-row': { cursor: 'pointer' },
          }}
        />
      </Box>

    </Box>
  );
}
