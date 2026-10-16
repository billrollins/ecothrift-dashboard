import { Alert, Box, Button, ButtonBase, CircularProgress, Drawer, Stack, TextField, Typography } from '@mui/material';
import { format, isToday, parseISO } from 'date-fns';
import { useState } from 'react';
import { deleteMember, sendMemberEmailLink } from '../../../api/thriftplus.api';
import { thriftErrorMessage, type ThriftPendingPerson } from '../../../api/thriftplusRegister.api';
import { pendingName } from '../../../components/pos/ThriftPlusPendingFind';
import QrSvg from '../../../components/thriftplus/QrSvg';

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
  const meta = { fontSize: '0.85rem', color: 'text.secondary', whiteSpace: 'nowrap' } as const;
  return (
    <ButtonBase
      onClick={onOpen}
      data-testid={done ? 'finalize-person-done' : 'finalize-person-pending'}
      sx={{
        display: 'block', width: '100%', textAlign: 'left', px: 1.5, py: 1, borderRadius: 2, border: 1, borderColor: 'divider',
        flexShrink: 0, ...(done ? { bgcolor: 'action.hover' } : {}),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
        <Typography fontWeight={800} fontSize="1.05rem" noWrap sx={{ flex: 1, minWidth: 0 }}>{pendingName(person)}</Typography>
        <Typography fontWeight={800} fontSize="0.85rem" sx={{ flexShrink: 0, color: done ? 'success.main' : 'warning.dark' }}>
          {done ? 'Finished' : 'To finish'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0, overflow: 'hidden' }} data-testid="finalize-person-line">
        <Typography component="span" sx={{ ...meta, flexShrink: 0, fontWeight: 700 }}>{person.code_display || (person.code_last4 ? `…${person.code_last4}` : 'No code')}</Typography>
        <Typography component="span" sx={{ ...meta, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {`· ${person.phone_last4 ? `••${person.phone_last4}` : 'no phone yet'}`}
        </Typography>
        <Typography component="span" sx={{ ...meta, flexShrink: 2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {person.joined_at ? `· ${when(person.joined_at)}` : ''}
        </Typography>
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
 * Everything we know about one online join, from the bottom of the screen (owner 2026-10-16), with what can be done:
 * Finish now and Resend join email while they're to finish; the owner alone may Delete and start over (anything gone
 * wrong: they join again from the beginning).
 */
export function PersonSheet({ person, owner, onClose, onFinish, onDeleted }: {
  person: ThriftPendingPerson | null;
  owner: boolean;
  onClose: () => void;
  onFinish: (p: ThriftPendingPerson) => void;
  onDeleted: () => void;
}) {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const open = person !== null;
  const done = person?.status === 'active';
  const name = person ? pendingName(person) : '';

  const close = () => {
    setNote(null);
    setConfirm(false);
    setTyped('');
    onClose();
  };

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
            <Typography fontWeight={800} sx={{ color: done ? 'success.main' : 'warning.dark' }}>{done ? 'Finished' : 'To finish'}</Typography>
          </Box>

          <Box sx={{ mt: 1 }}>
            <Row label="Member #">{person.code_display || (person.code_last4 ? `…${person.code_last4}` : 'None yet')}</Row>
            <Row label="Email">
              {person.email || 'None'}
              {person.email ? <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>{person.email_verified ? ' · confirmed' : ' · not confirmed yet'}</Box> : null}
            </Row>
            <Row label="Phone">{person.phone_last4 ? `ends in ${person.phone_last4}` : 'Not yet (asked when they finish)'}</Row>
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
              <>
                <Button variant="contained" size="large" onClick={() => { close(); onFinish(person); }} sx={{ ...big, minHeight: 64 }}>
                  Finish now
                </Button>
                <Button variant="outlined" size="large" disabled={busy || !person.email} onClick={() => void resend()} sx={big}>
                  {busy && !confirm ? <CircularProgress size={22} /> : 'Resend join email'}
                </Button>
              </>
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
    </Drawer>
  );
}
