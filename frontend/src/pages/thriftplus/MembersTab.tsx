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
  fetchMember,
  findMembers,
  issueCard,
  killCard,
  removeSecondAdult,
  revokeMember,
  setPersonPhoto,
  setPersonEmail,
  setPersonEmails,
  verifyPerson,
} from '../../api/thriftplus.api';
import type { ConsentKind, NewMember, ThriftPlusAccount, ThriftPlusPerson } from '../../types/thriftplus.types';
import PersonFields from '../../components/thriftplus/PersonFields';
import MemberMoney from './MemberMoney';
import { getPayrollPeople } from '../../api/pos.api';
import { setMemberStaff } from '../../api/thriftplus.api';

/** A staff member's own membership pays no monthly cover while the owner's "Thrift+ free for staff" is on. */
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
        <Chip
          color={account.staff.free ? 'success' : 'default'}
          label={`Staff: ${account.staff.name}${account.staff.free ? ' (no monthly cover)' : ' (cover applies: staff Thrift+ is off in Settings)'}`}
        />
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

function detail(err: unknown): string {
  if (isAxiosError(err) && typeof err.response?.data?.detail === 'string') return err.response.data.detail;
  return 'That did not work.';
}

function fullName(p: ThriftPlusPerson): string {
  return `${p.first_name} ${p.last_name}`.trim();
}

const EMAIL_KINDS: [ConsentKind, string][] = [['thriftplus', 'Thrift+ updates'], ['news', 'Store news']];

function phone(p: string): string {
  return p.length === 10 ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : p;
}

/** Name, phone, ID check and 18+ (only with an ID check), a photo, and a scanned card. */
function PersonCard({ person, account, onChanged }: { person: ThriftPlusPerson; account: ThriftPlusAccount; onChanged: (a: ThriftPlusAccount) => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const run = useMutation({
    mutationFn: (fn: () => Promise<ThriftPlusAccount | void>) => fn(),
    onSuccess: (a) => { if (a) onChanged(a); },
    onError: (err) => enqueueSnackbar(detail(err), { variant: 'error' }),
  });
  const active = !person.removed_at;
  const revoked = account.status === 'revoked';
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
                  {person.emails ? EMAIL_KINDS.map(([kind, label]) => {
                    const on = Boolean(person.emails?.[kind]);
                    return (
                      <Chip
                        key={kind}
                        size="small"
                        color={on ? 'success' : 'default'}
                        variant={on ? 'filled' : 'outlined'}
                        label={`${label}: ${on ? 'yes' : 'no'}`}
                        onClick={() => run.mutate(() => setPersonEmails(person.id, kind, !on))}
                      />
                    );
                  }) : null}
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
              <Stack key={c.id} direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{c.display}</Typography>
                <Chip size="small" variant="outlined" color={c.status === 'active' ? 'success' : 'default'} label={c.status === 'dead' ? `Dead (${c.dead_reason})` : 'Active'} />
                {c.status === 'active' && !revoked ? (
                  <Button size="small" color="inherit" onClick={() => run.mutate(async () => { await killCard(c.id, 'lost'); return fetchMember(account.id); })}>
                    Lost
                  </Button>
                ) : null}
              </Stack>
            ))}
          </Stack>
          {active && !revoked ? (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap flexWrap="wrap" alignItems="center">
              <TextField size="small" placeholder="Scan a blank card" value={code} onChange={(e) => setCode(e.target.value)} sx={{ width: 190 }} />
              <Button size="small" variant="outlined" disabled={!code} onClick={() => run.mutate(async () => { const a = await issueCard(person.id, code); setCode(''); return a; })}>
                Issue card
              </Button>
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
              {format(parseISO(e.created_at), 'MMM d, h:mm a')} · {e.action.replace(/_/g, ' ')}
              {e.person_name ? ` · ${e.person_name}` : ''}{e.card_code ? ` · ${e.card_code}` : ''}{e.actor_name ? ` · by ${e.actor_name}` : ''}
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
              <PersonFields value={second} onChange={(v) => setSecond({ ...second, ...v })} />
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
          <Typography variant="body2" sx={{ mb: 1 }}>For theft, tag switching or return abuse. Every card on it stops working.</Typography>
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

/** Find a member by scanning their card, or by phone or name; sign up a new one. */
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
        <TextField autoFocus label="Scan a card, or type a phone or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="contained" onClick={() => setSignup({ first_name: '', id_checked: false, verified_18: false })}>New member</Button>
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
                      secondary={`${primary?.phone ? phone(primary.phone) : 'No phone'}${a.status === 'revoked' ? ' · revoked' : ''}`}
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
        <DialogContent>{signup ? <PersonFields value={signup} onChange={setSignup} /> : null}</DialogContent>
        <DialogActions>
          <Button onClick={() => setSignup(null)}>Cancel</Button>
          <Button variant="contained" disabled={!signup?.first_name || create.isPending} onClick={() => create.mutate()}>Sign up</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
