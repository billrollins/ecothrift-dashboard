import CheckIcon from '@mui/icons-material/Check';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import MailOutline from '@mui/icons-material/MailOutline';
import SmsOutlined from '@mui/icons-material/SmsOutlined';
import WorkHistoryOutlined from '@mui/icons-material/WorkHistoryOutlined';
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import {
  getTextDraft,
  sendText,
  type ApplicationDetail,
  type ApplicationRow,
  type OutreachStep,
  type TextWhich,
} from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { CalloutMarks } from './FlagDots';

/**
 * Reaching applicants (owner 2026-10-12): an Initial and a Reminder, by email and by text. Texts go from a phone by
 * hand (texting isn't wired): copy the number and the words, then "Text sent". Phone and email copy on a click.
 */

function when(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** A phone or tablet (owner 2026-10-12: there the text opens ready to send). */
export function onPhone(ua = navigator.userAgent, touch = navigator.maxTouchPoints ?? 0): boolean {
  return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && touch > 1);
}

/** A text to this number with the message filled in. iPhones read "&body=", Android "?body=". */
export function smsHref(phone: string, body: string, ua = navigator.userAgent, touch = navigator.maxTouchPoints ?? 0): string {
  const number = phone.replace(/[^\d+]/g, '');
  const apple = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && touch > 1);
  return `sms:${number}${apple ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A phone number or an email you copy with one click ("Copied"). */
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <Tooltip title={copied ? 'Copied' : `Copy ${label}`} placement="top">
      <ButtonBase
        onClick={async () => {
          if (await copy(value)) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }
        }}
        aria-label={`Copy ${label}: ${value}`}
        sx={{
          px: 0.75, py: 0.25, borderRadius: 1, fontSize: 'inherit', color: copied ? ccTokens.goodText : 'inherit',
          fontWeight: copied ? 700 : 'inherit', wordBreak: 'break-all', textAlign: 'left',
          '&:hover': { bgcolor: ccTokens.neuTint },
        }}
      >
        {copied ? `${value} · Copied` : value}
      </ButtonBase>
    </Tooltip>
  );
}

type StepRow = {
  key: string;
  icon: React.ReactNode;
  label: string;
  step: OutreachStep;
  status: string;
  action?: React.ReactNode;
};

function Status({ step, text }: { step: OutreachStep; text: string }) {
  const tone = step.at ? ccTokens.goodText : step.due ? ccTokens.warnText : ccTokens.ink3;
  return (
    <Typography sx={{ fontSize: 13, color: tone, fontWeight: step.due ? 700 : 500, display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {step.at && <CheckIcon sx={{ fontSize: 16 }} />}
      {text}
    </Typography>
  );
}

/**
 * The four steps while they haven't booked: Email Initial (send, reviewed), Email Reminder (goes by itself a day
 * later), Text Initial and Text Reminder (copy, send from your phone, "Text sent").
 */
export function OutreachCard({
  app,
  busy,
  onSendEmail,
  onSendReminder,
  onChanged,
}: {
  app: ApplicationDetail;
  busy: boolean;
  onSendEmail: () => void;
  /** The reminder email goes by itself a day later; this sends it now (reviewed). */
  onSendReminder: () => void;
  onChanged: (fresh: ApplicationDetail) => void;
}) {
  const [texting, setTexting] = useState<TextWhich | null>(null);
  const o = app.outreach;
  if (!o?.active) return null;
  // Owner 2026-10-12: one button per step, named for what it does; it stays until that step is sent.
  const canText = Boolean(app.phone) && !o.text_initial.stopped;
  const send = (label: string, due: boolean, onClick: () => void, disabled = false) => (
    <Button size="small" variant={due ? 'contained' : 'outlined'} disabled={busy || disabled} onClick={onClick} sx={{ whiteSpace: 'nowrap' }}>
      {label}
    </Button>
  );
  const rows: StepRow[] = [
    {
      key: 'email_initial', icon: <MailOutline sx={{ fontSize: 18 }} />, label: 'Initial email (interview link)', step: o.email_initial,
      status: o.email_initial.at ? `Sent ${when(o.email_initial.at)}` : app.email ? 'Due now' : 'No email',
      action: !o.email_initial.at && app.email && send('Send Initial Email', o.email_initial.due, onSendEmail),
    },
    {
      key: 'email_reminder', icon: <MailOutline sx={{ fontSize: 18 }} />, label: "Reminder email (Don't miss out)", step: o.email_reminder,
      status: o.email_reminder.at
        ? `Sent ${when(o.email_reminder.at)}`
        : o.email_reminder.auto_at
          ? `Goes by itself ${when(o.email_reminder.auto_at)}`
          : o.email_initial.at ? 'Send it by hand' : app.email ? 'After the initial email' : 'No email',
      action: !o.email_reminder.at && o.email_initial.at && app.email && send('Send Reminder Email', false, onSendReminder),
    },
    {
      key: 'text_initial', icon: <SmsOutlined sx={{ fontSize: 18 }} />, label: 'Initial text (interview link)', step: o.text_initial,
      status: o.text_initial.at
        ? `Sent ${when(o.text_initial.at)}`
        : o.text_initial.stopped ? 'Asked not to be texted' : app.phone ? 'Due now' : 'No phone',
      action: !o.text_initial.at && canText && send('Send Initial Text', o.text_initial.due, () => setTexting('initial')),
    },
    {
      key: 'text_reminder', icon: <SmsOutlined sx={{ fontSize: 18 }} />, label: 'Reminder text', step: o.text_reminder,
      status: o.text_reminder.at
        ? `Sent ${when(o.text_reminder.at)}`
        : o.text_reminder.due ? 'Due now' : o.text_reminder.due_at ? `Due ${when(o.text_reminder.due_at)}` : 'After the initial text',
      action: !o.text_reminder.at && o.text_initial.at && canText && send('Send Reminder Text', o.text_reminder.due, () => setTexting('reminder')),
    },
  ];
  return (
    <Box sx={{ mt: 1.25, p: 1.25, borderRadius: ccTokens.rSm, bgcolor: '#fff' }} data-testid="outreach-card">
      <Typography variant="overline" sx={{ color: ccTokens.ink2, fontWeight: 700, letterSpacing: '.08em' }}>
        Reach them
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', columnGap: 1.25, rowGap: 0.75, alignItems: 'center' }}>
        {rows.map((r) => (
          <Box key={r.key} sx={{ display: 'contents' }} data-testid={`outreach-${r.key}`}>
            <Box sx={{ color: r.step.at ? ccTokens.good : r.step.due ? ccTokens.warn : ccTokens.ink3, display: 'grid' }}>{r.icon}</Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{r.label}</Typography>
              <Status step={r.step} text={r.status} />
            </Box>
            <Box>{r.action}</Box>
          </Box>
        ))}
      </Box>
      <TextDialog app={app} which={texting} onClose={() => setTexting(null)} onSent={onChanged} />
    </Box>
  );
}

/** The first text, the reminder or the offer, sent from our own number with one press (#218, owner 2026-11-27:
 * "needs to be sent from our number NOT a copy paste"). Shows the number and the words exactly as they go. */
export function TextDialog({
  app,
  which,
  onClose,
  onSent,
}: {
  app: Pick<ApplicationDetail, 'id' | 'first_name'>;
  which: TextWhich | null;
  onClose: () => void;
  onSent: (fresh: ApplicationDetail) => void;
}) {
  const [draft, setDraft] = useState<{ phone: string; sends: string } | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!which) return;
    setDraft(null);
    setError('');
    getTextDraft(app.id, which)
      .then(({ data }) => setDraft({ phone: data.phone, sends: data.sends || data.body }))
      .catch((err) => setError(apiDetail(err) || 'Could not make the text.'));
  }, [app.id, which]);

  const send = async () => {
    if (!which) return;
    setSending(true);
    setError('');
    try {
      const { data } = await sendText(app.id, which);
      onSent(data);
      onClose();
    } catch (err) {
      setError(apiDetail(err) || 'The text did not go. Nothing was recorded. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={which !== null} onClose={sending ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {which === 'reminder' ? 'Reminder text' : which === 'offer' ? 'Offer text' : 'Initial text'} to {app.first_name}
      </DialogTitle>
      <DialogContent>
        {!draft && !error && <CircularProgress size={24} />}
        {draft && (
          <>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: ccTokens.ink2 }}>To</Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 700, mb: 1.5 }}>{draft.phone}</Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: ccTokens.ink2 }}>Message</Typography>
            <Box
              data-testid="text-sends"
              sx={{ p: 1.5, mt: 0.5, borderRadius: ccTokens.rSm, border: `1px solid ${ccTokens.line}`, whiteSpace: 'pre-wrap', fontSize: 15 }}
            >
              {draft.sends}
            </Box>
          </>
        )}
        <Typography role="alert" color="error" sx={{ minHeight: 24, mt: 1, fontSize: 14, fontWeight: 600 }}>
          {error}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!draft || sending}
          onClick={() => void send()}
          startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SmsOutlined />}
          data-testid="send-text"
        >
          Send text
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function apiDetail(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : '';
}

// ── The list: at a glance, under each name ──────────────────────────────────

type Mark = 'sent' | 'due' | 'later';

function markOf(step: OutreachStep | undefined): Mark {
  if (!step) return 'later';
  return step.at ? 'sent' : step.due ? 'due' : 'later';
}

const MARK_COLOR: Record<Mark, string> = { sent: ccTokens.good, due: ccTokens.warn, later: ccTokens.line2 };

/** Two small dots: the Initial and the Reminder (green sent, amber due, grey not yet). */
function Pair({ a, b }: { a: Mark; b: Mark }) {
  const dot = (m: Mark) => (
    <Box component="span" sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: MARK_COLOR[m], display: 'inline-block' }} />
  );
  return (
    <Box component="span" sx={{ display: 'inline-flex', flexDirection: 'column', gap: '2px', ml: '1px' }}>
      {dot(a)}
      {dot(b)}
    </Box>
  );
}

function stepText(name: string, step: OutreachStep | undefined, reminder: OutreachStep | undefined): string {
  const one = (label: string, s: OutreachStep | undefined) =>
    !s ? '' : s.at ? `${label} sent ${when(s.at)}` : s.due ? `${label} due` : s.auto_at ? `${label} goes ${when(s.auto_at)}` : s.due_at ? `${label} due ${when(s.due_at)}` : `${label} not yet`;
  return `${name}: ${one('first', step)} · ${one('reminder', reminder)}`;
}

function Glyph({ title, on, tone, children }: { title: string; on: boolean; tone?: string; children: React.ReactNode }) {
  return (
    <Tooltip title={title} placement="top" disableInteractive>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', color: on ? tone ?? ccTokens.ink2 : ccTokens.line2, '& svg': { fontSize: 14 } }}>
        {children}
      </Box>
    </Tooltip>
  );
}

/**
 * Under each name in the list (owner 2026-10-12: at a glance, no extra width). Where they sit in the timeline already
 * says the stage and the interview time, so the line only adds what that doesn't:
 * - New and Reviewed: the role, then marks for resume, email (first and reminder), text (first and reminder),
 *   must-haves, worked here before and interviewed before;
 * - Contacted: the same, with how many times they were contacted in place of the role's tail;
 * - Interview scheduled and later: the role and the resume mark only.
 * Hover any mark for the words. ``showRole`` off on the candidate's own page (its header names the role).
 */
export function CandidateMarks({ row, showRole = true }: { row: ApplicationRow; showRole?: boolean }) {
  const o = row.outreach;
  const role = row.jobs[0]?.title ?? '';
  const early = row.stage === 'new' || row.stage === 'reviewed' || row.stage === 'contacted';
  const flagsMet = row.flags.length > 0 && row.flags.every((f) => f.ok !== false);
  const contacts = o ? [o.email_initial, o.email_reminder, o.text_initial, o.text_reminder].filter((x) => x.at).length : 0;
  return (
    <Box
      data-testid="candidate-marks"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, fontSize: 11, color: ccTokens.ink2, lineHeight: 1.2 }}
    >
      {showRole && (
        <Tooltip title={`Applied ${when(row.created_at)}${row.jobs.length > 1 ? ` · ${row.jobs.map((j) => j.title).join(', ')}` : ''}`} placement="top" disableInteractive>
          <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
            {role}
            {row.jobs.length > 1 ? ` +${row.jobs.length - 1}` : ''}
          </Box>
        </Tooltip>
      )}
      {row.stage === 'contacted' && (
        <Box component="span" data-testid="contact-count" sx={{ fontWeight: 700, color: ccTokens.ink, flexShrink: 0 }}>
          Contacted {contacts}×
        </Box>
      )}
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, flexShrink: 0, ml: showRole ? 'auto' : 0 }}>
        <Glyph title={row.has_resume ? 'Resume uploaded' : 'No resume'} on={row.has_resume} tone={ccTokens.ink2}>
          <DescriptionOutlined />
        </Glyph>
        {early && o && (
          <>
            <Glyph title={stepText('Email', o.email_initial, o.email_reminder)} on tone={o.email_initial.due ? ccTokens.warn : ccTokens.ink2}>
              <MailOutline />
              <Pair a={markOf(o.email_initial)} b={markOf(o.email_reminder)} />
            </Glyph>
            <Glyph title={stepText('Text', o.text_initial, o.text_reminder)} on tone={o.text_initial.due || o.text_reminder.due ? ccTokens.warn : ccTokens.ink2}>
              <SmsOutlined />
              <Pair a={markOf(o.text_initial)} b={markOf(o.text_reminder)} />
            </Glyph>
          </>
        )}
        {early && row.flags.length > 0 && (
          <Tooltip title={flagsMet ? 'Meets every must-have' : `Misses ${row.red_flags} must-have${row.red_flags === 1 ? '' : 's'}`} placement="top" disableInteractive>
            <Box component="span" sx={{ fontSize: 11, fontWeight: 800, color: flagsMet ? ccTokens.good : ccTokens.bad }}>
              {flagsMet ? '✓' : `✗${row.red_flags}`}
            </Box>
          </Tooltip>
        )}
        {early && row.callouts && <CalloutMarks callouts={row.callouts} />}
        {early && row.returning?.worked_here && (
          <Glyph title="Worked here before" on tone={ccTokens.kraftDeep}>
            <WorkHistoryOutlined />
          </Glyph>
        )}
        {early && row.returning?.interviewed_before && (
          <Glyph title="Interviewed before" on tone={ccTokens.kraftDeep}>
            <HistoryOutlined />
          </Glyph>
        )}
      </Box>
    </Box>
  );
}
