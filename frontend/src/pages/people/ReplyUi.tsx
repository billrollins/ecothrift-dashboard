import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { draftReply, sendFollowUp, type ApplicationDetail, type ReplyWhich } from '../../api/hiring.api';
import { useEmailReview } from './EmailReview';
import { errorText } from './peopleUi';

/**
 * Follow up / Not now (Dash #192): type or paste what to tell them; the AI writes the email (and a text) from it.
 * The status line keeps its height so nothing below moves while it writes.
 */
export function AiWriteBox({
  value,
  onChange,
  onWrite,
  writing,
  seconds,
  disabled = false,
  label = 'What do you want to tell them?',
  hint = 'The AI writes the email (and a text) from this. You read it before it goes.',
}: {
  value: string;
  onChange: (value: string) => void;
  onWrite: () => void;
  writing: boolean;
  seconds: number;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  return (
    <Box>
      <TextField
        label={label}
        placeholder="A few words, or paste a long note."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        multiline
        minRows={3}
        maxRows={14}
        fullWidth
        disabled={writing}
        inputProps={{ maxLength: 6000 }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, minHeight: 40, flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={onWrite} disabled={disabled || writing || !value.trim()} sx={{ minWidth: 150 }}>
          {writing ? `Writing… ${seconds}s` : 'Write it with AI'}
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 180 }}>
          {hint}
        </Typography>
      </Box>
    </Box>
  );
}

/** Start the AI and track its seconds; ``write`` resolves with the draft, or null after showing why it failed. */
export function useAiReply(applicationId: number) {
  const [writing, setWriting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');

  async function write(which: ReplyWhich, context: string, reason?: string) {
    setWriting(true);
    setSeconds(0);
    setError('');
    try {
      return await draftReply(applicationId, { which, context, reason }, setSeconds);
    } catch (err) {
      setError(err instanceof Error && !('response' in err) ? err.message : errorText(err, 'The AI could not write it. Try again.'));
      return null;
    } finally {
      setWriting(false);
    }
  }

  return { write, writing, seconds, error, setError };
}

const TEXT_DONE: Record<string, string> = {
  sent: 'texted',
  held: 'text held (texting is not live yet)',
  failed: 'the text could not be sent',
};

/** Follow up: a small box for what to say, then the usual review before send. Logged; the stage stays. */
export function FollowUpDialog({
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
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const { enqueueSnackbar } = useSnackbar();
  const [context, setContext] = useState('');
  const ai = useAiReply(application.id);
  const { review, dialog: reviewDialog } = useEmailReview();

  useEffect(() => {
    if (open) ai.setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function write() {
    const result = await ai.write('follow_up', context);
    if (!result) return;
    const { job, draft } = result;
    try {
      const done = await review({
        title: `Follow up with ${application.first_name}`,
        preview: async () => ({ data: { email: draft.email, text: draft.text } }),
        commit: async (email, text) => (await sendFollowUp(application.id, job, email, text)).data,
        skipLabel: 'Send the text only',
      });
      if (!done) return; // Cancel: back to the words, nothing sent
      setContext('');
      const parts = [
        done.sent === true ? `emailed to ${application.email}` : done.sent === false ? 'the email did not send' : '',
        done.text_status ? TEXT_DONE[done.text_status] ?? '' : '',
      ].filter(Boolean);
      onDone(done.application, `Follow-up: ${parts.join(', ') || 'done'}.`);
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not send the follow-up.'), { variant: 'error' });
    }
  }

  return (
    <>
      <Dialog open={open} onClose={ai.writing ? undefined : onClose} maxWidth="sm" fullWidth fullScreen={phone}>
        <DialogTitle>Follow up: {application.full_name}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <AiWriteBox value={context} onChange={setContext} onWrite={() => void write()} writing={ai.writing} seconds={ai.seconds} />
            {ai.error && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {ai.error}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={ai.writing}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
      {reviewDialog}
    </>
  );
}
