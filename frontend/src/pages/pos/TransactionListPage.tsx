import { useState, useMemo, useEffect } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import { DataGrid, type GridColDef, type GridRowsProp } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useCarts, useVoidCart } from '../../hooks/usePOS';
import { useUsers } from '../../hooks/useEmployees';
import { useAuth } from '../../contexts/AuthContext';
import { localPrintService } from '../../services/localPrintService';
import type { Cart, CartLine } from '../../types/pos.types';
import { format } from 'date-fns';
import {
  getHistoricalRevenue,
  type HistoricalRevenueResponse,
  type HistoricalRevenueDataPoint,
} from '../../api/pos.api';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

function buildReceiptDataFromCart(cart: Cart): Record<string, unknown> {
  const completedAt = cart.completed_at ? new Date(cart.completed_at) : new Date(cart.created_at ?? 0);
  const lines = (cart.lines ?? []).map((line: CartLine) => ({
    name: line.description,
    quantity: line.quantity,
    unit_price: parseFloat(String(line.unit_price)),
    line_total: parseFloat(String(line.line_total)),
  }));
  return {
    receipt_number: cart.receipt?.receipt_number ?? '',
    date: format(completedAt, 'yyyy-MM-dd'),
    time: format(completedAt, 'h:mm a'),
    cashier: (cart as { cashier_name?: string }).cashier_name ?? '',
    items: lines,
    subtotal: parseFloat(String(cart.subtotal)),
    tax: parseFloat(String(cart.tax_amount)),
    total: parseFloat(String(cart.total)),
    payment_method: cart.payment_method,
    amount_tendered: cart.cash_tendered != null ? parseFloat(String(cart.cash_tendered)) : undefined,
    change: cart.change_given != null ? parseFloat(String(cart.change_given)) : undefined,
  };
}

const DB_COLORS: Record<string, string> = { db1: '#9e9e9e', db2: '#1976d2', db3: '#2e7d32' };
const DB_LABELS: Record<string, string> = { db1: 'DB1 Legacy', db2: 'DB2 Production', db3: 'DB3 Current' };

