import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  Drawer,
  IconButton,
  Link,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import type { EmailChoice, EmailDraft, EmailPreview } from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { EmailEditor } from './EmailEditor';
import { fillTemplate, isEdited, typedOver } from './emailTemplate';
import { errorText } from './peopleUi';

/**
 * The email itself, to read and edit: who it goes to, where the words come from, the subject and the message with
 * Dash's values as chips. Edits are for this one email; the template stays as it is.
 */
export function EmailCompose({
  draft,
  onChange,
}: {
  draft: EmailDraft;
  onChange: (words: { subject: string; body: string }) => void;
}) {
  const [words, setWords] = useState({ subject: draft.subject, body: draft.body });
  const [resetKey, setResetKey] = useState(0);
  const edited = isEdited(draft, words.subject, words.body);
  const over = typedOver(draft, words.subject, words.body);
  const update = (next: { subject: string; body: string }) => {
    setWords(next);
    onChange(next);
  };
  const row = (label: string, value: React.ReactNode) => (
    <Box sx={{ display: 'flex', gap: 1, py: 0.25, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <Typography variant="body2" sx={{ color: ccTokens.ink3, width: 92, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0, fontSize: 14, wordBreak: 'break-word' }}>{value}</Box>
    </Box>
  );

  return (
    <Box>
      <Box sx={{ mb: 1.5 }}>
        {row('To', draft.to.length ? draft.to.join(', ') : <i>no email address on file</i>)}
        {row('From', draft.from)}
        {row(
          'Words from',
          <>
            {draft.source}.{' '}
            <Link href={`/people/emails?key=${encodeURIComponent(draft.key)}`} target="_blank" rel="noopener" sx={{ whiteSpace: 'nowrap' }}>
              Edit the template
              <OpenInNewIcon sx={{ fontSize: 13, ml: 0.25, verticalAlign: '-2px' }} />
            </Link>
          </>,
        )}
        {draft.attachments.length > 0 &&
          row(
            'Attached',
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {draft.attachments.map((name) => (
                <Chip key={name} size="small" icon={<AttachFileIcon />} label={name} />
              ))}
            </Box>,
          )}
      </Box>
      {draft.practice && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Practice run: the subject starts with [Practice] and a first line says it is a practice.
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 1.5, fontSize: 12, color: ccTokens.ink2 }}>
        <span>
          <span className="ef-chip ef-swatch">Dana</span> filled in by Dash (tap to type over)
        </span>
        <span>
          <span className="ef-typed ef-swatch">Dana B.</span> typed over: no longer from Dash
        </span>
      </Box>
      <EmailEditor
        label="Subject"
        template={draft.subject}
        values={draft.values}
        fields={draft.fields}
        singleLine
        resetKey={resetKey}
        onChange={(subject) => update({ ...words, subject })}
      />
      <Box sx={{ mt: 1.5 }}>
        <EmailEditor
          label="Message"
          template={draft.body}
          values={draft.values}
          fields={draft.fields}
          resetKey={resetKey}
          onChange={(body) => update({ ...words, body })}
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1, minHeight: 32 }}>
        {edited ? (
          <>
            <Chip size="small" label="Edited for this email only" sx={{ bgcolor: ccTokens.warnTint, color: ccTokens.warnText, fontWeight: 700 }} />
            {over.length > 0 && (
              <Typography variant="caption" sx={{ color: ccTokens.warnText }}>
                No longer from Dash: {over.map((name) => draft.fields[name] ?? name).join(', ')}
              </Typography>
            )}
            <Button
              size="small"
              onClick={() => {
                setResetKey((k) => k + 1);
                update({ subject: draft.subject, body: draft.body });
              }}
            >
              Undo all changes
            </Button>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            The template&rsquo;s words, as they will go out.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export interface ReviewRun<T> {
  /** What the button does ("Book the interview"). */
  title: string;
  /** The action as a dry run: the email it would send (nothing saved or sent). */
  preview: () => Promise<{ data: EmailPreview }>;
  /** The action for real, with the email choice. */
  commit: (email?: EmailChoice) => Promise<T>;
  /** "Book and send". Default "Send". */
  sendLabel?: string;
  /** "Book without emailing". Shown when the server allows it. */
  skipLabel?: string;
}

function ReviewPanel({
  run,
  draft,
  onDone,
  onCancel,
}: {
  run: ReviewRun<unknown>;
  draft: EmailDraft;
  onDone: (result: unknown) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const { enqueueSnackbar } = useSnackbar();
  const [words, setWords] = useState({ subject: draft.subject, body: draft.body });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const noAddress = draft.to.length === 0;

  async function go(email: EmailChoice) {
    if ('body' in email && (!email.subject.trim() || !email.body.trim())) {
      setError('The email needs a subject and a message.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onDone(await run.commit(email));
    } catch (err) {
      setError(errorText(err, 'That did not work. Nothing was sent.'));
    } finally {
      setBusy(false);
    }
  }

  async function copyWords() {
    try {
      await navigator.clipboard.writeText(fillTemplate(words.body, draft.values));
      enqueueSnackbar('The message is copied. Paste it in a text.', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not copy.', { variant: 'error' });
    }
  }

  const skipLabel = run.skipLabel ?? 'Do it without emailing';
  const body = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: ccTokens.bg }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, bgcolor: '#fff', borderBottom: `1px solid ${ccTokens.line}` }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={700} noWrap sx={{ fontSize: 17 }}>
            {run.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Read the email first: {draft.label}
          </Typography>
        </Box>
        <IconButton aria-label="Cancel" onClick={onCancel} disabled={busy} sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        {noAddress && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            No email address on file, so this goes without an email. Copy the words to text them.
          </Alert>
        )}
        <EmailCompose draft={draft} onChange={setWords} />
        {error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
      </Box>
      <Box
        sx={{
          display: 'flex', gap: 1, flexWrap: 'wrap', p: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))', bgcolor: '#fff',
          borderTop: `1px solid ${ccTokens.line}`, '& .MuiButton-root': { minHeight: 44, flex: phone ? '1 1 auto' : undefined },
        }}
      >
        {noAddress ? (
          <>
            <Button variant="outlined" onClick={copyWords} disabled={busy}>
              Copy the message
            </Button>
            <Button variant="contained" onClick={() => go({ skip: true })} disabled={busy}>
              {skipLabel}
            </Button>
          </>
        ) : (
          <>
            <Button variant="contained" onClick={() => go(words)} disabled={busy}>
              {run.sendLabel ?? 'Send'}
            </Button>
            {draft.skip_allowed && (
              <Button variant="outlined" onClick={() => go({ skip: true })} disabled={busy}>
                {skipLabel}
              </Button>
            )}
          </>
        )}
        <Button color="inherit" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </Box>
    </Box>
  );

  return phone ? (
    <Dialog open fullScreen onClose={busy ? undefined : onCancel}>
      {body}
    </Dialog>
  ) : (
    <Drawer anchor="right" open onClose={busy ? undefined : onCancel} PaperProps={{ sx: { width: 'min(720px, 100vw)' } }}>
      {body}
    </Drawer>
  );
}

/**
 * Review before send. ``review(run)`` asks the server what the email would be (a dry run), shows it to read and
 * edit, and resolves with the action's result once sent or done without emailing, or null on Cancel (nothing done).
 * Render ``dialog`` in the component.
 */
export function useEmailReview() {
  const [open, setOpen] = useState<{ run: ReviewRun<unknown>; draft: EmailDraft; resolve: (v: unknown) => void } | null>(
    null,
  );

  async function review<T>(run: ReviewRun<T>): Promise<T | null> {
    const { data } = await run.preview(); // a refusal (time taken, no email…) goes to the caller
    if (!data.email) return run.commit(undefined);
    return new Promise<T | null>((resolve) =>
      setOpen({ run: run as ReviewRun<unknown>, draft: data.email!, resolve: resolve as (v: unknown) => void }),
    );
  }

  const dialog = open ? (
    <ReviewPanel
      run={open.run}
      draft={open.draft}
      onDone={(result) => {
        open.resolve(result);
        setOpen(null);
      }}
      onCancel={() => {
        open.resolve(null);
        setOpen(null);
      }}
    />
  ) : null;

  return { review, dialog };
}
