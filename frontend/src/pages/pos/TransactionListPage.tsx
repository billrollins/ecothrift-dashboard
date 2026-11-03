import { useState, useMemo, useEffect, useCallback } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
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
import { SaleDetail, saleTitle } from '../../components/pos/SaleDetail';
import { SalesNumbersBlock } from '../../components/pos/SalesNumbersBlock';
import { format, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { IconSearch as Search } from '../../icons/ecoIcons';
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

export default function TransactionListPage() {
  const [dateFrom, setDateFrom] = useState('');
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
  const [selectedCart, setSelectedCart] = useState<Cart | null>(null);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });

  const { data: usersData } = useUsers({ page_size: 200 });
  const users = usersData?.results ?? [];

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

  const columns: GridColDef[] = [
    {
      field: 'receipt_number',
      headerName: 'Receipt #',
      width: 150,
      // A sale voided before payment never got a receipt; say so instead of showing its cart number.
      valueGetter: (_, row) => row.receipt?.receipt_number ?? (row.status === 'voided' ? 'Not paid' : `Sale ${row.id}`),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
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
      width: 160,
      valueFormatter: (value, row) => {
        const dt = (row as Cart).completed_at ?? (row as Cart).created_at;
        return dt ? format(new Date(dt as string), 'MM/dd/yyyy HH:mm') : '-';
      },
    },
    {
      field: 'cashier_name',
      headerName: 'Cashier',
      width: 200,
      // Cover (2026-10-22): sold while stepping in for someone.
      valueGetter: (_value, row) =>
        row.covering_for_name ? `${row.cashier_name ?? '-'} (covering ${row.covering_for_name})` : row.cashier_name,
    },
    {
      field: 'payment_method',
      headerName: 'Method',
      width: 110,
      valueFormatter: (value) => paymentMethodLabel(value as string),
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 110,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(value ?? 0),
    },
    {
      field: 'tp_member',
      headerName: 'Thrift+ member',
      width: 170,
      sortable: false,
      valueGetter: (_, row) => (row as Cart).thrift_row?.member ?? '',
    },
    {
      field: 'tp_earned',
      headerName: 'Earned',
      description: "ThriftBucks this sale put in the member's bank",
      width: 95,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      valueGetter: (_, row) => thriftMoney(parseFloat((row as Cart).thrift_row?.earned ?? '0')),
    },
    {
      field: 'tp_used',
      headerName: 'Used',
      description: 'Kept ThriftBucks and Thrift+ credit spent on this sale',
      width: 95,
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
      width: 95,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      valueGetter: (_, row) => thriftMoney(parseFloat((row as Cart).thrift_row?.instant ?? '0')),
    },
  ];

  if (isLoading && carts.length === 0) return <LoadingScreen message="Loading transactions..." />;

  return (
    <Box>
      <PageHeader title="Transactions" dense />

      <Grid container spacing={2} sx={{ mb: 1 }}>
        <Grid size={{ xs: 12, md: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="Search"
            placeholder="Receipt # or member name"
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
        <Grid size={{ xs: 12, md: 2 }}>
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
        <Grid size={{ xs: 12, md: 2 }}>
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
        <Grid size={{ xs: 12, md: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Cashier</InputLabel>
            <Select
              value={cashierFilter}
              label="Cashier"
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
        <Grid size={{ xs: 12, md: 2 }}>
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
        <Grid size={{ xs: 12, md: 2 }}>
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
      </Grid>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
        {datePresets().map((p) => (
          <Chip
            key={p.label}
            size="small"
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

      {summary && <SalesNumbersBlock summary={summary} />}

      {/* The table takes the rest of the screen (about 70% of it on a laptop). */}
      <Box sx={{ height: 'calc(100vh - 300px)', minHeight: 420 }}>
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
          onRowClick={({ row }) => setSelectedCart(row as Cart)}
          sx={{
            border: 'none',
            '& .MuiDataGrid-row': { cursor: 'pointer' },
          }}
        />
      </Box>

      <Dialog
        open={!!selectedCart}
        onClose={() => setSelectedCart(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {selectedCart ? saleTitle(selectedCart) : ''}
          {selectedCart?.status === 'voided' && (
            <Chip size="small" label="Voided" color="error" />
          )}
        </DialogTitle>
        <DialogContent>
          {selectedCart && (
            <SaleDetail cart={selectedCart} onUpdated={setSelectedCart} onVoided={() => setSelectedCart(null)} />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
