import BadgeRounded from '@mui/icons-material/BadgeRounded';
import SmsRounded from '@mui/icons-material/SmsRounded';
import { Alert, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import {
  assistCheckCode,
  assistNoPhone,
  assistSendCode,
  thriftErrorMessage,
  type ThriftPendingPerson,
} from '../../../api/thriftplusRegister.api';

const big = { minHeight: 56, fontSize: '1.1rem', fontWeight: 700, borderRadius: 2 } as const;

type Way = 'text' | 'id' | null;

/**
 * Assisted join (owner 2026-11-03, rulebook J22) in the Staff app's Find: a customer with a flip phone, or no phone,
 * joins on the store phone (which takes no texts). Staff type the first and last name, then either
 * - **Text them a code:** their mobile number; our join code goes to their phone and staff type it in; or
 * - **No phone:** check their photo ID; the first and last name must match it.
 * `onReady` hands the new pending member to the one Finalize screen: their photo, the customer's tap on I agree, the
 * ID check (Name matches, 18 or older), Done. No links here: a customer may hold the phone (J13).
 */
export default function AssistedJoin({ onReady }: { onReady: (person: ThriftPendingPerson) => void }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [way, setWay] = useState<Way>(null);
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const named = first.trim() !== '' && last.trim() !== '';

  async function run(fn: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(thriftErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    run(async () => {
      await assistSendCode({ first_name: first.trim(), last_name: last.trim(), phone });
      setSent(true);
      setCode('');
    }, 'Could not send the code. Check the number and try again.');

  const check = () =>
    run(async () => onReady(await assistCheckCode({ phone, code })), 'That code did not work. Try again.');

  const noPhone = () =>
    run(async () => onReady(await assistNoPhone({ first_name: first.trim(), last_name: last.trim() })),
      'Could not make the membership. Try again.');

  return (
    <Stack spacing={2} data-testid="assisted-join">
      <Typography color="text.secondary">
        For a customer with a flip phone or no phone. They do the photo and I agree on this phone.
      </Typography>
      <Stack direction="row" spacing={1}>
        <TextField label="First name" value={first} onChange={(e) => setFirst(e.target.value)} disabled={busy || sent} fullWidth
          slotProps={{ htmlInput: { autoCapitalize: 'words', 'data-testid': 'assist-first' } }} />
        <TextField label="Last name" value={last} onChange={(e) => setLast(e.target.value)} disabled={busy || sent} fullWidth
          slotProps={{ htmlInput: { autoCapitalize: 'words', 'data-testid': 'assist-last' } }} />
      </Stack>

      {way === null ? (
        <>
          <Button variant="contained" size="large" startIcon={<SmsRounded />} disabled={!named} onClick={() => setWay('text')} sx={big}
            data-testid="assist-way-text">
            Text them a code
          </Button>
          <Button variant="outlined" size="large" startIcon={<BadgeRounded />} disabled={!named} onClick={() => setWay('id')} sx={big}
            data-testid="assist-way-id">
            No phone: check their ID
          </Button>
        </>
      ) : null}

      {way === 'text' ? (
        <Stack spacing={1.5}>
          <TextField label="Their mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy || sent}
            slotProps={{ htmlInput: { inputMode: 'tel', autoComplete: 'off', 'data-testid': 'assist-phone' } }} />
          <Typography variant="body2" color="text.secondary" data-testid="assist-text-consent">
            Tell them: a phone number gets one text with your code each time you ask. Msg &amp; data rates may apply.
            Reply STOP to cancel, HELP for help.
          </Typography>
          {!sent ? (
            <Button variant="contained" size="large" onClick={() => void send()} disabled={busy || phone.replace(/\D/g, '').length < 10} sx={big}
              data-testid="assist-send">
              {busy ? <CircularProgress size={24} color="inherit" /> : 'Send the code'}
            </Button>
          ) : (
            <>
              <Alert severity="info">Code sent. They read the 6 digits off their phone.</Alert>
              <TextField label="Code from their phone" value={code} onChange={(e) => setCode(e.target.value)} disabled={busy}
                slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code', 'data-testid': 'assist-code' } }} />
              <Button variant="contained" color="success" size="large" onClick={() => void check()}
                disabled={busy || code.replace(/\D/g, '').length !== 6} sx={big} data-testid="assist-check">
                {busy ? <CircularProgress size={24} color="inherit" /> : 'Check the code'}
              </Button>
              <Button onClick={() => setSent(false)} disabled={busy} data-testid="assist-resend">Wrong number? Send again</Button>
            </>
          )}
        </Stack>
      ) : null}

      {way === 'id' ? (
        <Stack spacing={1.5}>
          <Alert severity="warning" data-testid="assist-id-note">
            Check their photo ID now: the first and last name must match it exactly. Nothing from the ID is kept.
          </Alert>
          <Button variant="contained" color="success" size="large" onClick={() => void noPhone()} disabled={busy || !named} sx={big}
            data-testid="assist-id-ok">
            {busy ? <CircularProgress size={24} color="inherit" /> : 'Name matches their ID'}
          </Button>
        </Stack>
      ) : null}

      {way !== null && !sent ? (
        <Button onClick={() => setWay(null)} disabled={busy}>Choose another way</Button>
      ) : null}
      {error ? <Alert severity="error" data-testid="assist-error">{error}</Alert> : null}
    </Stack>
  );
}
