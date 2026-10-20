import { Alert, Box, Button, ButtonBase, Chip, CircularProgress, Dialog, DialogContent, Drawer, Stack, TextField, Typography } from '@mui/material';
import { format, isToday, parseISO } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { deleteMember, sendMemberEmailLink } from '../../../api/thriftplus.api';
import {
  retakePersonPhoto,
  setPersonDetails,
  staffSignInQr,
  thriftErrorMessage,
  type ThriftPendingPerson,
} from '../../../api/thriftplusRegister.api';
import { compressImageToJpeg } from '../../../services/receiving/receivingClient';
import { pendingName } from '../../../components/pos/ThriftPlusPendingFind';
import QrSvg from '../../../components/thriftplus/QrSvg';
import { readyToVerify } from '../../../components/thriftplus/SelfieCheck';

function when(iso: string | null | undefined, long = false): string {
  if (!iso) return '';
  try {
    const d = parseISO(iso);
    if (long) return format(d, "EEE MMM d, yyyy 'at' h:mm a");
    return isToday(d) ? `Today ${format(d, 'h:mm a')}` : format(d, 'MMM d, h:mm a');
  } catch {
    return '';
  }
}

const big = { minHeight: 56, fontSize: '1.1rem', fontWeight: 700, borderRadius: 2 } as const;

/**
 * One online join on Finalize (owner 2026-10-16), compact and phone first. Line 1: the name (cut with "…" when long)
 * and To finish / Finished. Line 2: the member number (their QR's, in fours) · ••phone's last 4 · when they joined. The number never shrinks;
 * the date gives way first, then the phone.
 */
