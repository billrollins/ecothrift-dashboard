/**
 * Delete a customer for good (owner 2026-10-16): for testing, when staff sign each other up. One account (J13), so it
 * is the same delete from Thrift+ → Members and from Users → Customers. It shows everything the customer left, then
 * asks for their name typed out. Deactivate is the normal way; this can't be undone. Superuser only.
 */
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, TextField } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import type { MemberDeletePreview } from '../../types/thriftplus.types';

function detail(err: unknown): string {
  if (isAxiosError(err)) {
    const d = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (d) return d;
  }
  return err instanceof Error && err.message ? err.message : 'Something went wrong.';
}

/** One line of what a delete erases; left out when there is nothing. */
function Gone({ n, label }: { n: number | string; label: string }) {
  if (!n || n === '0' || n === '0.00') return null;
  return <li><strong>{n}</strong> {label}</li>;
}

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

export default function DeleteForGoodDialog({ queryKey, load, remove, onClose, onDeleted }: {
  queryKey: unknown[];
  load: () => Promise<MemberDeletePreview>;
  remove: (typedName: string) => Promise<MemberDeletePreview & { items_back: number }>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [typed, setTyped] = useState('');
  const preview = useQuery({ queryKey, queryFn: load, staleTime: 0, retry: false });
  const del = useMutation({
    mutationFn: () => remove(typed),
    onSuccess: (r) => {
      enqueueSnackbar(`${r.name} is deleted.${r.items_back ? ` ${r.items_back} sold item(s) are back on the shelf.` : ''}`, { variant: 'success' });
      onDeleted();
    },
    onError: (err) => enqueueSnackbar(detail(err), { variant: 'error' }),
  });
  const p = preview.data;
  const matches = !!p && sameName(typed, p.name);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Delete this customer for good?</DialogTitle>
      <DialogContent>
        {preview.isError ? <Alert severity="error">{detail(preview.error)}</Alert> : null}
        {preview.isLoading ? <LinearProgress /> : null}
        {p ? (
          <Stack spacing={1.5} data-testid="delete-member-preview">
            <Alert severity="warning">
              For testing only. Everything below is erased, as if <strong>{p.name}</strong> never existed. It can't be
              undone. To take a real customer off, use <strong>Deactivate</strong> instead.
            </Alert>
            <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.25 } }}>
              {p.account ? <li>Thrift+ membership #{p.account}</li> : <li>No Thrift+ membership</li>}
              <Gone n={p.people.length} label={p.people.length === 1 ? 'person on the membership' : 'people on the membership'} />
              <Gone
                n={p.sales}
                label={`register sale${p.sales === 1 ? '' : 's'}${p.paid_sales ? ` ($${p.sales_total} paid: the cash comes back out of an open drawer and the items go back on the shelf)` : ''}`}
              />
              <Gone n={p.bucks} label="ThriftBucks" />
              <Gone n={p.credit === '0.00' ? 0 : `$${p.credit}`} label="Thrift+ credit" />
              <Gone n={p.ledger_rows} label="ThriftBucks and credit rows" />
              <Gone n={p.returns} label="3-day returns" />
              <Gone n={p.scans} label="scans in the app" />
              <Gone n={p.history} label="history lines" />
              <Gone n={p.member_codes} label="member codes" />
              <Gone n={p.sign_ins} label="app sign-ins" />
              <Gone n={p.passwords} label="old app password" />
              <Gone n={p.consents} label="email and text consent records" />
              <Gone
                n={p.website_logins.length}
                label={`ecothrift.us login${p.website_logins.length === 1 ? '' : 's'} (${p.website_logins.map((u) => u.email).join(', ')})`}
              />
              <Gone n={p.holds} label={`hold${p.holds === 1 ? '' : 's'}${p.active_holds ? ` (${p.active_holds} active: stock goes back to the listing)` : ''}`} />
              <Gone n={p.orders} label="online orders" />
              <Gone n={p.conversations} label="website conversations" />
            </Box>
            {p.staff_member ? (
              <Alert severity="info">
                This is {p.staff_member}'s staff membership. Their Dash login stays; a fresh membership is made the next
                time they sign in.
              </Alert>
            ) : null}
            <TextField
              autoFocus
              fullWidth
              label={`Type ${p.name} to delete`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              inputProps={{ 'data-testid': 'delete-member-name' }}
            />
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" disabled={!matches || del.isPending} onClick={() => del.mutate()}>Delete for good</Button>
      </DialogActions>
    </Dialog>
  );
}
