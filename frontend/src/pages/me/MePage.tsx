/**
 * Me (critic review 2026-10-21, digest point 3): one page for every staff login. My details and emergency contact,
 * my password and register PIN, Hours & pay, my weekly shifts, my onboarding and check-ins, and sign out on all
 * devices. Opened from the account menu (Dash) and the Me tab (Thrift+ Staff on the store phones).
 *
 * My drawers and covers join here once the register's drawer life ships (the `drawers` slot in the API).
 */
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  getMePage,
  patchMeDetails,
  setMyRegisterPin,
  signOutEverywhere,
  type MePage as MePageData,
} from '../../api/accounts.api';
import { getMyCheckins, getMyOnboarding } from '../../api/hiring.api';
import { HoursPayPanel } from '../../components/hr/HoursPayPanel';
import ChangePasswordDialog from '../../components/users/ChangePasswordDialog';
import { useAuth } from '../../contexts/AuthContext';
import { ccTokens } from '../../theme';

const ME_KEY = ['auth', 'me-page'] as const;

function errorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  const first = Object.values(data).find((value) => typeof value === 'string' || Array.isArray(value));
  return Array.isArray(first) ? String(first[0]) : typeof first === 'string' ? first : fallback;
}

function Section({ title, action, children, testId }: { title: string; action?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <Box data-testid={testId} sx={{ p: 2, mb: 1.5, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography fontWeight={800} sx={{ flex: 1 }}>{title}</Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, py: 0.25 }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 130, flexShrink: 0 }}>{label}</Typography>
      <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{value || '-'}</Typography>
    </Box>
  );
}

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = ((h + 11) % 12) + 1;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

