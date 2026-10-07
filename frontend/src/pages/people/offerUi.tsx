import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import {
  getCareers,
  getOfferPdf,
  makeOffer,
  previewOffer,
  previewOfferEmail,
  previewResendOffer,
  resendOffer,
  withdrawOffer,
  type ApplicationDetail,
  type Offer,
  type OfferTerms,
} from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { useEmailReview } from './EmailReview';
import { errorText } from './peopleUi';

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function nextMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return isoDate(d);
}

/** The letter as plain text: paragraphs, with "- " lines as bullets. */
export function LetterText({ text }: { text: string }) {
  return (
    <Box sx={{ fontSize: 14, lineHeight: 1.55 }}>
      {text.split('\n\n').map((para, i) => {
        const lines = para.split('\n').filter((l) => l.trim());
        if (lines.length && lines.every((l) => l.trimStart().startsWith('- '))) {
          return (
            <Box component="ul" key={i} sx={{ my: 1, pl: 2.5 }}>
              {lines.map((l) => (
                <li key={l}>{l.trimStart().slice(2)}</li>
              ))}
            </Box>
          );
        }
        return (
          <Typography key={i} sx={{ fontSize: 14, mb: 1.25, whiteSpace: 'pre-line' }}>
            {lines.join('\n')}
          </Typography>
        );
      })}
    </Box>
  );
}

