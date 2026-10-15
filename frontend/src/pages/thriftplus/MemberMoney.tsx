import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { addDays, format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { adjustMemberMoney, fetchMemberMoney, type MemberMoney as Money } from '../../api/thriftplus.api';
import { TbAmount, tbNumber } from '../../components/thriftplus/ThriftBucks';
import { formatCurrency } from '../../utils/format';

const KIND: Record<string, string> = { cover: 'Monthly cover (retired)', bank: 'ThriftBucks', credit: 'Thrift+ credit' };
const REASON: Record<string, string> = {
  sale: 'Sale', void: 'Voided sale', return: '3-day return', rering: 'Re-ring', spend: 'Used', adjust: 'Adjusted',
  expire: 'Expired',
};

function day(iso: string): string {
  return format(parseISO(iso), 'MMM d');
}

/** A ThriftBucks row's use-by date (B5: usable through day 30 after it was collected). */
function rowUseBy(e: Money['entries'][number]): string {
  if (e.kind !== 'bank' || Number(e.amount) <= 0) return '';
  if (e.use_by) return day(e.use_by);
  return format(addDays(parseISO(e.created_at), 30), 'MMM d');
}

/**
 * A membership's money in the member service (the 10-12 policy): kept ThriftBucks, each amount with its use-by
 * date, and Thrift+ credit (refund money), every ledger row behind them, and a manager's adjustment. No cover.
 */
export default function MemberMoney({ accountId }: { accountId: number }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const key = ['thriftplus', 'money', accountId];
  const money = useQuery({ queryKey: key, queryFn: () => fetchMemberMoney(accountId) });
  const [adjust, setAdjust] = useState<{ kind: 'credit' | 'bank'; amount: string; note: string } | null>(null);
  const save = useMutation({
    mutationFn: () => adjustMemberMoney(accountId, adjust!),
    onSuccess: (data) => { queryClient.setQueryData(key, data); setAdjust(null); },
    onError: (err) => {
      const detail = isAxiosError(err) ? (err.response?.data as { detail?: string } | undefined)?.detail : undefined;
      enqueueSnackbar(detail ?? 'Could not adjust.', { variant: 'error' });
    },
  });
  const m = money.data;
  if (!m) return null;
  const lots = (m.lots ?? []).filter((l) => Number(l.amount) > 0);
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2" sx={{ fontWeight: 800, flex: 1 }}>ThriftBucks and Thrift+ credit</Typography>
        <Button size="small" onClick={() => setAdjust({ kind: 'credit', amount: '', note: '' })}>Adjust</Button>
      </Stack>
      <Typography variant="body2">
        {`Your ThriftBucks ${tbNumber(m.banked)}`}
        {m.available != null && Math.abs(Number(m.available) - Number(m.banked)) >= 0.005 ? ` (${tbNumber(m.available)} usable today)` : ''}
        {` · Thrift+ credit ${formatCurrency(m.credit)}`}
      </Typography>
      {lots.length ? (
        <Stack spacing={0.25} sx={{ mt: 0.5 }} data-testid="member-bucks-lots">
          {lots.map((l, i) => (
            <Typography key={`${l.earned_on}-${i}`} variant="caption" color={l.past_due ? 'text.disabled' : 'text.secondary'}>
              {`${tbNumber(l.amount)} ThriftBucks, collected ${day(l.earned_on)}, use by ${day(l.use_by)}${l.past_due ? ' (past its date)' : ''}`}
            </Typography>
          ))}
        </Stack>
      ) : null}
      {m.entries.length ? (
        <Table size="small" sx={{ mt: 1 }}>
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>What</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Use by</TableCell>
              <TableCell>Detail</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {m.entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{day(e.created_at)}</TableCell>
                <TableCell>{KIND[e.kind] ?? e.kind} · {REASON[e.reason] ?? e.reason}</TableCell>
                <TableCell align="right">{e.kind === 'bank' || e.kind === 'cover' ? <TbAmount bare value={e.amount} sign={Number(e.amount) < 0 ? '-' : undefined} /> : formatCurrency(e.amount)}</TableCell>
                <TableCell>{rowUseBy(e)}</TableCell>
                <TableCell>{[e.sku, e.cart ? `sale ${e.cart}` : '', e.note, e.actor ? `by ${e.actor}` : ''].filter(Boolean).join(' · ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Typography variant="caption" color="text.secondary" component="div">No ThriftBucks or Thrift+ credit yet.</Typography>
      )}

      <Dialog open={adjust !== null} onClose={() => setAdjust(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Adjust ThriftBucks or Thrift+ credit</DialogTitle>
        <DialogContent>
          {adjust ? (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <TextField select size="small" label="Which" value={adjust.kind} onChange={(e) => setAdjust({ ...adjust, kind: e.target.value as 'credit' | 'bank' })}>
                <MenuItem value="credit">Thrift+ credit (dollars)</MenuItem>
                <MenuItem value="bank">ThriftBucks</MenuItem>
              </TextField>
              <TextField size="small" label="Amount (use - to take away)" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} />
              <TextField size="small" label="Why" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
              <Typography variant="caption" color="text.secondary">Managers only. Logged with your name.</Typography>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjust(null)}>Cancel</Button>
          <Button variant="contained" disabled={!adjust?.amount || !adjust.note.trim() || save.isPending} onClick={() => save.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
