import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
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
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { adjustMemberMoney, fetchMemberMoney } from '../../api/thriftplus.api';
import { formatCurrency } from '../../utils/format';

const KIND: Record<string, string> = { cover: 'Cover', bank: 'Banked', credit: 'Store credit' };
const REASON: Record<string, string> = {
  sale: 'Sale', void: 'Voided sale', return: 'Return', rering: 'Re-ring', spend: 'Spent', adjust: 'Adjusted',
};

/**
 * A membership's money in the member service (thrift_plus_rewards Phase 4): the cover this month,
 * banked rewards and store credit, every ledger row behind them, and a manager's adjustment.
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
  const pct = Math.min(100, (Number(m.cover.covered) / Math.max(0.01, Number(m.cover.amount))) * 100);
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2" sx={{ fontWeight: 800, flex: 1 }}>Rewards and credit</Typography>
        <Button size="small" onClick={() => setAdjust({ kind: 'credit', amount: '', note: '' })}>Adjust</Button>
      </Stack>
      <Typography variant="body2">
        Cover {m.cover.month}: {formatCurrency(m.cover.covered)} of {formatCurrency(m.cover.amount)} (resets {format(parseISO(m.cover.resets_on), 'MMM d')})
      </Typography>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3, my: 0.5 }} />
      <Typography variant="body2">Banked {formatCurrency(m.banked)} · Store credit {formatCurrency(m.credit)}</Typography>
      {m.entries.length ? (
        <Table size="small" sx={{ mt: 1 }}>
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>What</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Detail</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {m.entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{format(parseISO(e.created_at), 'MMM d')}</TableCell>
                <TableCell>{KIND[e.kind] ?? e.kind} · {REASON[e.reason] ?? e.reason}</TableCell>
                <TableCell align="right">{formatCurrency(e.amount)}</TableCell>
                <TableCell>{[e.sku, e.cart ? `sale ${e.cart}` : '', e.note, e.actor ? `by ${e.actor}` : ''].filter(Boolean).join(' · ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Typography variant="caption" color="text.secondary">No rewards or credit yet.</Typography>
      )}

      <Dialog open={adjust !== null} onClose={() => setAdjust(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Adjust rewards or credit</DialogTitle>
        <DialogContent>
          {adjust ? (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <TextField select size="small" label="Which" value={adjust.kind} onChange={(e) => setAdjust({ ...adjust, kind: e.target.value as 'credit' | 'bank' })}>
                <MenuItem value="credit">Store credit</MenuItem>
                <MenuItem value="bank">Banked rewards</MenuItem>
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
