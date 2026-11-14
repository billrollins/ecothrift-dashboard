/**
 * The dialogs the Me page and Home > Profile share (Dash Update #139): my phone and emergency contact, my register PIN
 * (my password first), and sign out on all devices. Both pages read the same query (`ME_KEY`), so a save in one shows in
 * the other.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  patchMeDetails,
  setMyRegisterPin,
  signOutEverywhere,
  type MePage as MePageData,
} from '../../api/accounts.api';
import { useAuth } from '../../contexts/AuthContext';

export const ME_KEY = ['auth', 'me-page'] as const;

export function errorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  const first = Object.values(data).find((value) => typeof value === 'string' || Array.isArray(value));
  return Array.isArray(first) ? String(first[0]) : typeof first === 'string' ? first : fallback;
}

export function DetailsDialog({ data, open, onClose }: { data: MePageData; open: boolean; onClose: () => void }) {
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

export function PinDialog({ open, onClose, again }: { open: boolean; onClose: () => void; again: boolean }) {
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

export function SignOutEverywhere() {
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
