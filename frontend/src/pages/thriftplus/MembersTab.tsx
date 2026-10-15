import AddAPhotoOutlined from '@mui/icons-material/AddAPhotoOutlined';
import PersonOutline from '@mui/icons-material/PersonOutline';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import {
  addSecondAdult,
  createMember,
  makePracticeMember,
  fetchMember,
  findMembers,
  killCard,
  removeSecondAdult,
  revokeMember,
  setPersonPhoto,
  setPersonEmail,
  setPersonNews,
  verifyPerson,
} from '../../api/thriftplus.api';
import type { NewMember, ThriftPlusAccount, ThriftPlusPerson } from '../../types/thriftplus.types';
import PersonFields from '../../components/thriftplus/PersonFields';
import MemberMoney from './MemberMoney';
import { getPayrollPeople } from '../../api/pos.api';
import { setMemberStaff } from '../../api/thriftplus.api';

/** A staff member's own membership (J6): marked so Dash knows whose membership it is. Thrift+ is free for everyone. */
function StaffLink({ account, onChanged }: { account: ThriftPlusAccount; onChanged: (a: ThriftPlusAccount) => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const [picking, setPicking] = useState(false);
  const people = useQuery({ queryKey: ['pos', 'payroll-people'], queryFn: async () => (await getPayrollPeople()).data, enabled: picking });
  const save = async (userId: number | null) => {
    try {
      onChanged(await setMemberStaff(account.id, userId));
      setPicking(false);
    } catch (err) {
      enqueueSnackbar(detail(err), { variant: 'error' });
    }
  };
  if (account.staff) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Chip color="success" label={`Staff: ${account.staff.name}`} />
        <Button size="small" color="inherit" onClick={() => void save(null)}>Not a staff membership</Button>
      </Stack>
    );
  }
  return picking ? (
    <TextField select size="small" label="Staff member" value="" sx={{ maxWidth: 320 }}
      onChange={(e) => void save(Number(e.target.value))}>
      {(people.data ?? []).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
    </TextField>
  ) : (
    <Box><Button size="small" onClick={() => setPicking(true)}>This is a staff member&rsquo;s own membership</Button></Box>
  );
}

/** A practice member: how to use it, and that it is never real (2026-10-10). */
function PracticeNote({ account }: { account: ThriftPlusAccount }) {
  const person = account.people.find((p) => p.role === 'primary') ?? account.people[0];
  const code = person?.cards.find((c) => c.status === 'active');
  return (
    <Alert severity="warning">
      <strong>Practice member.</strong> Use it on the training register and in the scanner&rsquo;s test mode. It never
      works on a real register and is left out of every report.
      {code && person?.phone ? (
        <> Scanner sign-in: member code <strong>{code.display}</strong> and phone ending <strong>{person.phone.slice(-4)}</strong>.</>
      ) : null}
    </Alert>
  );
}

/** The last 4 digits of a member code, for staff (the full code stays in the member's app). */
function last4(code: string): string {
  return code.replace(/\D/g, '').slice(-4);
}

/** History words (no physical card since 2026-10-14; the stored event names stay as they were). */
const EVENT_LABELS: Record<string, string> = {
  card_issued: 'member code given',
  card_killed: 'member code stopped',
  app_card: 'member code made in the app',
};

function eventLabel(action: string): string {
  return EVENT_LABELS[action] ?? action.replace(/_/g, ' ');
}

function detail(err: unknown): string {
  if (isAxiosError(err) && typeof err.response?.data?.detail === 'string') return err.response.data.detail;
  return 'That did not work.';
}

function fullName(p: ThriftPlusPerson): string {
  return `${p.first_name} ${p.last_name}`.trim();
}

function phone(p: string): string {
  return p.length === 10 ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : p;
}

/**
 * Name, phone, ID check and 18+ (only with an ID check), a photo, and the member code (last 4 only). The code lives in
 * the member's Thrift+ app (the member QR); replacing it stops the old one at once and the app shows a new one.
 */
