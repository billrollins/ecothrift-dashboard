import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';
import {
  finishThriftJoin,
  reringThriftMember,
  thriftErrorMessage,
  type ThriftFinishJoin,
  type ThriftPendingPerson,
} from '../../api/thriftplusRegister.api';
import type { Cart } from '../../types/pos.types';
import { formatCurrency } from '../../utils/format';
import { reringMessage } from '../../utils/thriftPlusRegister';
import ThriftSignaturePad, { type ThriftSignaturePadHandle } from '../../pages/thriftplus/finalize/ThriftSignaturePad';
import { IdCheckFields, PhotoField } from '../thriftplus/PersonFields';
import QrSvg from '../thriftplus/QrSvg';
import SelfieCheck, { NO_CHECKS, checksDone, readyToVerify, type FaceChecks } from '../thriftplus/SelfieCheck';
import { pendingName } from './ThriftPlusPendingFind';
import { THRIFT_APP_ADDRESS } from './ThriftPlusSignupDialog';

interface Props {
  open: boolean;
  /** The person who joined online (from "Joined online?" or their QR scanned). */
  person: ThriftPendingPerson | null;
  onClose: () => void;
  /** The open sale to put them on once they finish, if there is one. */
  cart: Cart | null;
  /** A sale finished in the last 30 minutes they can re-ring. */
  lastSale: { id: number; total: string } | null;
  onCart: (cart: Cart) => void;
  /** The last sale was re-rung for them. */
  onRerung?: () => void;
  /** The training register can't finish a real membership. */
  training?: boolean;
}

/** The phone's 10 digits ("+1 402.555.0123" → "4025550123"), or '' while it isn't 10. */
export function phoneDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.length === 10 ? digits : '';
}

