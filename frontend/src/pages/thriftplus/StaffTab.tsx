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
  fetchLoginCandidates,
  fetchLoginMergePreview,
  mergeCustomerLogin,
  type LoginCandidate,
  type LoginMergeResult,
} from '../../api/accounts.api';
import {
  createMissingStaffMemberships,
  fetchStaffMemberships,
  fetchStaffStartFresh,
  staffStartFresh,
  fetchStaffMergePreview,
  findMembers,
  mergeIntoStaff,
  type StaffCreateMissingResult,
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

/** What a login merge did, in one line. */
function loginMergedText(r: LoginMergeResult, row: StaffMemberRow): string {
  const moved = counts(r.moved);
  let text = `Merged ${r.source_email_was} into ${row.name}'s login${moved ? `: ${moved}` : ''}.`;
  if (r.customer_number) text += ` Website account ${r.customer_number}.`;
  if (r.thriftplus?.merged) text += ` Thrift+ membership #${r.thriftplus.source_account} merged in too.`;
  else if (r.thriftplus?.note) text += ` ${r.thriftplus.note}`;
  if (r.left.length) text += ` Left on the old login: ${r.left.join(', ')}.`;
  return text;
}

function LoginPick({ who, picked, onPick }: { who: LoginCandidate; picked: boolean; onPick: () => void }) {
  const bits = [who.name, who.customer_number, who.phone, who.why.length ? who.why.join(', ') : ''].filter(Boolean);
  return (
    <ListItemButton selected={picked} onClick={onPick}>
      <ListItemText primary={who.email} secondary={bits.join(' · ')} />
    </ListItemButton>
  );
}

/**
 * Merge a customer login into this staff login (owner 2026-10-15: "the outlook should merge into the staff account
 * (the staff login should overwrite the customer one.)"): pick a suggestion or find one, see what moves, then merge.
 * The staff login survives with its email, password and name; the customer login is switched off.
 */
function LoginMergeDialog({ row, onClose, onMerged }: {
  row: StaffMemberRow; onClose: () => void; onMerged: (r: LoginMergeResult) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [picked, setPicked] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const candidates = useQuery({
    queryKey: ['accounts', 'login-merge', 'candidates', row.user_id, debounced],
    queryFn: () => fetchLoginCandidates(row.user_id, debounced.length >= 2 ? debounced : ''),
  });
  const suggestions = candidates.data?.suggestions ?? row.login_suggestions ?? [];
  const results = (candidates.data?.results ?? []).filter((r) => !suggestions.some((s) => s.user_id === r.user_id));
  const preview = useQuery({
    queryKey: ['accounts', 'login-merge', 'preview', row.user_id, picked],
    queryFn: () => fetchLoginMergePreview(row.user_id, picked!),
    enabled: picked != null,
    retry: false,
  });
  const merge = useMutation({
    mutationFn: () => mergeCustomerLogin(row.user_id, picked!),
    onSuccess: (r) => onMerged(r),
    onError: (err) => enqueueSnackbar(detail(err), { variant: 'error' }),
  });
  const p = preview.data;
  const tp = p?.thriftplus;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Merge a customer login into {row.name}&rsquo;s</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            For a staff member who made a website login with another email before. Their staff login stays, with its
            email, Dash password and name; the customer login&rsquo;s website account, holds and messages move into it.
          </Typography>
          {suggestions.length ? (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>May be theirs</Typography>
              <List dense disablePadding>
                {suggestions.map((s) => (
                  <LoginPick key={s.user_id} who={s} picked={picked === s.user_id} onPick={() => setPicked(s.user_id)} />
                ))}
              </List>
            </Box>
          ) : null}
          <TextField size="small" label="Find a customer login: email, name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          {results.length ? (
            <List dense disablePadding>
              {results.map((s) => (
                <LoginPick key={s.user_id} who={s} picked={picked === s.user_id} onPick={() => setPicked(s.user_id)} />
              ))}
            </List>
          ) : debounced.length >= 2 && candidates.isSuccess && !candidates.data.results.length ? (
            <Typography variant="body2" color="text.secondary">No customer login found.</Typography>
          ) : null}
          {picked != null && preview.isLoading ? <LinearProgress /> : null}
          {preview.isError ? <Alert severity="error">{detail(preview.error)}</Alert> : null}
          {p ? (
            <Alert severity="warning" data-testid="login-merge-preview">
              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                {p.source.email} merges into {p.staff.email}:
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {p.profile.action === 'move' ? (
                  <li>Their website account {p.profile.customer_number} becomes {row.name}&rsquo;s</li>
                ) : p.profile.action === 'combine' ? (
                  <li>One website account stays: {p.profile.customer_number} (the earlier number)</li>
                ) : (
                  <li>{row.name}&rsquo;s website account stays as it is</li>
                )}
                {counts(p.moves) ? <li>Moves: {counts(p.moves)}</li> : <li>Nothing else points at it</li>}
                {tp?.account && !tp.refused ? (
                  <li>
                    Thrift+ membership #{tp.account}{tp.name ? ` (${tp.name})` : ''} merges into {row.name}&rsquo;s too
                    {tp.bucks != null && tp.credit != null ? `: ${money({ bucks: tp.bucks, credit: tp.credit })}` : ''}
                  </li>
                ) : null}
                {tp?.note ? <li>{tp.note}</li> : null}
              </Box>
              <Typography variant="body2">
                The staff login wins: {p.staff.email} stays the email, and the Dash password stays. {p.source.email} is
                switched off (it becomes {p.source_after}), so that address is free again.
              </Typography>
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" disabled={!p || merge.isPending} onClick={() => merge.mutate()}>
          {p ? `Merge ${p.source.email} into ${row.name}'s login` : 'Merge'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function StaffRow({ row, canMerge, onMerge, onMergeLogin }: {
  row: StaffMemberRow; canMerge: boolean; onMerge: () => void; onMergeLogin: () => void;
}) {
  const m = row.membership;
  const logins = row.login_suggestions ?? [];
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="staff-row">
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography sx={{ fontWeight: 800 }}>{row.name}</Typography>
            {row.role ? <Chip size="small" label={row.role} /> : null}
            {row.website ? (
              <Chip size="small" color="success" variant="outlined" label={`Website account ${row.website.customer_number}`} />
            ) : (
              <Chip size="small" color="warning" label="No website account yet" />
            )}
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
          {logins.length ? (
            <Typography variant="caption" color="text.secondary" display="block">
              Customer login that may be theirs: {logins.map((l) => `${l.email} (${l.why.join(', ')})`).join('; ')}
            </Typography>
          ) : null}
          {row.suggestions.length ? (
            <Typography variant="caption" color="text.secondary" display="block">
              May also be theirs: {row.suggestions.map((s) => `${s.name} #${s.account_id} (${s.why.join(', ')})`).join('; ')}
            </Typography>
          ) : null}
        </Box>
        {canMerge ? (
          <Stack direction={{ xs: 'row', sm: 'column' }} spacing={0.75} useFlexGap flexWrap="wrap">
            <Button size="small" variant="outlined" onClick={onMergeLogin}>Merge a customer login&hellip;</Button>
            <Button size="small" variant="outlined" onClick={onMerge}>Merge a customer membership&hellip;</Button>
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}

/** What "Create missing" made, in one line. */
function createdText(data: StaffCreateMissingResult): string {
  const parts: string[] = [];
  if (data.customers_made != null) parts.push(plural(data.customers_made, 'website account', 'website accounts'));
  parts.push(plural(data.made, 'staff membership', 'staff memberships'));
  return `Made ${parts.join(' and ')}; linked ${data.linked} by the same email.`;
}

/**
 * Start staff memberships fresh (owner 2026-10-16, "wipe, keep auto-make"): every staff membership, and every customer
 * membership with a staff email (staff signing each other up while testing), is deleted with everything on it; each
 * staff member then gets a fresh, empty one. Dash logins are not touched. Superuser only; can't be undone.
 */
function StartFreshDialog({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [typed, setTyped] = useState('');
  const preview = useQuery({ queryKey: ['thriftplus', 'staff-start-fresh'], queryFn: fetchStaffStartFresh, staleTime: 0 });
  const run = useMutation({
    mutationFn: () => staffStartFresh(typed),
    onSuccess: (data) => {
      queryClient.setQueryData(STAFF_KEY, data);
      void queryClient.invalidateQueries({ queryKey: ['thriftplus', 'find'] });
      void queryClient.invalidateQueries({ queryKey: ['thriftplus', 'account'] });
      onDone(`Deleted ${plural(data.deleted, 'membership', 'memberships')}; made ${plural(data.made, 'fresh staff membership', 'fresh staff memberships')}.`);
    },
    onError: (err) => enqueueSnackbar(detail(err), { variant: 'error' }),
  });
  const p = preview.data;
  const ok = !!p && typed.trim().toUpperCase() === p.words;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Start staff memberships fresh?</DialogTitle>
      <DialogContent>
        {preview.isError ? <Alert severity="error">{detail(preview.error)}</Alert> : null}
        {p ? (
          <Stack spacing={1.5} data-testid="staff-start-fresh">
            <Alert severity="warning">
              Deletes {plural(p.memberships, 'membership', 'memberships')} for good: every staff membership and any
              customer membership with a staff email, with their {plural(p.sales, 'sale', 'sales')},{' '}
              {plural(p.returns, 'return', 'returns')}, {plural(p.scans, 'scan', 'scans')} and ThriftBucks. Each staff
              member then gets a fresh, empty membership. Dash logins and passwords are not touched.
            </Alert>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {p.rows.map((r) => (
                <li key={r.account}>
                  #{r.account} {r.name}{r.staff_member ? ` (staff: ${r.staff_member})` : ''}
                  {r.sales ? ` · ${plural(r.sales, 'sale', 'sales')}` : ''}{r.bucks !== '0.00' ? ` · ${r.bucks} ThriftBucks` : ''}
                </li>
              ))}
            </Box>
            <TextField autoFocus fullWidth label={`Type ${p.words} to go ahead`} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Stack>
        ) : <LinearProgress />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" disabled={!ok || run.isPending} onClick={() => run.mutate()}>Start fresh</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Thrift+ → Staff (owner 2026-10-15; rulebook J6): every active staff member is also a website customer (they sign in
 * on ecothrift.us with their Dash password) and has their own Thrift+ membership, free like every one; their Dash email
 * signs them in to the Thrift+ app. A new staff login gets both at once; the owner fills in the staff from before with
 * "Create missing", merges a customer login a staff member made before (another email) into their staff login, and
 * merges a customer membership into their own. Managers can look; the owner changes.
 */
export default function StaffTab() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const list = useQuery({ queryKey: STAFF_KEY, queryFn: fetchStaffMemberships });
  const [merging, setMerging] = useState<StaffMemberRow | null>(null);
  const [mergingLogin, setMergingLogin] = useState<StaffMemberRow | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const create = useMutation({
    mutationFn: createMissingStaffMemberships,
    onSuccess: (data) => {
      queryClient.setQueryData(STAFF_KEY, data);
      setDone(createdText(data));
    },
    onError: (err) => enqueueSnackbar(detail(err), { variant: 'error' }),
  });
  if (list.isLoading) return <LinearProgress />;
  if (list.isError || !list.data) return <Alert severity="error">Could not load the staff list.</Alert>;
  const data = list.data;
  const missing = data.missing_any ?? data.missing;
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Every staff member is also a website customer: they sign in on ecothrift.us with their Dash password. Each has
        their own Thrift+ membership too; their Dash email signs them in to the Thrift+ app.
      </Typography>
      {done ? <Alert severity="success" onClose={() => setDone(null)} data-testid="staff-done">{done}</Alert> : null}
      {data.can_merge ? (
        <Stack direction="row" spacing={1}>
          {missing > 0 ? (
            <Button variant="contained" disabled={create.isPending} onClick={() => create.mutate()}>
              Create missing ({missing})
            </Button>
          ) : null}
          <Button color="error" variant="outlined" onClick={() => setFresh(true)}>Start staff memberships fresh</Button>
        </Stack>
      ) : null}
      {fresh ? <StartFreshDialog onClose={() => setFresh(false)} onDone={(t) => { setFresh(false); setDone(t); }} /> : null}
      {data.staff.map((row) => (
        <StaffRow key={row.user_id} row={row} canMerge={data.can_merge} onMerge={() => setMerging(row)}
          onMergeLogin={() => setMergingLogin(row)} />
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
      {mergingLogin ? (
        <LoginMergeDialog
          key={mergingLogin.user_id}
          row={mergingLogin}
          onClose={() => setMergingLogin(null)}
          onMerged={(r) => {
            const row = mergingLogin;
            setMergingLogin(null);
            setDone(loginMergedText(r, row));
            void queryClient.invalidateQueries({ queryKey: STAFF_KEY });
            void queryClient.invalidateQueries({ queryKey: ['accounts', 'login-merge'] });
            void queryClient.invalidateQueries({ queryKey: ['thriftplus', 'find'] });
            void queryClient.invalidateQueries({ queryKey: ['thriftplus', 'account'] });
          }}
        />
      ) : null}
    </Stack>
  );
}
