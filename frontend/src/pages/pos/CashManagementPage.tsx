import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import DenominationCounter, {
  EMPTY_BREAKDOWN,
  calculateTotal,
} from '../../components/forms/DenominationCounter';
import {
  useSupplemental,
  useSupplementalTransactions,
  useBankTransactions,
  useCreateBankTransaction,
} from '../../hooks/useCashManagement';
import type { DenominationBreakdown } from '../../types/pos.types';
import { format } from 'date-fns';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export default function CashManagementPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [createOpen, setCreateOpen] = useState(false);
  const [txType, setTxType] = useState<'deposit' | 'change_pickup'>('deposit');
  const [count, setCount] = useState<DenominationBreakdown>(EMPTY_BREAKDOWN);

  const { data: supplemental, isLoading: suppLoading } = useSupplemental();
  const { data: suppTransactions, isLoading: suppTxLoading } = useSupplementalTransactions();
  const { data: bankData, isLoading: bankLoading } = useBankTransactions();
  const createBankMutation = useCreateBankTransaction();

  const supp = supplemental as { current_total?: string; location_name?: string } | undefined;
  const suppTxList = (suppTransactions ?? []) as Array<{
    id: number;
    transaction_type: string;
    total: string;
    performed_by_name: string | null;
    performed_at: string;
    notes: string;
  }>;
  const bankTxList = bankData?.results ?? [];

  const handleCreateBankTx = async () => {
    const total = calculateTotal(count);
    if (total <= 0) {
      enqueueSnackbar('Enter amount', { variant: 'warning' });
      return;
    }
    try {
      await createBankMutation.mutateAsync({
        transaction_type: txType,
        amount: count,
        total: total.toFixed(2),
      });
      enqueueSnackbar(
        txType === 'deposit' ? 'Deposit created' : 'Change pickup created',
        { variant: 'success' }
      );
      setCreateOpen(false);
      setCount(EMPTY_BREAKDOWN);
    } catch {
      enqueueSnackbar('Failed to create transaction', { variant: 'error' });
    }
  };

  if (suppLoading) return <LoadingScreen message="Loading..." />;

  return (
    <Box>
      <PageHeader
        title="Cash Management"
        subtitle="Supplemental drawer and bank transactions"
        action={
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateOpen(true)}
            disabled={createBankMutation.isPending}
          >
            New Bank Transaction
          </Button>
        }
      />

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Supplemental Drawer
              </Typography>
              <Typography variant="h4" fontWeight={600} color="primary.main" gutterBottom>
                {formatCurrency(supp?.current_total ?? '0')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {supp?.location_name ?? '—'}
              </Typography>
              <Typography variant="subtitle2" sx={{ mt: 2 }} gutterBottom>
                Recent Transactions
              </Typography>
              {suppTxLoading ? (
                <Typography variant="body2" color="text.secondary">
                  Loading...
                </Typography>
              ) : suppTxList.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No recent transactions
                </Typography>
              ) : (
                <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                  {suppTxList.slice(0, 10).map((tx) => (
                    <Box
                      key={tx.id}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        py: 0.5,
                        borderBottom: 1,
                        borderColor: 'divider',
                      }}
                    >
                      <Typography variant="body2">
                        {tx.transaction_type.replace(/_/g, ' ')} • {tx.performed_by_name ?? '—'}
                      </Typography>
                      <Typography variant="body2">
                        {formatCurrency(tx.total)} •{' '}
                        {format(new Date(tx.performed_at), 'MM/dd HH:mm')}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Bank Transactions
              </Typography>
              {bankLoading ? (
                <Typography variant="body2" color="text.secondary">
                  Loading...
                </Typography>
              ) : bankTxList.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No bank transactions
                </Typography>
              ) : (
                <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {(bankTxList as Array<{
                    id: number;
                    transaction_type: string;
                    total: string;
                    status: string;
                    performed_by_name: string | null;
                    created_at: string;
                  }>).map((tx) => (
                      <Box
                        key={tx.id}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          py: 1,
                          borderBottom: 1,
                          borderColor: 'divider',
                        }}
                      >
                        <Box>
                          <Typography variant="body2">
                            {tx.transaction_type.replace(/_/g, ' ')} • {tx.performed_by_name ?? '—'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(tx.created_at), 'PPp')} • {tx.status}
                          </Typography>
                        </Box>
                        <Typography variant="body2" fontWeight={500}>
                          {formatCurrency(tx.total)}
                        </Typography>
                      </Box>
                    )
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Bank Transaction</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 2, mb: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={txType}
              label="Type"
              onChange={(e) => setTxType(e.target.value as 'deposit' | 'change_pickup')}
            >
              <MenuItem value="deposit">Deposit</MenuItem>
              <MenuItem value="change_pickup">Change Pickup</MenuItem>
            </Select>
          </FormControl>
          <DenominationCounter value={count} onChange={setCount} label="Amount" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateBankTx} disabled={createBankMutation.isPending}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
