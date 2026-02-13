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
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import DenominationCounter, {
  EMPTY_BREAKDOWN,
  calculateTotal,
} from '../../components/forms/DenominationCounter';
import {
  useSupplemental,
  useSupplementalTransactions,
  useDrawFromSupplemental,
  useReturnToSupplemental,
  useAuditSupplemental,
  useBankTransactions,
  useCreateBankTransaction,
  useUpdateBankTransaction,
  useDeleteBankTransaction,
  useCompleteBankTransaction,
} from '../../hooks/useCashManagement';
import type { DenominationBreakdown, BankTransaction } from '../../types/pos.types';
import { format } from 'date-fns';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

type SuppDialogType = 'draw' | 'return' | 'audit' | null;

export default function CashManagementPage() {
  const { enqueueSnackbar } = useSnackbar();

  // Supplemental dialogs
  const [suppDialog, setSuppDialog] = useState<SuppDialogType>(null);
  const [suppCount, setSuppCount] = useState<DenominationBreakdown>(EMPTY_BREAKDOWN);
  const [suppNotes, setSuppNotes] = useState('');

  // Bank transaction create
  const [createOpen, setCreateOpen] = useState(false);
  const [txType, setTxType] = useState<'deposit' | 'change_pickup'>('deposit');
  const [bankCount, setBankCount] = useState<DenominationBreakdown>(EMPTY_BREAKDOWN);

  // Bank transaction edit
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BankTransaction | null>(null);
  const [editNotes, setEditNotes] = useState('');

  // Bank transaction delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BankTransaction | null>(null);

  // Queries
  const { data: supplemental, isLoading: suppLoading } = useSupplemental();
  const { data: suppTransactions, isLoading: suppTxLoading } = useSupplementalTransactions();
  const { data: bankData, isLoading: bankLoading } = useBankTransactions();

  // Mutations
  const drawFromSupp = useDrawFromSupplemental();
  const returnToSupp = useReturnToSupplemental();
  const auditSupp = useAuditSupplemental();
  const createBankMutation = useCreateBankTransaction();
  const updateBankMutation = useUpdateBankTransaction();
  const deleteBankMutation = useDeleteBankTransaction();
  const completeBankMutation = useCompleteBankTransaction();

  const supp = supplemental as { current_total?: string; location_name?: string } | undefined;
  const suppTxList = (suppTransactions ?? []) as Array<{
    id: number;
    transaction_type: string;
    total: string;
    performed_by_name: string | null;
    performed_at: string;
    notes: string;
  }>;
  const bankTxList = (bankData?.results ?? []) as BankTransaction[];

  // Supplemental handlers
  const handleSuppAction = async () => {
    const total = calculateTotal(suppCount);
    if (suppDialog === 'audit' ? false : total <= 0) {
      enqueueSnackbar('Enter an amount', { variant: 'warning' });
      return;
    }
    try {
      const payload = { amount: suppCount, total: total.toFixed(2), notes: suppNotes };
      if (suppDialog === 'draw') {
        await drawFromSupp.mutateAsync(payload);
        enqueueSnackbar('Draw completed', { variant: 'success' });
      } else if (suppDialog === 'return') {
        await returnToSupp.mutateAsync(payload);
        enqueueSnackbar('Return completed', { variant: 'success' });
      } else if (suppDialog === 'audit') {
        await auditSupp.mutateAsync({ count: suppCount, total: total.toFixed(2), notes: suppNotes });
        enqueueSnackbar('Audit completed', { variant: 'success' });
      }
      resetSuppDialog();
    } catch {
      enqueueSnackbar('Failed to complete action', { variant: 'error' });
    }
  };

  const resetSuppDialog = () => {
    setSuppDialog(null);
    setSuppCount(EMPTY_BREAKDOWN);
    setSuppNotes('');
  };

  // Bank transaction handlers
  const handleCreateBankTx = async () => {
    const total = calculateTotal(bankCount);
    if (total <= 0) {
      enqueueSnackbar('Enter amount', { variant: 'warning' });
      return;
    }
    try {
      await createBankMutation.mutateAsync({
        transaction_type: txType,
        amount: bankCount,
        total: total.toFixed(2),
      });
      enqueueSnackbar(
        txType === 'deposit' ? 'Deposit created' : 'Change pickup created',
        { variant: 'success' },
      );
      setCreateOpen(false);
      setBankCount(EMPTY_BREAKDOWN);
    } catch {
      enqueueSnackbar('Failed to create transaction', { variant: 'error' });
    }
  };

  const handleComplete = async (id: number) => {
    try {
      await completeBankMutation.mutateAsync(id);
      enqueueSnackbar('Transaction completed', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to complete transaction', { variant: 'error' });
    }
  };

  const handleOpenEdit = (tx: BankTransaction) => {
    setEditTarget(tx);
    setEditNotes(tx.notes ?? '');
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      await updateBankMutation.mutateAsync({
        id: editTarget.id,
        data: { notes: editNotes },
      });
      enqueueSnackbar('Transaction updated', { variant: 'success' });
      setEditOpen(false);
      setEditTarget(null);
    } catch {
      enqueueSnackbar('Failed to update transaction', { variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBankMutation.mutateAsync(deleteTarget.id);
      enqueueSnackbar('Transaction deleted', { variant: 'success' });
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch {
      enqueueSnackbar('Failed to delete transaction', { variant: 'error' });
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
          >
            New Bank Transaction
          </Button>
        }
      />

      <Grid container spacing={3}>
        {/* Supplemental Drawer */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Supplemental Drawer
              </Typography>
              <Typography variant="h4" fontWeight={600} color="primary.main" gutterBottom>
                {formatCurrency(supp?.current_total ?? '0')}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {supp?.location_name ?? '—'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1, mb: 2, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setSuppDialog('draw')}
                >
                  Draw
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setSuppDialog('return')}
                >
                  Return
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  onClick={() => setSuppDialog('audit')}
                >
                  Audit / Recount
                </Button>
              </Box>
              <Typography variant="subtitle2" gutterBottom>
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

        {/* Bank Transactions */}
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
                <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {bankTxList.map((tx) => (
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
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" fontWeight={500} sx={{ mr: 1 }}>
                          {formatCurrency(tx.total)}
                        </Typography>
                        {tx.status === 'pending' && (
                          <Tooltip title="Mark Completed">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => handleComplete(tx.id)}
                              disabled={completeBankMutation.isPending}
                            >
                              <CheckCircle fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => handleOpenEdit(tx)}>
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => {
                              setDeleteTarget(tx);
                              setDeleteOpen(true);
                            }}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Supplemental Draw / Return / Audit Dialog */}
      <Dialog
        open={suppDialog !== null}
        onClose={resetSuppDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {suppDialog === 'draw'
            ? 'Draw from Supplemental'
            : suppDialog === 'return'
              ? 'Return to Supplemental'
              : 'Audit / Recount Supplemental'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <DenominationCounter
              value={suppCount}
              onChange={setSuppCount}
              label={
                suppDialog === 'audit'
                  ? 'Current Count (full recount)'
                  : 'Amount'
              }
            />
            <TextField
              fullWidth
              label="Notes"
              value={suppNotes}
              onChange={(e) => setSuppNotes(e.target.value)}
              sx={{ mt: 2 }}
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetSuppDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSuppAction}
            disabled={
              drawFromSupp.isPending ||
              returnToSupp.isPending ||
              auditSupp.isPending
            }
          >
            {suppDialog === 'draw'
              ? 'Draw'
              : suppDialog === 'return'
                ? 'Return'
                : 'Save Audit'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Bank Transaction Dialog */}
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
          <DenominationCounter value={bankCount} onChange={setBankCount} label="Amount" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateBankTx}
            disabled={createBankMutation.isPending}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Bank Transaction Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Bank Transaction</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Notes"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            sx={{ mt: 2 }}
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleEdit}
            disabled={updateBankMutation.isPending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Bank Transaction Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete Bank Transaction"
        message="Delete this bank transaction? This cannot be undone."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        loading={deleteBankMutation.isPending}
      />
    </Box>
  );
}