function DetailsDialog({ data, open, onClose }: { data: MePageData; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [phone, setPhone] = useState(data.details.phone);
  const [name, setName] = useState(data.employee?.emergency_name ?? '');
  const [ice, setIce] = useState(data.employee?.emergency_phone ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Parameters<typeof patchMeDetails>[0] = { phone };
      if (data.employee) Object.assign(body, { emergency_name: name, emergency_phone: ice });
      const { data: next } = await patchMeDetails(body);
      queryClient.setQueryData(ME_KEY, next);
      enqueueSnackbar('Saved', { variant: 'success' });
      onClose();
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not save'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={save}>
        <DialogTitle>My phone and emergency contact</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="My phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" fullWidth />
            {data.employee ? (
              <>
                <TextField label="Emergency contact name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required />
                <TextField label="Emergency contact phone" value={ice} onChange={(e) => setIce(e.target.value)} inputMode="tel" fullWidth required />
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function PinDialog({ open, onClose, again }: { open: boolean; onClose: () => void; again: boolean }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const badFormat = pin.length > 0 && !/^\d{4,6}$/.test(pin);
  const mismatch = confirm.length > 0 && pin !== confirm;
  const close = () => {
    if (saving) return;
    setPin('');
    setConfirm('');
    setPassword('');
    setError('');
    onClose();
  };
  const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await setMyRegisterPin(pin, password);
      queryClient.setQueryData(ME_KEY, data);
      enqueueSnackbar('Register PIN saved', { variant: 'success' });
      setSaving(false);
      close();
    } catch (err) {
      setError(errorText(err, 'Could not save the PIN'));
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <form onSubmit={save}>
        <DialogTitle>{again ? 'Change my register PIN' : 'Set my register PIN'}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1.5 }}>
            4 to 6 numbers, only yours. Keep it to yourself: at the register it says it was you.
          </DialogContentText>
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="New PIN"
              type="password"
              value={pin}
              onChange={(e) => setPin(digits(e.target.value))}
              inputMode="numeric"
              autoComplete="off"
              error={badFormat}
              helperText={badFormat ? '4 to 6 numbers.' : 'Not 1111 or 1234.'}
              fullWidth
              required
              autoFocus
            />
            <TextField
              label="Same PIN again"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(digits(e.target.value))}
              inputMode="numeric"
              autoComplete="off"
              error={mismatch}
              helperText={mismatch ? 'These do not match.' : ' '}
              fullWidth
              required
            />
            <TextField
              label="My Dash password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              helperText="So no one else can set it on a computer you left signed in."
              fullWidth
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving || badFormat || mismatch || !pin || !confirm || !password}>
            {saving ? 'Saving…' : 'Save PIN'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function SignOutEverywhere() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      await signOutEverywhere();
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setBusy(false);
      enqueueSnackbar(errorText(err, 'Could not sign out everywhere'), { variant: 'error' });
    }
  };

  return (
    <>
      <Button color="error" variant="outlined" onClick={() => setAsk(true)} data-testid="me-sign-out-everywhere">
        Sign out on all devices
      </Button>
      <Dialog open={ask} onClose={busy ? undefined : () => setAsk(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Sign out on all devices?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Every phone and computer signed in as you is signed out, this one too. Use it if you lost a phone or left a
            computer signed in.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAsk(false)} disabled={busy}>Cancel</Button>
          <Button color="error" variant="contained" onClick={go} disabled={busy}>
            {busy ? 'Signing out…' : 'Sign out everywhere'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function MyOnboardingAndCheckIns() {
  const onboarding = useQuery({ queryKey: ['hiring', 'my-onboarding'], queryFn: async () => (await getMyOnboarding()).data, retry: false, staleTime: 5 * 60 * 1000 });
  const checkins = useQuery({ queryKey: ['hiring', 'my-checkins'], queryFn: async () => (await getMyCheckins()).data, retry: false, staleTime: 5 * 60 * 1000 });
  const o = onboarding.data?.onboarding;
  const rows = checkins.data ?? [];
  if (!o && rows.length === 0) return null;
  const next = rows.find((c) => c.status === 'scheduled');
  const signed = rows.filter((c) => c.status === 'done').length;
  return (
    <Section title="Onboarding and check-ins" testId="me-onboarding">
      {o ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
          <Typography variant="body2" sx={{ flex: 1 }}>
            {o.done < o.total ? `My onboarding: ${o.done} of ${o.total} done` : 'My onboarding is done'}
          </Typography>
          <Button size="small" component={RouterLink} to="/onboarding">Open</Button>
        </Box>
      ) : null}
      {rows.length ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
          <Typography variant="body2" sx={{ flex: 1 }}>
            {next ? `Next check-in: ${next.day}-day` : 'My check-ins'}
            {signed ? ` · ${signed} signed` : ''}
          </Typography>
          <Button size="small" component={RouterLink} to="/check-ins">Open</Button>
        </Box>
      ) : null}
    </Section>
  );
}

/** `compact`: inside Thrift+ Staff (the phone app has its own bar; no page title). */
export default function MePage({ compact = false }: { compact?: boolean }) {
  const query = useQuery({ queryKey: ME_KEY, queryFn: async () => (await getMePage()).data });
  const [details, setDetails] = useState(false);
  const [pin, setPin] = useState(false);
  const [password, setPassword] = useState(false);

  if (query.isLoading) return <CircularProgress sx={{ m: 4 }} />;
  if (query.isError || !query.data) return <Alert severity="error" sx={{ m: 2 }}>Could not load your page.</Alert>;
  const data = query.data;
  const d = data.details;
  const e = data.employee;

  return (
    <Box data-testid="me-page" sx={{ maxWidth: 760, mx: 'auto', p: { xs: 1.5, sm: 2 } }}>
      {!compact ? (
        <Typography variant="h4" fontWeight={700} sx={{ mb: 1.5 }}>
          Me
        </Typography>
      ) : null}

      <Section
        title={`${d.first_name} ${d.last_name}`}
        testId="me-details"
        action={<Button size="small" onClick={() => setDetails(true)}>Edit</Button>}
      >
        <Line label="Role" value={[d.role, e?.position, e?.department].filter(Boolean).join(' · ')} />
        <Line label="Sign-in name" value={d.username} />
        <Line label="Email" value={d.email} />
        <Line label="Phone" value={d.phone} />
        {e ? (
          <>
            <Line label="Emergency contact" value={e.emergency_name ? `${e.emergency_name} · ${e.emergency_phone}` : ''} />
            <Line label="Employee number" value={e.employee_number} />
          </>
        ) : null}
        {e && !e.emergency_name ? (
          <Alert severity="warning" sx={{ mt: 1 }}>Add someone to call in an emergency.</Alert>
        ) : null}
      </Section>

      <Section title="Password and register PIN" testId="me-security">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
          <Typography variant="body2" sx={{ flex: 1 }}>Dash password</Typography>
          <Button size="small" onClick={() => setPassword(true)}>Change</Button>
        </Box>
        {data.pin.can_set ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
            <Typography variant="body2" sx={{ flex: 1 }} data-testid="me-pin-status">
              Register PIN: {data.pin.set ? 'set' : 'not set yet'}
            </Typography>
            <Button size="small" variant={data.pin.set ? 'text' : 'contained'} onClick={() => setPin(true)}>
              {data.pin.set ? 'Change' : 'Set PIN'}
            </Button>
          </Box>
        ) : null}
      </Section>

      <Box sx={{ mb: 1.5 }}>
        <HoursPayPanel openByDefault />
      </Box>

      <Section title="My shifts" testId="me-schedule">
        {data.schedule.length ? (
          data.schedule.map((row) => (
            <Box key={`${row.shift}-${row.time_in}`} sx={{ display: 'flex', gap: 1, py: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="body2" fontWeight={700} sx={{ minWidth: 140 }}>{row.shift}</Typography>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {row.day_names.join(', ')} · {clock(row.time_in)} to {clock(row.time_out)}
              </Typography>
            </Box>
          ))
        ) : (
          <Typography variant="body2" color="text.secondary">No shifts set for you yet. Ask your manager.</Typography>
        )}
      </Section>

      <MyOnboardingAndCheckIns />

      <Box sx={{ mt: 2, mb: 2 }}>
        <SignOutEverywhere />
      </Box>

      <DetailsDialog key={details ? 'open' : 'closed'} data={data} open={details} onClose={() => setDetails(false)} />
      <PinDialog open={pin} again={data.pin.set} onClose={() => setPin(false)} />
      <ChangePasswordDialog open={password} onClose={() => setPassword(false)} />
    </Box>
  );
}
