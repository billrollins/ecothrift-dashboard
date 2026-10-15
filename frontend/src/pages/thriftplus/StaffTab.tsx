import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import {
  createMissingStaffMemberships,
  fetchStaffMemberships,
  fetchStaffMergePreview,
  findMembers,
  mergeIntoStaff,
  type StaffMemberRow,
  type StaffMergeResult,
  type StaffMoney,
} from '../../api/thriftplus.api';
import { formatCurrency } from '../../utils/format';

const STAFF_KEY = ['thriftplus', 'staff-memberships'] as const;

function detail(err: unknown): string {
  if (isAxiosError(err) && typeof err.response?.data?.detail === 'string') return err.response.data.detail;
  return 'That did not work.';
}

/** ThriftBucks are a number, never "$"; Thrift+ credit is dollars. */
function money(m: StaffMoney): string {
  return `ThriftBucks ${m.bucks} · Thrift+ credit ${formatCurrency(m.credit)}`;
}

function counts(moved: Record<string, number>): string {
  return Object.entries(moved).filter(([, n]) => n > 0).map(([what, n]) => `${what}: ${n}`).join(', ');
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What a merge did, in one line. */
function mergedText(r: StaffMergeResult): string {
  const moved = counts(r.moved);
  return `Merged membership #${r.source_account} into #${r.staff_account}${moved ? `: ${moved}` : ''}. Now ${money(r.now)}.`;
}

/**
 * Merge a customer membership into this staff member's own (owner 2026-10-15): pick one of the suggestions or find one,
 * see what moves, then merge. The staff membership survives; the staff login overwrites the customer one.
 */
function MergeDialog({ row, onClose, onMerged }: { row: StaffMemberRow; onClose: () => void; onMerged: (r: StaffMergeResult) => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const [picked, setPicked] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const found = useQuery({
    queryKey: ['thriftplus', 'find', debounced, 'staff-merge'],
    queryFn: () => findMembers(debounced),
    enabled: debounced.length >= 2,
  });
  // Only customer memberships merge: never a staff one, a practice member or a revoked one.
  const results = (found.data ?? []).filter((a) => !a.staff && !a.is_practice && a.status !== 'revoked');
  const preview = useQuery({
    queryKey: ['thriftplus', 'staff-merge-preview', row.user_id, picked],
    queryFn: () => fetchStaffMergePreview(row.user_id, picked!),
    enabled: picked != null,
    retry: false,
  });
  const merge = useMutation({
    mutationFn: () => mergeIntoStaff(row.user_id, picked!),
    onSuccess: (r) => onMerged(r),
    onError: (err) => enqueueSnackbar(detail(err), { variant: 'error' }),
  });
  const p = preview.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Merge a customer membership into {row.name}&rsquo;s</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            For a staff member who joined as a customer first. Their own staff membership stays, with their Dash name and
            email; the customer membership&rsquo;s ThriftBucks, credit, member codes and history move into it.
          </Typography>
          {row.suggestions.length ? (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>May be theirs</Typography>
              <List dense disablePadding>
                {row.suggestions.map((s) => (
                  <ListItemButton key={s.account_id} selected={picked === s.account_id} onClick={() => setPicked(s.account_id)}>
                    <ListItemText
                      primary={`${s.name} · #${s.account_id}${s.status === 'pending' ? ' · joined online' : ''}`}
                      secondary={`${s.email || 'No email'} · ${s.why.join(', ')} · ${money(s)}`}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          ) : null}
          <TextField size="small" label="Find another: phone, email or name" value={q} onChange={(e) => setQ(e.target.value)} />
          {results.length ? (
            <List dense disablePadding>
              {results.map((a) => {
                const person = a.people.find((x) => x.role === 'primary') ?? a.people[0];
                const name = person ? `${person.first_name} ${person.last_name}`.trim() : `Membership #${a.id}`;
                return (
                  <ListItemButton key={a.id} selected={picked === a.id} onClick={() => setPicked(a.id)}>
                    <ListItemText primary={`${name} · #${a.id}`} secondary={person?.email || person?.phone || ''} />
                  </ListItemButton>
                );
              })}
            </List>
          ) : debounced.length >= 2 && found.isSuccess ? (
            <Typography variant="body2" color="text.secondary">No customer membership found.</Typography>
          ) : null}
          {picked != null && preview.isLoading ? <LinearProgress /> : null}
          {preview.isError ? <Alert severity="error">{detail(preview.error)}</Alert> : null}
          {p ? (
            <Alert severity="warning" data-testid="staff-merge-preview">
              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                Membership #{p.source_account} ({p.source_name}) moves into {row.name}&rsquo;s
                {p.staff_account ? ` membership #${p.staff_account}` : ' membership (made first)'}:
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                <li>{money(p)}</li>
                <li>{plural(p.codes, 'member code', 'member codes')}: the QR in their app keeps working at the register</li>
                <li>{p.second_adult ? `The second adult, ${p.second_adult}` : 'No second adult'}</li>
                {p.takes.length ? <li>Takes their {p.takes.join(', ')} (only what the staff membership has none of)</li> : null}
                {counts(p.moves) ? <li>Everything on it: {counts(p.moves)}</li> : null}
              </Box>
              <Typography variant="body2">
                The staff login wins: {row.email} stays the email. The customer sign-in is removed and its phones are
                signed out. Membership #{p.source_account} ends revoked (merged).
              </Typography>
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" disabled={!p || merge.isPending} onClick={() => merge.mutate()}>
          {p ? `Merge #${p.source_account} into ${row.name}'s` : 'Merge'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function StaffRow({ row, canMerge, onMerge }: { row: StaffMemberRow; canMerge: boolean; onMerge: () => void }) {
  const m = row.membership;
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="staff-row">
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography sx={{ fontWeight: 800 }}>{row.name}</Typography>
            {row.role ? <Chip size="small" label={row.role} /> : null}
            {m ? (
              <Chip size="small" color={m.status === 'revoked' ? 'error' : 'success'} variant="outlined"
                label={`Membership #${m.id}${m.status === 'revoked' ? ' · revoked' : ''}`} />
            ) : (
              <Chip size="small" color="warning" label="No membership yet" />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {row.email}{m ? ` · ${money(m)}` : ''}
          </Typography>
          {row.suggestions.length ? (
            <Typography variant="caption" color="text.secondary" display="block">
              May also be theirs: {row.suggestions.map((s) => `${s.name} #${s.account_id} (${s.why.join(', ')})`).join('; ')}
            </Typography>
          ) : null}
        </Box>
        {canMerge ? (
          <Button size="small" variant="outlined" onClick={onMerge}>Merge a customer membership&hellip;</Button>
        ) : null}
      </Stack>
    </Paper>
  );
}

/**
 * Thrift+ → Staff (owner 2026-10-15; rulebook J6): every active staff member has their own Thrift+ membership, free
 * like every one, and their Dash email signs them in to the Thrift+ app. A new staff login gets one at once; the owner
 * fills in the staff from before with "Create missing staff memberships", and merges a customer membership a staff
 * member made before (another email) into their own. Managers can look; the owner changes.
 */
export default function StaffTab() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const list = useQuery({ queryKey: STAFF_KEY, queryFn: fetchStaffMemberships });
  const [merging, setMerging] = useState<StaffMemberRow | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: createMissingStaffMemberships,
    onSuccess: (data) => {
      queryClient.setQueryData(STAFF_KEY, data);
      setDone(`Made ${plural(data.made, 'staff membership', 'staff memberships')}; linked ${data.linked} by the same email.`);
    },
    onError: (err) => enqueueSnackbar(detail(err), { variant: 'error' }),
  });
  if (list.isLoading) return <LinearProgress />;
  if (list.isError || !list.data) return <Alert severity="error">Could not load the staff memberships.</Alert>;
  const data = list.data;
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Every staff member has their own Thrift+ membership. Their Dash email signs them in to the Thrift+ app.
      </Typography>
      {done ? <Alert severity="success" onClose={() => setDone(null)} data-testid="staff-done">{done}</Alert> : null}
      {data.can_merge && data.missing > 0 ? (
        <Box>
          <Button variant="contained" disabled={create.isPending} onClick={() => create.mutate()}>
            Create missing staff memberships ({data.missing})
          </Button>
        </Box>
      ) : null}
      {data.staff.map((row) => (
        <StaffRow key={row.user_id} row={row} canMerge={data.can_merge} onMerge={() => setMerging(row)} />
      ))}
      {merging ? (
        <MergeDialog
          key={merging.user_id}
          row={merging}
          onClose={() => setMerging(null)}
          onMerged={(r) => {
            setMerging(null);
            setDone(mergedText(r));
            void queryClient.invalidateQueries({ queryKey: STAFF_KEY });
            void queryClient.invalidateQueries({ queryKey: ['thriftplus', 'find'] });
            void queryClient.invalidateQueries({ queryKey: ['thriftplus', 'account'] });
          }}
        />
      ) : null}
    </Stack>
  );
}
