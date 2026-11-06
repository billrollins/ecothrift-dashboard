import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import CountWindow from '../../components/pos/CountWindow';
import SafeCard from '../../components/pos/SafeCard';
import { useAuth } from '../../contexts/AuthContext';
import { useAuditSupplemental, useBankTransactions, useSupplemental, useSupplementalTransactions } from '../../hooks/useCashManagement';
import { useBankDeposits } from '../../hooks/useSafe';
import type { BankTransaction } from '../../types/pos.types';
import { countCents, describeCount } from '../../utils/cashCounts';
import type { CashCount } from '../../utils/cashCounts';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

/** The office ledger's words for its lines, in plain English. */
const OFFICE_LINE: Record<string, string> = {
  draw: 'Taken out',
  return: 'Put back',
  audit_adjustment: 'Recount',
  drawer_open: 'Till to a register',
  drop: 'Cash drop',
  drawer_close: 'End-of-day count',
  from_safe: 'From the safe',
  to_safe: 'To the safe',
  to_bank: 'To the bank',
  from_bank: 'Change from the bank',
};

/**
 * Cash Drops (Retail → Managers; #70, Bill 2026-11-04; was "Cash"): where the day's cash ends up.
 * - **The cash drop box:** every envelope waiting for the bank (a drawer's cash drop, or its end-of-day drop), each with
 *   its total and bills, so the deposit can be checked envelope by envelope.
 * - **The safe** (`SafeCard`): swap with the office drawer, count it, the bank deposit and change from the bank.
 * - **The office drawer** (the supplemental drawer): its total and a recount. Cash moves in and out of it only through
 *   the safe swap and the registers (the old free-hand Draw and Return let its bills drift and are gone).
 * - **Bank history:** deposits and change, read only (Mark deposited is on the safe card).
 * Managers and the owner (the route's `pos.cash:manage` / `cashier:manage`).
 */
export default function CashManagementPage() {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [recountOpen, setRecountOpen] = useState(false);

  const { data: supplemental, isLoading: suppLoading } = useSupplemental();
  const { data: suppTransactions } = useSupplementalTransactions();
  const { data: bankData } = useBankTransactions();
  const deposits = useBankDeposits();
  const auditSupp = useAuditSupplemental();

  const supp = supplemental as {
    current_total?: string;
    last_counted_at?: string | null;
    last_counted_by_name?: string | null;
  } | undefined;
  const officeLines = ((suppTransactions ?? []) as Array<{
    id: number;
    transaction_type: string;
    total: string;
    performed_by_name: string | null;
    performed_at: string;
  }>).slice(0, 5);
  const bankHistory = ((bankData?.results ?? []) as BankTransaction[]).slice(0, 15);
  const envelopes = deposits.data?.bags ?? [];
  const boxCents = envelopes.reduce((sum, b) => sum + Math.round(Number(b.total) * 100), 0);

  async function recount(count: CashCount) {
    try {
      await auditSupp.mutateAsync({ count, total: (countCents(count) / 100).toFixed(2) });
      enqueueSnackbar('Office drawer recounted.', { variant: 'success' });
      setRecountOpen(false);
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'The recount did not save.';
      enqueueSnackbar(msg, { variant: 'error' });
    }
    return null;
  }

  if (suppLoading) return <LoadingScreen message="Loading..." />;

  return (
    <Box>
      <PageHeader title="Cash Drops" subtitle="The cash drop box, the safe, the office drawer and the bank." />

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card data-testid="cash-drop-box">
            <CardContent>
              <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6">Cash drop box</Typography>
                <Typography variant="h6" fontWeight={800}>{formatCurrency(boxCents / 100)}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Envelopes waiting for the bank, each with its bills. Their cash is counted in the office drawer until the
                bank deposit.
              </Typography>
              {deposits.isLoading ? (
                <Typography variant="body2" color="text.secondary">Loading...</Typography>
              ) : envelopes.length === 0 ? (
                <Alert severity="success" icon={false}>The box is empty: every envelope is in a deposit.</Alert>
              ) : (
                <Box sx={{ maxHeight: 360, overflow: 'auto' }}>
                  {envelopes.map((b) => (
                    <Box key={`${b.kind}-${b.ref}`} sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }} data-testid="envelope">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography fontWeight={700} noWrap>{b.register}</Typography>
                          {/* The time is what is matched at the bank: it never gets cut. */}
                          <Typography variant="body2" color="text.secondary">{format(new Date(b.at), 'MMM d, h:mm a')}</Typography>
                        </Box>
                        <Chip size="small" variant="outlined" label={b.kind === 'close_out' ? 'End of day' : 'Cash drop'} />
                        <Typography fontWeight={700} sx={{ minWidth: 80, textAlign: 'right' }}>{formatCurrency(b.total)}</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">{describeCount(b.count) || 'Bills not counted'}</Typography>
                      {b.note ? <Typography variant="caption" color="text.secondary">{b.note}</Typography> : null}
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* The safe (Retail 5, 2026-11-02): managers and the owner (this page is theirs). */}
        <Grid size={{ xs: 12, md: 6 }}>
          <SafeCard lang={user?.language} />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card data-testid="office-drawer">
            <CardContent>
              <Stack direction="row" alignItems="baseline" justifyContent="space-between">
                <Typography variant="h6">Office drawer</Typography>
                <Typography variant="h6" fontWeight={800}>{formatCurrency(supp?.current_total ?? '0')}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                The change fund. The registers' tills come from it and their end-of-day cash goes into it, envelopes
                included, until the bank deposit. It makes change with the safe.
              </Typography>
              {supp?.last_counted_at ? (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  Last counted {format(new Date(supp.last_counted_at), 'PPp')}
                  {supp.last_counted_by_name ? ` by ${supp.last_counted_by_name}` : ''}
                </Typography>
              ) : null}
              <Button variant="outlined" onClick={() => setRecountOpen(true)} sx={{ mt: 1.5, mb: 2, minHeight: 44 }}>
                Recount the office drawer
              </Button>
              <Typography variant="subtitle2" gutterBottom>Recent</Typography>
              {officeLines.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Nothing yet.</Typography>
              ) : (
                officeLines.map((tx) => (
                  <Stack key={tx.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" columnGap={1} sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="body2" sx={{ minWidth: 0 }}>
                      {OFFICE_LINE[tx.transaction_type] ?? tx.transaction_type.replace(/_/g, ' ')} · {tx.performed_by_name ?? '-'}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                      {formatCurrency(tx.total)} · {format(new Date(tx.performed_at), 'MM/dd h:mm a')}
                    </Typography>
                  </Stack>
                ))
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card data-testid="bank-history">
            <CardContent>
              <Typography variant="h6" gutterBottom>Bank history</Typography>
              {bankHistory.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No deposits yet.</Typography>
              ) : (
                bankHistory.map((tx) => (
                  <Stack key={tx.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} rowGap={0.5} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2">
                        {tx.transaction_type === 'deposit' ? 'Deposit' : 'Change from the bank'} · {tx.performed_by_name ?? '-'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{format(new Date(tx.created_at), 'PPp')}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {tx.status === 'pending' ? <Chip size="small" color="warning" variant="outlined" label="Not deposited yet" /> : null}
                      <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>{formatCurrency(tx.total)}</Typography>
                    </Stack>
                  </Stack>
                ))
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <CountWindow
        open={recountOpen}
        title="Recount the office drawer"
        submitLabel="Save the count"
        lang={user?.language}
        onCancel={() => setRecountOpen(false)}
        onSubmit={recount}
      />
    </Box>
  );
}