function HistoricalRevenuePanel() {
  const [data, setData] = useState<HistoricalRevenueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'yearly' | 'monthly'>('yearly');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    getHistoricalRevenue({ period, sources: 'all' })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [expanded, period]);

  const summary = data?.summary;
  const grandTotal = summary
    ? (
        parseFloat(summary.db1_total) +
        parseFloat(summary.db2_total) +
        parseFloat(summary.db3_total)
      ).toFixed(2)
    : '0.00';

  type PivotRow = { period: string; db1?: number; db2?: number; db3?: number };

  // Group data points by period, pivot by source_db
  const pivoted = useMemo((): PivotRow[] => {
    if (!data?.data) return [];
    const map = new Map<string, Record<string, number>>();
    for (const row of data.data) {
      if (!map.has(row.period)) map.set(row.period, {});
      map.get(row.period)![row.source_db] = parseFloat(row.total);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, vals]) => ({ period, ...vals } as PivotRow));
  }, [data]);

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, e) => setExpanded(e)}
      sx={{ mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <HistoryIcon color="action" />
          <Typography variant="subtitle1" fontWeight={600}>
            All-Time Revenue History (DB1 + DB2 + DB3)
          </Typography>
          {summary && (
            <Chip
              label={`$${parseFloat(grandTotal).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} total all-time`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {/* Controls */}
        <Stack direction="row" spacing={2} mb={2} alignItems="center">
          <FormControl size="small" sx={{ width: 150 }}>
            <InputLabel>Group by</InputLabel>
            <Select
              value={period}
              label="Group by"
              onChange={e => setPeriod(e.target.value as 'yearly' | 'monthly')}
            >
              <MenuItem value="yearly">Year</MenuItem>
              <MenuItem value="monthly">Month</MenuItem>
            </Select>
          </FormControl>
          {loading && <Typography variant="body2" color="text.secondary">Loading...</Typography>}
        </Stack>

        {/* Summary tiles */}
        {summary && (
          <Stack direction="row" spacing={2} mb={3} flexWrap="wrap">
            {(['db1', 'db2', 'db3'] as const).map(db => (
              <Paper
                key={db}
                variant="outlined"
                sx={{ p: 1.5, minWidth: 160, borderLeft: `4px solid ${DB_COLORS[db]}` }}
              >
                <Typography variant="overline" color="text.secondary">
                  {DB_LABELS[db]}
                </Typography>
                <Typography variant="h6" fontWeight={700}>
                  ${parseFloat(summary[`${db}_total` as keyof typeof summary] as string).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {(summary[`${db}_transactions` as keyof typeof summary] as number).toLocaleString()} transactions
                </Typography>
              </Paper>
            ))}
            <Paper variant="outlined" sx={{ p: 1.5, minWidth: 160, borderLeft: '4px solid #7b1fa2' }}>
              <Typography variant="overline" color="text.secondary">Grand Total</Typography>
              <Typography variant="h6" fontWeight={700} color="primary.main">
                ${parseFloat(grandTotal).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {(
                  summary.db1_transactions + summary.db2_transactions + summary.db3_transactions
                ).toLocaleString()} total transactions
              </Typography>
            </Paper>
          </Stack>
        )}

        {/* Data table */}
        {pivoted.length > 0 && (
          <>
            <Divider sx={{ mb: 1.5 }} />
            <Box sx={{ maxHeight: 350, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Period</strong></TableCell>
                    {['db1', 'db2', 'db3'].map(db => (
                      <TableCell key={db} align="right">
                        <strong style={{ color: DB_COLORS[db] }}>{DB_LABELS[db]}</strong>
                      </TableCell>
                    ))}
                    <TableCell align="right"><strong>Period Total</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pivoted.map(row => {
                    const rowTotal = (['db1', 'db2', 'db3'] as const).reduce(
                      (s, db) => s + (row[db] ?? 0),
                      0,
                    );
                    return (
                      <TableRow key={row.period} hover>
                        <TableCell>{row.period}</TableCell>
                        {(['db1', 'db2', 'db3'] as const).map(db => (
                          <TableCell key={db} align="right">
                            {row[db]
                              ? `$${row[db].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : '—'}
                          </TableCell>
                        ))}
                        <TableCell align="right">
                          <strong>
                            ${rowTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </strong>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </>
        )}

        {!loading && data && pivoted.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No historical data available yet. Run import_historical_transactions to populate.
          </Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default function TransactionListPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { hasRole } = useAuth();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [receiptSearch, setReceiptSearch] = useState('');
  const [cashierFilter, setCashierFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [selectedCart, setSelectedCart] = useState<Cart | null>(null);
  const [voidDialog, setVoidDialog] = useState<Cart | null>(null);

  const { data: usersData } = useUsers({ page_size: 200 });
  const users = usersData?.results ?? [];

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (statusFilter && statusFilter !== 'all') p.status = statusFilter;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (receiptSearch.trim()) p.receipt_number = receiptSearch.trim();
    if (cashierFilter) p.cashier = cashierFilter;
    if (paymentFilter) p.payment_method = paymentFilter;
    return p;
  }, [dateFrom, dateTo, receiptSearch, cashierFilter, statusFilter, paymentFilter]);

  const { data, isLoading } = useCarts(params);
  const voidCartMutation = useVoidCart();
  const canVoid = hasRole('Manager') || hasRole('Admin');

  const carts = data?.results ?? [];

  const columns: GridColDef[] = [
    {
      field: 'receipt_number',
      headerName: 'Receipt #',
      width: 120,
      valueGetter: (_, row) => row.receipt?.receipt_number ?? row.id ?? '—',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 100,
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
        return dt ? format(new Date(dt as string), 'MM/dd/yyyy HH:mm') : '—';
      },
    },
    {
      field: 'cashier_name',
      headerName: 'Cashier',
      flex: 1,
      minWidth: 120,
    },
    {
      field: 'payment_method',
      headerName: 'Method',
      width: 100,
      valueFormatter: (value) =>
        String(value ?? '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 100,
      valueFormatter: (value) => formatCurrency(value ?? 0),
    },
  ];

  const handleVoid = async () => {
    if (!voidDialog) return;
    try {
      await voidCartMutation.mutateAsync(voidDialog.id);
      enqueueSnackbar('Transaction voided', { variant: 'success' });
      setVoidDialog(null);
      setSelectedCart(null);
    } catch {
      enqueueSnackbar('Failed to void transaction', { variant: 'error' });
    }
  };

  if (isLoading && carts.length === 0) return <LoadingScreen message="Loading transactions..." />;

  return (
    <Box>
      <PageHeader title="Transactions" subtitle="Transaction history" />

      <HistoricalRevenuePanel />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="Receipt #"
            placeholder="Search by receipt #"
            value={receiptSearch}
            onChange={(e) => setReceiptSearch(e.target.value)}
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
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={carts as GridRowsProp}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
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
          Receipt #{selectedCart?.receipt?.receipt_number ?? selectedCart?.id ?? '—'}
          {selectedCart?.status === 'voided' && (
            <Chip size="small" label="Voided" color="error" />
          )}
        </DialogTitle>
        <DialogContent>
          {selectedCart && (
            <Box>
              <Typography variant="body2" color="text.secondary">
                {format(new Date(selectedCart.completed_at ?? selectedCart.created_at), 'PPp')} ·{' '}
                {selectedCart.cashier_name ?? '—'}
              </Typography>
              <Box sx={{ mt: 2 }}>
                {(selectedCart.lines ?? []).map((line: CartLine) => (
                  <Box
                    key={line.id}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      py: 0.5,
                    }}
                  >
                    <Typography variant="body2">
                      {line.description} × {line.quantity}
                    </Typography>
                    <Typography variant="body2">{formatCurrency(line.line_total)}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography>Subtotal</Typography>
                  <Typography>{formatCurrency(selectedCart.subtotal)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography>Tax</Typography>
                  <Typography>{formatCurrency(selectedCart.tax_amount)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <Typography>Total</Typography>
                  <Typography>{formatCurrency(selectedCart.total)}</Typography>
                </Box>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Payment: {String(selectedCart.payment_method).replace(/_/g, ' ')}
                    {selectedCart.payment_method === 'split' && selectedCart.cash_tendered != null && selectedCart.card_amount != null && (
                      <> · Cash {formatCurrency(selectedCart.cash_tendered)} + Card {formatCurrency(selectedCart.card_amount)}</>
                    )}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={async () => {
                    try {
                      const receiptData = buildReceiptDataFromCart(selectedCart);
                      await localPrintService.printReceipt(receiptData, false);
                      enqueueSnackbar('Receipt sent to printer', { variant: 'success' });
                    } catch {
                      enqueueSnackbar('Print failed. Is the print server running?', { variant: 'error' });
                    }
                  }}
                >
                  Reprint receipt
                </Button>
                {canVoid && selectedCart.status !== 'voided' && (
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={() => {
                      setSelectedCart(null);
                      setVoidDialog(selectedCart);
                    }}
                  >
                    Void transaction
                  </Button>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!voidDialog}
        title="Void Transaction"
        message="Are you sure you want to void this transaction? This cannot be undone."
        confirmLabel="Void"
        severity="error"
        onConfirm={handleVoid}
        onCancel={() => setVoidDialog(null)}
        loading={voidCartMutation.isPending}
      />
    </Box>
  );
}