export function PersonCard({ person, onOpen }: { person: ThriftPendingPerson; onOpen: () => void }) {
  const done = person.status === 'active';
  const ready = readyToVerify(person);
  const meta = { fontSize: '0.85rem', color: 'text.secondary', whiteSpace: 'nowrap' } as const;
  return (
    <ButtonBase
      onClick={onOpen}
      data-testid={done ? 'finalize-person-done' : 'finalize-person-pending'}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.25, width: '100%', textAlign: 'left', px: 1.5, py: 1, borderRadius: 2,
        border: 1, borderColor: 'divider', flexShrink: 0, ...(done ? { bgcolor: 'action.hover' } : {}),
      }}
    >
      {/* Join v2 (owner 2026-10-19): their selfie, small, so staff know who is in front of them. */}
      {person.photo_url ? (
        <Box
          component="img"
          src={person.photo_url}
          alt=""
          draggable={false}
          data-testid="finalize-person-thumb"
          sx={{ width: 48, height: 48, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0, bgcolor: 'action.hover' }}
        />
      ) : null}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
          <Typography fontWeight={800} fontSize="1.05rem" noWrap sx={{ flex: 1, minWidth: 0 }}>{pendingName(person)}</Typography>
          <Typography fontWeight={800} fontSize="0.85rem" sx={{ flexShrink: 0, color: done ? 'success.main' : 'warning.dark' }}>
            {done ? 'Member' : 'To finish'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0, overflow: 'hidden' }} data-testid="finalize-person-line">
          <Typography component="span" sx={{ ...meta, flexShrink: 0, fontWeight: 700 }}>{person.code_display || (person.code_last4 ? `…${person.code_last4}` : 'No code')}</Typography>
          <Typography component="span" sx={{ ...meta, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {`· ${person.phone_last4 ? `••${person.phone_last4}` : (person.contact || 'no phone yet')}`}
          </Typography>
          <Typography component="span" sx={{ ...meta, flexShrink: 2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {person.joined_at ? `· ${when(person.joined_at)}` : ''}
          </Typography>
        </Box>
        {/* Who is quick: only the photo ID to check against the selfie. */}
        {ready ? (
          <Chip
            size="small"
            color="success"
            label="Ready: selfie + signed"
            data-testid="finalize-person-ready"
            sx={{ mt: 0.5, fontWeight: 700, height: 22 }}
          />
        ) : null}
      </Box>
    </ButtonBase>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
      <Typography sx={{ width: 110, flexShrink: 0, color: 'text.secondary', fontSize: '0.9rem' }}>{label}</Typography>
      <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{children}</Typography>
    </Box>
  );
}

const yes = (v: boolean | undefined) => (v ? 'Yes' : 'No');

/**
 * The sign-in QR (owner 2026-10-20: "a QR that will link AND sign them into the app in one go"). It works once, for
 * five minutes. In the Thrift+ app they tap "Scan the store's sign-in QR"; with no app, the phone's camera opens it.
 */
export function SignInQrDialog({ person, onClose }: { person: ThriftPendingPerson | null; onClose: () => void }) {
  const [qr, setQr] = useState<{ link: string; until: number } | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const open = person !== null;

  async function make() {
    if (!person) return;
    setError('');
    setQr(null);
    try {
      const r = await staffSignInQr(person.person_id);
      const until = Date.parse(r.expires_at);
      setQr({ link: r.link, until: Number.isFinite(until) ? until : Date.now() + 5 * 60_000 });
    } catch (err) {
      setError(thriftErrorMessage(err, 'Could not make the QR. Try again.'));
    }
  }

  useEffect(() => {
    if (!open) {
      setQr(null);
      setError('');
      return;
    }
    void make();
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
    // A new QR each time it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person?.person_id]);

  const left = qr ? Math.max(0, Math.ceil((qr.until - now) / 1000)) : 0;
  const expired = qr !== null && left === 0;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogContent data-testid="sign-in-qr" sx={{ textAlign: 'center' }}>
        <Typography variant="h5" fontWeight={800}>{`Sign ${person?.first_name ?? 'them'} in`}</Typography>
        <Typography sx={{ mt: 1 }}>
          In their Thrift+ app: <b>Scan the store&apos;s sign-in QR</b>. No app yet? Their phone&apos;s camera works too.
        </Typography>
        {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : null}
        {qr && !expired ? (
          <Box sx={{ mt: 2 }}>
            <QrSvg text={qr.link} label={`Sign-in QR for ${person?.first_name ?? 'them'}`} sx={{ width: 260, maxWidth: '100%' }} />
            <Typography color="text.secondary" data-testid="sign-in-qr-left">
              {`Works once · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left`}
            </Typography>
          </Box>
        ) : null}
        {!qr && !error ? <CircularProgress sx={{ mt: 3 }} /> : null}
        <Stack spacing={1} sx={{ mt: 2 }}>
          {expired || error ? (
            <Button variant="contained" size="large" onClick={() => void make()} sx={big}>Make a new QR</Button>
          ) : null}
          <Button size="large" onClick={onClose} sx={{ minHeight: 48 }}>Done</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

/** Their name and mobile number, typed with them in front of you (owner 2026-10-20). */
function DetailsForm({ person, onSaved, onCancel }: {
  person: ThriftPendingPerson;
  onSaved: (p: ThriftPendingPerson) => void;
  onCancel: () => void;
}) {
  const [first, setFirst] = useState(person.first_name);
  const [last, setLast] = useState(person.last_name);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      onSaved(await setPersonDetails(person.person_id, { first_name: first, last_name: last, phone }));
    } catch (err) {
      setError(thriftErrorMessage(err, 'Could not save. Try again.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack spacing={1.25} data-testid="person-details-form" sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider' }}>
      <TextField label="First name" value={first} onChange={(e) => setFirst(e.target.value)}
        slotProps={{ htmlInput: { autoCapitalize: 'words', autoComplete: 'off' } }} />
      <TextField label="Last name" value={last} onChange={(e) => setLast(e.target.value)}
        slotProps={{ htmlInput: { autoCapitalize: 'words', autoComplete: 'off' } }} />
      <TextField
        label={person.phone_last4 ? `Mobile number (now ends in ${person.phone_last4})` : 'Mobile number'}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        helperText={person.phone_last4 ? 'Leave blank to keep it. Read it back to them.' : 'Read it back to them.'}
        slotProps={{ htmlInput: { inputMode: 'tel', autoComplete: 'off' } }}
      />
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Stack direction="row" spacing={1}>
        <Button onClick={onCancel} sx={{ flex: 1, minHeight: 48 }}>Cancel</Button>
        <Button variant="contained" disabled={busy || !first.trim() || !last.trim()} onClick={() => void save()} sx={{ flex: 1, minHeight: 48 }}>
          {busy ? <CircularProgress size={22} color="inherit" /> : 'Save'}
        </Button>
      </Stack>
    </Stack>
  );
}

/**
 * Everything we know about one online join, from the bottom of the screen (owner 2026-10-16), with what can be done:
 * Finish now and Resend join email while they're to finish; the owner alone may Delete and start over (anything gone
 * wrong: they join again from the beginning).
 */
export function PersonSheet({ person, owner, onClose, onFinish, onDeleted, onChanged }: {
  person: ThriftPendingPerson | null;
  owner: boolean;
  onClose: () => void;
  onFinish: (p: ThriftPendingPerson) => void;
  onDeleted: () => void;
  /** A quick fix saved (owner 2026-10-20): the person as they are now. */
  onChanged?: (p: ThriftPendingPerson) => void;
}) {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const [qrFor, setQrFor] = useState<ThriftPendingPerson | null>(null);
  const [editing, setEditing] = useState(false);
  const photoInput = useRef<HTMLInputElement | null>(null);
  const open = person !== null;
  const done = person?.status === 'active';
  const name = person ? pendingName(person) : '';

  const close = () => {
    setNote(null);
    setConfirm(false);
    setTyped('');
    setEditing(false);
    onClose();
  };

  async function retake(file: File) {
    if (!person) return;
    setBusy(true);
    setNote(null);
    try {
      let photo: Blob = file;
      try {
        photo = await compressImageToJpeg(file, 1280, 0.85);
      } catch {
        photo = file;
      }
      onChanged?.(await retakePersonPhoto(person.person_id, photo));
      setNote({ ok: true, text: 'New photo saved.' });
    } catch (err) {
      setNote({ ok: false, text: thriftErrorMessage(err, 'Could not save the photo. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!person) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await sendMemberEmailLink(person.person_id);
      setNote({ ok: true, text: `Sent the ${r.sent === 'join' ? 'join' : 'sign-in'} email to ${r.sent_to}.` });
    } catch (err) {
      setNote({ ok: false, text: thriftErrorMessage(err, 'Could not send it. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!person) return;
    setBusy(true);
    setNote(null);
    try {
      await deleteMember(person.account_id, typed);
      close();
      onDeleted();
    } catch (err) {
      setNote({ ok: false, text: thriftErrorMessage(err, 'Could not delete. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={close}
      slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90dvh', maxWidth: 560, mx: 'auto' } } }}
    >
      {person ? (
        <Box data-testid="finalize-person-sheet" sx={{ px: 2, pt: 2, pb: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', overflowY: 'auto' }}>
          <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 1.5 }} />
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="h5" fontWeight={800} sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{name}</Typography>
            <Typography fontWeight={800} sx={{ color: done ? 'success.main' : 'warning.dark' }}>{done ? 'Member' : 'To finish'}</Typography>
          </Box>

          <Box sx={{ mt: 1 }}>
            <Row label="Member #">{person.code_display || (person.code_last4 ? `…${person.code_last4}` : 'None yet')}</Row>
            <Row label="Email">
              {person.email || 'None'}
              {person.email ? <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>{person.email_verified ? ' · confirmed' : ' · not confirmed yet'}</Box> : null}
            </Row>
            <Row label="Phone">{person.phone_last4 ? `ends in ${person.phone_last4}` : 'None'}</Row>
            <Row label="Joined online">{when(person.joined_at, true) || '—'}</Row>
            {done ? (
              <Row label="Finished">{`${when(person.finished_at, true) || '—'}${person.finished_by ? ` by ${person.finished_by}` : ''}`}</Row>
            ) : null}
            <Row label="Photo ID">{`${yes(person.id_checked)} checked · 18+ ${yes(person.verified_18)}`}</Row>
            <Row label="Signed">{person.signed_at ? when(person.signed_at, true) : 'Not yet'}</Row>
            <Row label="Thrift+ app">{person.app_signed_in ? 'Signed in' : 'Not signed in'}</Row>
            {person.photo_url ? (
              <Box sx={{ py: 1 }}>
                <Box component="img" src={person.photo_url} alt={`${name}'s photo`} draggable={false}
                  sx={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 2, display: 'block' }} />
              </Box>
            ) : null}
            {!done && person.qr ? (
              <Box sx={{ pt: 1.5, textAlign: 'center' }}>
                <QrSvg text={person.qr} label={`${name}'s member QR`} sx={{ width: 160 }} />
              </Box>
            ) : null}
          </Box>

          {note ? <Alert severity={note.ok ? 'success' : 'error'} sx={{ mt: 2 }} data-testid="finalize-sheet-note">{note.text}</Alert> : null}

          <Stack spacing={1.25} sx={{ mt: 2 }}>
            {!done ? (
              <Button variant="contained" size="large" onClick={() => { close(); onFinish(person); }} sx={{ ...big, minHeight: 64 }}>
                Check their ID now
              </Button>
            ) : null}
            {/* Quick fixes (owner 2026-10-20): any staff member, with the customer in front of them. */}
            <Button variant={done ? 'contained' : 'outlined'} size="large" onClick={() => setQrFor(person)} sx={big} data-testid="person-sign-in-qr">
              Sign-in QR
            </Button>
            <Button variant="outlined" size="large" disabled={busy} onClick={() => photoInput.current?.click()} sx={big} data-testid="person-retake-photo">
              {busy && !confirm ? <CircularProgress size={22} /> : person.photo_url ? 'Retake photo' : 'Take their photo'}
            </Button>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              data-testid="person-photo-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void retake(file);
              }}
            />
            {editing ? (
              <DetailsForm
                person={person}
                onCancel={() => setEditing(false)}
                onSaved={(p) => {
                  setEditing(false);
                  setNote({ ok: true, text: 'Saved.' });
                  onChanged?.(p);
                }}
              />
            ) : (
              <Button variant="outlined" size="large" onClick={() => setEditing(true)} sx={big} data-testid="person-edit">
                Edit name or phone
              </Button>
            )}
            {!done && person.email ? (
              <Button variant="text" size="large" disabled={busy} onClick={() => void resend()} sx={{ minHeight: 48 }}>
                Resend join email
              </Button>
            ) : null}
            {owner && !confirm ? (
              <Button color="error" size="large" onClick={() => setConfirm(true)} sx={{ minHeight: 48 }} data-testid="finalize-delete">
                Delete and start over
              </Button>
            ) : null}
            {owner && confirm ? (
              <Box sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: 'error.main' }}>
                <Typography fontWeight={700} sx={{ mb: 1 }}>
                  {`This deletes ${name}'s membership and everything on it. They join again from the beginning. Type their name to confirm.`}
                </Typography>
                <TextField fullWidth label="Their name" value={typed} onChange={(e) => setTyped(e.target.value)}
                  slotProps={{ htmlInput: { autoCapitalize: 'words', autoComplete: 'off' } }} />
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button onClick={() => { setConfirm(false); setTyped(''); }} sx={{ flex: 1, minHeight: 48 }}>Keep</Button>
                  <Button variant="contained" color="error" disabled={busy || !typed.trim()} onClick={() => void remove()} sx={{ flex: 1, minHeight: 48 }}>
                    {busy ? <CircularProgress size={22} color="inherit" /> : 'Delete'}
                  </Button>
                </Stack>
              </Box>
            ) : null}
            <Button size="large" onClick={close} sx={{ minHeight: 48 }}>Close</Button>
          </Stack>
        </Box>
      ) : null}
      <SignInQrDialog person={qrFor} onClose={() => setQrFor(null)} />
    </Drawer>
  );
}