function PersonCard({ person, account, onChanged }: { person: ThriftPlusPerson; account: ThriftPlusAccount; onChanged: (a: ThriftPlusAccount) => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const [email, setEmail] = useState('');
  const run = useMutation({
    mutationFn: (fn: () => Promise<ThriftPlusAccount | void>) => fn(),
    onSuccess: (a) => { if (a) onChanged(a); },
    onError: (err) => enqueueSnackbar(detail(err), { variant: 'error' }),
  });
  const active = !person.removed_at;
  const revoked = account.status === 'revoked';
  const hasCode = person.cards.some((c) => c.status === 'active');
  const replace = (cardId: number) => run.mutate(async () => {
    await killCard(cardId, 'replaced by staff');
    enqueueSnackbar("Old member code stopped. The member's app shows a new one the next time it opens.", { variant: 'success' });
    return fetchMember(account.id);
  });
  return (
    <Paper variant="outlined" sx={{ p: 1.5, opacity: active ? 1 : 0.55 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Avatar src={person.photo_url ?? undefined} sx={{ width: 72, height: 72 }} variant="rounded">
          <PersonOutline />
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography sx={{ fontWeight: 800 }}>{fullName(person)}</Typography>
            <Chip size="small" label={person.role === 'primary' ? 'Primary' : 'Second adult'} />
            {person.verified_18 ? <Chip size="small" color="success" label="18+ verified" /> : null}
            {!person.id_checked ? <Chip size="small" color="warning" label="Unverified: no returns, no 18+" /> : null}
            {!active ? <Chip size="small" label="Removed" /> : null}
          </Stack>
          <Typography variant="body2" color="text.secondary">{person.phone ? phone(person.phone) : 'No phone'}</Typography>
          {active ? (
            <Stack direction="row" spacing={1} sx={{ mt: 0.75 }} useFlexGap flexWrap="wrap" alignItems="center">
              {person.email ? (
                <>
                  <Typography variant="body2" color="text.secondary">{person.email}</Typography>
                  {person.emails ? (
                    <Chip
                      size="small"
                      color={person.emails.news ? 'success' : 'default'}
                      variant={person.emails.news ? 'filled' : 'outlined'}
                      label={`Store news: ${person.emails.news ? 'on' : 'off'}`}
                      onClick={() => run.mutate(() => setPersonNews(person.id, !person.emails?.news))}
                    />
                  ) : null}
                  <Typography variant="caption" color="text.secondary">Change only when the member asks.</Typography>
                </>
              ) : (
                <>
                  <TextField size="small" type="email" placeholder="Add an email" value={email} onChange={(e) => setEmail(e.target.value)} sx={{ width: 230 }} />
                  <Button size="small" variant="outlined" disabled={!email.trim()} onClick={() => run.mutate(async () => { const a = await setPersonEmail(person.id, email); setEmail(''); return a; })}>
                    Save email
                  </Button>
                </>
              )}
            </Stack>
          ) : null}
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {person.cards.map((c) => (
              <Stack key={c.id} direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="body2">
                  Member code ending <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{last4(c.code)}</Box>
                </Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  color={c.status === 'active' ? 'success' : 'default'}
                  label={c.status === 'dead' ? `Stopped${c.dead_reason ? `: ${c.dead_reason}` : ''}` : 'Active'}
                />
                {c.status === 'active' && !revoked ? (
                  <Button size="small" color="inherit" disabled={run.isPending} onClick={() => replace(c.id)}>
                    Replace member code
                  </Button>
                ) : null}
              </Stack>
            ))}
            {active && !revoked && !hasCode ? (
              <Typography variant="caption" color="text.secondary">
                No member code yet. The Thrift+ app makes one; at the register, the phone number works.
              </Typography>
            ) : null}
          </Stack>
          {active && !revoked ? (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap flexWrap="wrap" alignItems="center">
              {!person.id_checked ? (
                <>
                  <Button size="small" onClick={() => run.mutate(() => verifyPerson(person.id, true))}>ID checked: 18+</Button>
                  <Button size="small" onClick={() => run.mutate(() => verifyPerson(person.id, false))}>ID checked: under 18</Button>
                </>
              ) : null}
              <Button size="small" component="label" startIcon={<AddAPhotoOutlined />}>
                Photo
                <input hidden type="file" accept="image/*" capture="user" onChange={(e) => { const f = e.target.files?.[0]; if (f) run.mutate(() => setPersonPhoto(person.id, f)); }} />
              </Button>
              {person.role === 'secondary' ? (
                <>
                  <Button size="small" color="warning" onClick={() => run.mutate(() => removeSecondAdult(person.id, 'primary'))}>Removed by primary</Button>
                  <Button size="small" color="warning" onClick={() => run.mutate(() => removeSecondAdult(person.id, 'self'))}>Removed themselves</Button>
                </>
              ) : null}
            </Stack>
          ) : null}
        </Box>
      </Stack>
    </Paper>
  );
}

function AccountDetail({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const query = useQuery({ queryKey: ['thriftplus', 'account', id], queryFn: () => fetchMember(id) });
  const [second, setSecond] = useState<(NewMember & { both_present: boolean; primary_approves: boolean }) | null>(null);
  const [revokeReason, setRevokeReason] = useState<string | null>(null);
  const onChanged = (a: ThriftPlusAccount) => {
    queryClient.setQueryData(['thriftplus', 'account', id], a);
    void queryClient.invalidateQueries({ queryKey: ['thriftplus', 'find'] });
  };
  const addSecond = useMutation({
    mutationFn: () => addSecondAdult(id, second!),
    onSuccess: (a) => { onChanged(a); setSecond(null); enqueueSnackbar('Second adult added.', { variant: 'success' }); },
    onError: (err) => enqueueSnackbar(detail(err), { variant: 'error' }),
  });
  const revoke = useMutation({
    mutationFn: () => revokeMember(id, revokeReason ?? ''),
    onSuccess: (a) => { onChanged(a); setRevokeReason(null); },
    onError: (err) => enqueueSnackbar(detail(err), { variant: 'error' }),
  });
  const account = query.data;
  if (!account) return null;
  const hasSecond = account.people.some((p) => p.role === 'secondary' && !p.removed_at);
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Membership #{account.id}</Typography>
        {account.status === 'revoked' ? <Chip color="error" label={`Revoked: ${account.revoked_reason}`} /> : null}
      </Stack>
      {account.is_practice ? <PracticeNote account={account} /> : null}
      {account.people.map((p) => <PersonCard key={p.id} person={p} account={account} onChanged={onChanged} />)}
      <StaffLink account={account} onChanged={onChanged} />
      <MemberMoney accountId={account.id} />
      {account.status === 'active' ? (
        <Stack direction="row" spacing={1}>
          {!hasSecond ? (
            <Button variant="outlined" onClick={() => setSecond({ first_name: '', both_present: false, primary_approves: false })}>Add second adult</Button>
          ) : null}
          <Button color="error" onClick={() => setRevokeReason('')}>Revoke membership</Button>
        </Stack>
      ) : null}
      {account.events?.length ? (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>History</Typography>
          {account.events.map((e) => (
            <Typography key={e.id} variant="caption" display="block" color="text.secondary">
              {format(parseISO(e.created_at), 'MMM d, h:mm a')} · {eventLabel(e.action)}
              {e.person_name ? ` · ${e.person_name}` : ''}{e.card_code ? ` · code ending ${last4(e.card_code)}` : ''}{e.actor_name ? ` · by ${e.actor_name}` : ''}
            </Typography>
          ))}
        </Box>
      ) : null}

      <Dialog open={second !== null} onClose={() => setSecond(null)} fullWidth maxWidth="xs">
        <DialogTitle>Add a second adult</DialogTitle>
        <DialogContent>
          {second ? (
            <>
              <FormControlLabel control={<Checkbox checked={second.both_present} onChange={(e) => setSecond({ ...second, both_present: e.target.checked })} />} label="Both adults are here" />
              <FormControlLabel control={<Checkbox checked={second.primary_approves} onChange={(e) => setSecond({ ...second, primary_approves: e.target.checked })} />} label="The primary approves" />
              <PersonFields value={second} onChange={(v) => setSecond({ ...second, ...v })} blankCard={false} />
            </>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSecond(null)}>Cancel</Button>
          <Button variant="contained" disabled={!second?.first_name || !second.both_present || !second.primary_approves || addSecond.isPending} onClick={() => addSecond.mutate()}>Add</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={revokeReason !== null} onClose={() => setRevokeReason(null)} fullWidth maxWidth="xs">
        <DialogTitle>Revoke this membership?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>For theft, tag switching or return abuse. Every member code on it stops working.</Typography>
          <TextField fullWidth label="Reason" value={revokeReason ?? ''} onChange={(e) => setRevokeReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevokeReason(null)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={!revokeReason?.trim() || revoke.isPending} onClick={() => revoke.mutate()}>Revoke</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/** Find a member by scanning the member QR in their Thrift+ app, or by phone or name; sign up a new one. */
export default function MembersTab() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [signup, setSignup] = useState<NewMember | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const results = useQuery({ queryKey: ['thriftplus', 'find', debounced], queryFn: () => findMembers(debounced), enabled: debounced.length >= 2 });
  const practice = useMutation({
    mutationFn: () => makePracticeMember(),
    onSuccess: (a) => {
      setSelected(a.id);
      queryClient.setQueryData(['thriftplus', 'account', a.id], a);
      enqueueSnackbar('Practice member made.', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(detail(err), { variant: 'error' }),
  });
  const create = useMutation({
    mutationFn: () => createMember(signup!),
    onSuccess: (a) => {
      setSignup(null);
      setSelected(a.id);
      queryClient.setQueryData(['thriftplus', 'account', a.id], a);
      enqueueSnackbar('Member signed up.', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(detail(err), { variant: 'error' }),
  });

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
      <Stack spacing={1}>
        <TextField autoFocus label="Scan a member QR, or type a phone or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="contained" onClick={() => setSignup({ first_name: '', id_checked: false, verified_18: false })}>New member</Button>
        <Button variant="outlined" color="warning" disabled={practice.isPending} onClick={() => practice.mutate()}>
          Make a practice member
        </Button>
        {results.data?.length === 0 ? <Alert severity="info">No member found.</Alert> : null}
        {results.data?.length ? (
          <Paper variant="outlined">
            <List dense disablePadding>
              {results.data.map((a) => {
                const primary = a.people.find((p) => p.role === 'primary') ?? a.people[0];
                return (
                  <ListItemButton key={a.id} selected={selected === a.id} onClick={() => setSelected(a.id)}>
                    <ListItemText
                      primary={primary ? fullName(primary) : `Membership #${a.id}`}
                      secondary={`${primary?.phone ? phone(primary.phone) : 'No phone'}${a.status === 'revoked' ? ' · revoked' : ''}${a.is_practice ? ' · practice' : ''}`}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Paper>
        ) : null}
      </Stack>
      <Box>{selected ? <AccountDetail key={selected} id={selected} /> : <Typography color="text.secondary">Find a member, or sign up a new one.</Typography>}</Box>

      <Dialog open={signup !== null} onClose={() => setSignup(null)} fullWidth maxWidth="xs">
        <DialogTitle>New Thrift+ member</DialogTitle>
        <DialogContent>{signup ? <PersonFields value={signup} onChange={setSignup} blankCard={false} /> : null}</DialogContent>
        <DialogActions>
          <Button onClick={() => setSignup(null)}>Cancel</Button>
          <Button variant="contained" disabled={!signup?.first_name || create.isPending} onClick={() => create.mutate()}>Sign up</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
