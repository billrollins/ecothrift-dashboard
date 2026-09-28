import {
  Alert,
  Button,
  Chip,
  IconButton,
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
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import {
  fetchRestrictedProducts,
  fetchThriftReturns,
  markRestricted,
  markThriftReturnDone,
  thriftErrorMessage,
  unmarkRestricted,
} from '../../api/thriftplusRegister.api';
import { formatCurrency } from '../../utils/format';

/**
 * Thrift+ at the register, the staff side (thrift_plus_rewards Phase 3):
 * - **18+ products:** they sell only to a card verified 18+ while Thrift+ is live.
 * - **Returned items:** members' returns (store credit already given) waiting for staff to decide
 *   what happens to the item.
 */
export default function RegisterTab() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [sku, setSku] = useState('');
  const [reason, setReason] = useState('');
  const restricted = useQuery({ queryKey: ['thriftplus', 'restricted'], queryFn: fetchRestrictedProducts });
  const returned = useQuery({ queryKey: ['thriftplus', 'returns'], queryFn: fetchThriftReturns });
  const refresh = (key: string) => void queryClient.invalidateQueries({ queryKey: ['thriftplus', key] });

  const mark = useMutation({
    mutationFn: () => markRestricted(sku.trim(), reason.trim()),
    onSuccess: () => { setSku(''); setReason(''); refresh('restricted'); enqueueSnackbar('Marked 18+.', { variant: 'success' }); },
    onError: (err) => enqueueSnackbar(thriftErrorMessage(err, 'No item with that SKU.'), { variant: 'error' }),
  });
  const unmark = useMutation({ mutationFn: unmarkRestricted, onSuccess: () => refresh('restricted') });
  const done = useMutation({ mutationFn: markThriftReturnDone, onSuccess: () => refresh('returns') });

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={800}>18+ products</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Scan an item to mark its product 18+. Every unit of that product then needs a Thrift+ card verified 18+ at the register.
          Adult items need the maker&apos;s seal intact.
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          component="form"
          onSubmit={(e) => { e.preventDefault(); if (sku.trim()) mark.mutate(); }}
          sx={{ mb: 1.5 }}
        >
          <TextField size="small" label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
          <TextField size="small" label="Why (optional)" value={reason} onChange={(e) => setReason(e.target.value)} sx={{ flex: 1 }} />
          <Button type="submit" variant="contained" disabled={!sku.trim() || mark.isPending}>Mark 18+</Button>
        </Stack>
        {restricted.isError ? <Alert severity="error">Could not load the 18+ list.</Alert> : null}
        {restricted.data?.length ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell>Why</TableCell>
                <TableCell>Marked</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {restricted.data.map((r) => (
                <TableRow key={r.product_id}>
                  <TableCell>{r.title}</TableCell>
                  <TableCell>{r.reason || '-'}</TableCell>
                  <TableCell>{format(parseISO(r.marked_at), 'MMM d')}{r.marked_by ? ` · ${r.marked_by}` : ''}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" aria-label={`Unmark ${r.title}`} onClick={() => unmark.mutate(r.product_id)}>
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography variant="body2" color="text.secondary">No products are marked 18+.</Typography>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={800}>Returned items</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Member returns. The store credit is already given. Decide what happens to each item, then mark it handled.
        </Typography>
        {returned.data?.length ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Member</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="right">Credit</TableCell>
                <TableCell>What doesn&apos;t work</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {returned.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{format(parseISO(r.created_at), 'MMM d')}</TableCell>
                  <TableCell>{r.member}</TableCell>
                  <TableCell>{r.sku} {r.title}</TableCell>
                  <TableCell align="right">{formatCurrency(r.paid)}</TableCell>
                  <TableCell>{r.note || '-'}</TableCell>
                  <TableCell align="right">
                    {r.status === 'done'
                      ? <Chip size="small" label="Handled" />
                      : <Button size="small" onClick={() => done.mutate(r.id)}>Handled</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography variant="body2" color="text.secondary">No returns yet.</Typography>
        )}
      </Paper>
    </Stack>
  );
}
