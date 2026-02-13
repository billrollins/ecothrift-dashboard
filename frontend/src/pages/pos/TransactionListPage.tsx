import { useState, useMemo } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridRowsProp } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useCarts, useVoidCart } from '../../hooks/usePOS';
import { useAuth } from '../../contexts/AuthContext';
import type { Cart, CartLine } from '../../types/pos.types';
import { format } from 'date-fns';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export default function TransactionListPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { hasRole } = useAuth();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cashierFilter, setCashierFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [selectedCart, setSelectedCart] = useState<Cart | null>(null);
  const [voidDialog, setVoidDialog] = useState<Cart | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = { status: 'completed' };
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (cashierFilter) p.cashier = cashierFilter;
    if (paymentFilter) p.payment_method = paymentFilter;
    return p;
  }, [dateFrom, dateTo, cashierFilter, paymentFilter]);

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
      field: 'completed_at',
      headerName: 'Date/Time',
      width: 160,
      valueFormatter: (value) =>
        value ? format(new Date(value as string), 'MM/dd/yyyy HH:mm') : '—',
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

      <Grid container spacing={2} sx={{ mb: 2 }}>
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
          <TextField
            fullWidth
            size="small"
            label="Cashier"
            value={cashierFilter}
            onChange={(e) => setCashierFilter(e.target.value)}
          />
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
        <DialogTitle>
          Receipt #{selectedCart?.receipt?.receipt_number ?? selectedCart?.id ?? '—'}
        </DialogTitle>
        <DialogContent>
          {selectedCart && (
            <Box>
              <Typography variant="body2" color="text.secondary">
                {format(new Date(selectedCart.completed_at ?? selectedCart.created_at), 'PPp')} •{' '}
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
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Payment: {selectedCart.payment_method}
                  </Typography>
                </Box>
              </Box>
              {canVoid && selectedCart.status !== 'voided' && (
                <Button
                  variant="outlined"
                  color="error"
                  sx={{ mt: 2 }}
                  onClick={() => {
                    setSelectedCart(null);
                    setVoidDialog(selectedCart);
                  }}
                >
                  Void Transaction
                </Button>
              )}
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
      />
    </Box>
  );
}