/** "(402) 555-0123", for the cashier to read back. */
export function phoneReadBack(digits: string): string {
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

type Step = 'verify' | 'phone' | 'readback' | 'id' | 'done';

/**
 * Finish joining at the register (owner 2026-10-15, J8). They started on their phone with a name and email; here the
 * cashier asks the phone number and reads it back, checks the photo ID (seen, never kept, J3) and takes the photo,
 * as at a register sign-up. The phone is then verified in person (the server records who and when), the membership
 * is ready (J2), and they go on the sale (or re-ring the last one).
 *
 * Join v2 (owner 2026-10-19): someone who took a selfie and signed in the app gets one screen: the selfie, "Check
 * their photo ID" (Name matches, Face matches the photo, 18 or older) and Verified. No phone, photo or signature.
 * For everyone else the phone number is optional now: left blank, Next goes straight to the ID.
 */
export default function ThriftPlusFinishJoinDialog({
  open, person, onClose, cart, lastSale, onCart, onRerung, training = false,
}: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [id, setId] = useState({ id_checked: false, verified_18: false });
  const [photo, setPhoto] = useState<File | null>(null);
  const [rering, setRering] = useState(true);
  const [busy, setBusy] = useState(false);
  const [where, setWhere] = useState('');
  // J5 (owner 2026-10-16): the customer may sign here on the touch screen; optional at the register.
  const [signed, setSigned] = useState(false);
  const [checks, setChecks] = useState<FaceChecks>(NO_CHECKS);
  const [newSelfie, setNewSelfie] = useState<File | null>(null);
  const pad = useRef<ThriftSignaturePadHandle | null>(null);
  const openSale = cart && cart.status === 'open' ? cart : null;
  const digits = phoneDigits(phone);
  // Optional since Join v2: blank is fine, a part number is not.
  const phoneOk = !phone.trim() || Boolean(digits);
  const name = person ? pendingName(person) : '';
  const ready = readyToVerify(person);

  useEffect(() => {
    if (open) {
      setStep(ready ? 'verify' : 'phone');
      setChecks(NO_CHECKS);
      setNewSelfie(null);
      setPhone('');
      setPhoneError('');
      setId({ id_checked: false, verified_18: false });
      setPhoto(null);
      setRering(true);
      setWhere('');
      setSigned(false);
    }
  }, [open, person?.person_id, ready]);

  /** The phone's next screen: the read-back when a number was given, else straight to the ID. */
  function afterPhone() {
    if (phoneOk) setStep(digits ? 'readback' : 'id');
  }

  /** The store-register path: the ID, the photo and an optional signature; the phone only when given. */
  async function finish() {
    if (!person || !phoneOk) return;
    const signature = signed ? await pad.current?.toBlob() : null;
    await complete({
      person: person.person_id, ...(digits ? { phone: digits } : {}), ...id, photo, cart: openSale?.id ?? null,
      ...(signature ? { signature } : {}),
    });
  }

  /** The selfie path (Join v2): the photo ID checked against the app selfie; a retaken photo replaces the selfie. */
  async function verified() {
    if (!person || !checksDone(checks)) return;
    await complete({
      person: person.person_id, id_checked: true, face_matches: true, verified_18: checks.over18, finalize: true,
      cart: openSale?.id ?? null, ...(newSelfie ? { photo: newSelfie } : {}),
    });
  }

  async function complete(body: ThriftFinishJoin) {
    if (!person) return;
    setBusy(true);
    try {
      const done = await finishThriftJoin(body);
      let note = '';
      if (done.cart) {
        onCart(done.cart);
        note = 'They are on this sale.';
      } else if (done.attach_error) {
        note = `Joined, but not on the sale: ${done.attach_error.detail}`;
      } else if (!openSale && lastSale && rering) {
        try {
          note = reringMessage(person.first_name, await reringThriftMember(lastSale.id, person.person_id));
          onRerung?.();
        } catch (err) {
          note = `Joined, but the last sale was not re-rung: ${thriftErrorMessage(err)}`;
        }
      }
      setWhere(note);
      setStep('done');
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'PHONE_TAKEN' || code === 'PHONE_BAD') {
        setPhoneError(thriftErrorMessage(err));
        setStep('phone');
      } else {
        enqueueSnackbar(thriftErrorMessage(err, 'Could not finish joining.'), { variant: 'error' });
      }
    } finally {
      setBusy(false);
    }
  }

  const reringBox = !openSale && lastSale ? (
    <FormControlLabel
      control={<Checkbox checked={rering} onChange={(e) => setRering(e.target.checked)} />}
      label={`Re-ring the last sale (${formatCurrency(lastSale.total)}) for them`}
    />
  ) : null;

  return (
    <Dialog open={open && person !== null} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{step === 'done' ? 'Finish joining' : 'Needs to finalize Thrift+'}</DialogTitle>
      <DialogContent>
        {/* The selfie path shows the name big under the selfie. */}
        {person && step !== 'verify' ? (
          <Box sx={{ mb: 1 }}>
            <Typography fontWeight={800}>{name}</Typography>
            <Typography variant="body2" color="text.secondary">{`Joined online${person.email ? ` with ${person.email}` : ''}.`}</Typography>
          </Box>
        ) : null}
        {/* Owner 2026-10-16: their QR, big, so the Finalize app on the store phone scans it straight off this screen. */}
        {/* Also for someone ready to verify (they did the selfie and signature in the app): the most common case. */}
        {person?.qr && (step === 'phone' || step === 'verify') ? (
          <Box data-testid="thrift-finish-qr" sx={{ mb: 2, p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider', textAlign: 'center' }}>
            <Typography fontWeight={800}>Finish on the store phone</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Open Find on the Thrift+ Staff app and scan this QR. Or finish here below.
            </Typography>
            <QrSvg text={person.qr} label={`${name}'s member QR`} sx={{ width: 220, maxWidth: '100%' }} />
            {person.code_last4 ? <Typography variant="caption" color="text.secondary">{`Member code ending ${person.code_last4}`}</Typography> : null}
          </Box>
        ) : null}
        {training ? (
          <Alert severity="warning">This is the training register. Finish joining on a real register.</Alert>
        ) : null}
        {/* Join v2 (owner 2026-10-19): a selfie and a signature from the app. Only the photo ID against the selfie. */}
        {!training && step === 'verify' && person ? (
          <Stack spacing={1.25} data-testid="thrift-finish-verify">
            <SelfieCheck
              person={person}
              checks={checks}
              onChecks={setChecks}
              retake={newSelfie}
              onRetake={setNewSelfie}
              disabled={busy}
              capture="user"
              imageMaxHeight={260}
            />
            {reringBox}
          </Stack>
        ) : null}
        {!training && step === 'phone' ? (
          <Stack spacing={1}>
            <Typography variant="body2">Ask their phone number. It&apos;s optional: leave it blank to skip.</Typography>
            {phoneError ? <Alert severity="error" data-testid="thrift-finish-phone-error">{phoneError}</Alert> : null}
            <TextField
              label="Phone number (optional)"
              value={phone}
              autoFocus
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && phoneOk) {
                  e.preventDefault();
                  afterPhone();
                }
              }}
              helperText={phone && !digits ? 'The whole number: 10 digits.' : ' '}
              slotProps={{ htmlInput: { inputMode: 'tel' } }}
            />
          </Stack>
        ) : null}
        {!training && step === 'readback' ? (
          <Box data-testid="thrift-finish-readback">
            <Typography variant="h5" fontWeight={800} sx={{ my: 1 }}>
              {`${phoneReadBack(digits)} - read it back to them`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Their phone finds them at the register from now on.
            </Typography>
          </Box>
        ) : null}
        {!training && step === 'id' ? (
          <Stack spacing={1.25}>
            <Typography variant="body2">
              {digits ? `Phone ${phoneReadBack(digits)}. Now check their photo ID and take the photo.` : 'Check their photo ID and take the photo.'}
            </Typography>
            {!id.id_checked ? (
              <Alert severity="info">Without an ID check they still collect ThriftBucks, but have no returns and no 18+ items.</Alert>
            ) : null}
            <IdCheckFields value={id} onChange={setId} />
            <PhotoField photo={photo} onChange={setPhoto} />
            <Typography variant="caption" color="text.secondary">
              Never scan or keep the ID itself: only the name, phone, email, photo and the 18+ flag are stored.
            </Typography>
            <Box data-testid="thrift-finish-signature">
              <Typography variant="body2" fontWeight={700}>
                The customer signs (optional here): I agree to the Thrift+ terms and photo release. I can read them at
                ecothrift.us/terms.
              </Typography>
              <ThriftSignaturePad ref={pad} onInk={setSigned} disabled={busy} />
            </Box>
            {reringBox}
          </Stack>
        ) : null}
        {step === 'done' ? (
          <Alert severity="success" data-testid="thrift-finish-done">
            <Typography fontWeight={800}>{`Welcome, ${person?.first_name ?? ''}.`}</Typography>
            {where ? <Typography variant="body2">{where}</Typography> : null}
            <Typography variant="body2" sx={{ mt: 1 }}>
              {`Next time: they open the Thrift+ app at ${THRIFT_APP_ADDRESS} and show their member QR${digits ? ', or give their phone number' : ''}.`}
            </Typography>
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        {step === 'done' || training ? (
          <Button variant="contained" onClick={onClose}>{training ? 'Close' : 'Done'}</Button>
        ) : null}
        {!training && step === 'phone' ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" disabled={!phoneOk} onClick={afterPhone}>Next</Button>
          </>
        ) : null}
        {!training && step === 'readback' ? (
          <>
            <Button onClick={() => setStep('phone')}>Change it</Button>
            <Button variant="contained" onClick={() => setStep('id')}>That&apos;s right</Button>
          </>
        ) : null}
        {!training && step === 'id' ? (
          <>
            <Button onClick={() => setStep(digits ? 'readback' : 'phone')} disabled={busy}>Back</Button>
            <Button variant="contained" disabled={busy} onClick={() => void finish()}>Finish joining</Button>
          </>
        ) : null}
        {!training && step === 'verify' ? (
          <>
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="contained" color="success" size="large" disabled={busy || !checksDone(checks)} onClick={() => void verified()}>
              Verified
            </Button>
          </>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