export function OfferDialog({
  open,
  application,
  onClose,
  onDone,
}: {
  open: boolean;
  application: ApplicationDetail;
  onClose: () => void;
  onDone: (updated: ApplicationDetail, message: string) => void;
}) {
  const careers = useQuery({ queryKey: ['hiring', 'careers'], queryFn: async () => (await getCareers()).data });
  const staff = careers.data?.indexes.staff ?? [];
  const respondDays = careers.data?.doc.offer?.respond_days ?? 3;
  const firstJob = application.jobs[0];
  const fresh = (): OfferTerms => ({
    job: firstJob?.id ?? null,
    pay_rate: '15.00',
    start_date: nextMonday(),
    start_time: '09:00',
    schedule: '',
    employment_type: 'part_time',
    supervisor: null,
    respond_by: addDays(respondDays),
    note: '',
  });
  const [terms, setTerms] = useState<OfferTerms>(fresh);
  const [preview, setPreview] = useState<{ subject: string; letter: string; acknowledgments: string[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { review, dialog: reviewDialog } = useEmailReview();

  useEffect(() => {
    if (!open) return;
    setTerms(fresh());
    setPreview(null);
    setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof OfferTerms) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === undefined) return;
    setTerms((t) => ({ ...t, [key]: value }));
    setPreview(null);
  };

  function clean(): OfferTerms {
    return { ...terms, supervisor: terms.supervisor ? Number(terms.supervisor) : null, job: terms.job ? Number(terms.job) : null };
  }

  async function showPreview() {
    setBusy(true);
    setError('');
    try {
      const { data } = await previewOffer(application.id, clean());
      setPreview(data);
    } catch (err) {
      const data = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
      setError(data ? Object.values(data).flat().join(' ') : errorText(err, 'Could not build the letter.'));
    } finally {
      setBusy(false);
    }
  }

  async function send(email: boolean) {
    setBusy(true);
    setError('');
    try {
      const data = email
        ? await review({
            title: `Email the offer to ${application.first_name}`,
            preview: () => previewOfferEmail(application.id, clean()),
            commit: async (choice) => (await makeOffer(application.id, clean(), true, choice)).data,
            sendLabel: 'Make the offer and send',
          })
        : (await makeOffer(application.id, clean(), false)).data;
      if (!data) return; // Cancel: no offer made
      if (!email) await navigator.clipboard.writeText(data.link).catch(() => undefined);
      onDone(
        data.application,
        email
          ? data.sent
            ? `Offer emailed to ${application.email}.`
            : 'The offer was made, but the email did not send. Use Copy link and text it.'
          : 'Offer made. The link is copied; paste it in a text from your phone.',
      );
    } catch (err) {
      const data = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
      setError(data ? Object.values(data).flat().join(' ') : errorText(err, 'Could not make the offer.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Make an offer: {application.full_name}
        <Typography variant="body2" color="text.secondary">
          They read it and sign it with a finger on their phone. What you send is frozen; to change it, make a new
          offer (the old link stops working).
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Role" value={terms.job ?? ''} onChange={set('job')} fullWidth>
              {application.jobs.map((j) => (
                <MenuItem key={j.id} value={j.id}>
                  {j.title}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Pay ($/hr)" value={terms.pay_rate} onChange={set('pay_rate')} inputProps={{ inputMode: 'decimal' }}
              sx={{ minWidth: 140 }} />
            <TextField select label="Type" value={terms.employment_type ?? 'part_time'} onChange={set('employment_type')} sx={{ minWidth: 150 }}>
              <MenuItem value="part_time">Part time</MenuItem>
              <MenuItem value="full_time">Full time</MenuItem>
              <MenuItem value="seasonal">Seasonal</MenuItem>
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Start date" type="date" value={terms.start_date} onChange={set('start_date')}
              InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Start time" type="time" value={terms.start_time} onChange={set('start_time')}
              InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Reply by" type="date" value={terms.respond_by} onChange={set('respond_by')}
              InputLabelProps={{ shrink: true }} fullWidth />
          </Stack>
          <TextField label="Schedule" value={terms.schedule} onChange={set('schedule')} fullWidth
            placeholder="Blank = the role's schedule, e.g. Saturdays and two weekdays" />
          <TextField select label="Reports to" value={terms.supervisor ?? ''} onChange={set('supervisor')} fullWidth
            SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
            <MenuItem value="">The role's hiring manager</MenuItem>
            {staff.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Personal note (optional, goes in the letter)" value={terms.note} onChange={set('note')}
            multiline minRows={2} fullWidth placeholder="e.g. Wear closed-toe shoes on your first day." />
          {preview && (
            <Box sx={{ p: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: '#fafaf7' }}>
              <Typography fontWeight={700} sx={{ mb: 1 }}>
                {preview.subject}
              </Typography>
              <LetterText text={preview.letter} />
              <Typography variant="overline" sx={{ color: ccTokens.ink2, fontWeight: 700 }}>
                They tick each of these to sign
              </Typography>
              {preview.acknowledgments.map((a) => (
                <Typography key={a} variant="body2">
                  ☐ {a}
                </Typography>
              ))}
            </Box>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={showPreview} disabled={busy}>
          {preview ? 'Refresh preview' : 'Preview the letter'}
        </Button>
        <Button variant="outlined" onClick={() => send(false)} disabled={busy || !preview}>
          Make offer, copy link
        </Button>
        <Button variant="contained" onClick={() => send(true)} disabled={busy || !preview || !application.email}>
          Email the offer
        </Button>
      </DialogActions>
      {reviewDialog}
    </Dialog>
  );
}

const STATUS_COLOR: Record<Offer['status'], 'success' | 'default' | 'warning' | 'error' | 'info'> = {
  sent: 'info',
  viewed: 'info',
  signed: 'success',
  declined: 'error',
  expired: 'warning',
  withdrawn: 'default',
};

function stamp(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

export function OfferCard({
  offer,
  onChanged,
  onDeclinedNotNow,
}: {
  offer: Offer;
  onChanged: () => void;
  onDeclinedNotNow: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [busy, setBusy] = useState(false);
  const [showLetter, setShowLetter] = useState(false);
  const { review, dialog: reviewDialog } = useEmailReview();
  const open = offer.status === 'sent' || offer.status === 'viewed';

  async function run(action: () => Promise<unknown>, done: string, fallback: string) {
    setBusy(true);
    try {
      await action();
      enqueueSnackbar(done, { variant: 'success' });
      onChanged();
    } catch (err) {
      enqueueSnackbar(errorText(err, fallback), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function emailAgain() {
    setBusy(true);
    try {
      const data = await review({
        title: 'Email the offer again',
        preview: () => previewResendOffer(offer.id),
        commit: async (email) => (await resendOffer(offer.id, email)).data,
      });
      if (!data) return; // Cancel: nothing sent
      enqueueSnackbar(data.sent ? 'Offer emailed again.' : 'The email did not send. Use Copy link and text it.', {
        variant: data.sent ? 'success' : 'warning',
      });
      onChanged();
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not resend.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function openPdf() {
    const popup = window.open('', '_blank');
    try {
      const { data } = await getOfferPdf(offer.id);
      const url = URL.createObjectURL(data);
      if (popup) popup.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      popup?.close();
      enqueueSnackbar(errorText(err, 'Could not open the PDF.'), { variant: 'error' });
    }
  }

  const timeline = [
    offer.sent_at && `made ${stamp(offer.sent_at)}`,
    offer.viewed_at && `opened ${stamp(offer.viewed_at)}`,
    offer.signed_at && `signed ${stamp(offer.signed_at)} by ${offer.signer_name}`,
    offer.declined_at && `declined ${stamp(offer.declined_at)}${offer.decline_reason ? `: "${offer.decline_reason}"` : ''}`,
    offer.withdrawn_at && `withdrawn ${stamp(offer.withdrawn_at)}`,
  ].filter(Boolean);

  return (
    <Box sx={{ p: 1.5, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography fontWeight={700} sx={{ flex: 1, minWidth: 200 }}>
          {offer.position} · ${offer.pay_rate}/hr · starts {new Date(`${offer.start_date}T12:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
        </Typography>
        <Chip size="small" label={offer.status_label} color={STATUS_COLOR[offer.status]} />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
        {timeline.join(' · ')}
        {open ? ` · reply by ${new Date(`${offer.respond_by}T12:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
        {open && (
          <>
            <Button size="small" variant="outlined" disabled={busy}
              onClick={() => run(() => navigator.clipboard.writeText(offer.link), 'Offer link copied.', 'Could not copy.')}>
              Copy link
            </Button>
            <Button size="small" disabled={busy} onClick={emailAgain}>
              Email again
            </Button>
            <Button size="small" color="inherit" disabled={busy}
              onClick={() => {
                if (window.confirm('Withdraw this offer? Their link stops working.'))
                  void run(() => withdrawOffer(offer.id), 'Offer withdrawn.', 'Could not withdraw.');
              }}>
              Withdraw
            </Button>
          </>
        )}
        {offer.has_pdf && (
          <Button size="small" variant="contained" disabled={busy} onClick={openPdf}>
            Signed PDF
          </Button>
        )}
        {offer.status === 'declined' && (
          <Button size="small" variant="outlined" color="warning" onClick={onDeclinedNotNow}>
            Not now (Offer declined)
          </Button>
        )}
        <Button size="small" onClick={() => setShowLetter((s) => !s)}>
          {showLetter ? 'Hide letter' : 'Show letter'}
        </Button>
      </Box>
      {showLetter && (
        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: '8px', bgcolor: '#fafaf7', border: `1px solid ${ccTokens.line}` }}>
          <LetterText text={offer.letter_text} />
        </Box>
      )}
      {reviewDialog}
    </Box>
  );
}
