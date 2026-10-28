/**
 * Take out of queue: one action for a unit or a whole stack, two plain choices.
 *
 * 1. Give back to Processing - Restoration gives it back, with a reason.
 * 2. Check in here without Restoration - Processing changed its mind; the
 *    Receive dialog follows so the item gets its price and tag.
 *
 * Both close the job to Done as untouched; the items stay on their check-in.
 * Neither once Bench work has started: that item is finished from the Bench.
 */
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import type { RestorationJobDTO, RestorationTakeOutMode } from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';

const CHOICES: ReadonlyArray<{ id: RestorationTakeOutMode; label: string; detail: string }> = [
  {
    id: 'given_back',
    label: 'Give back to Processing',
    detail: 'Restoration gives it back. Processing sees it on its order row with your reason and decides where it goes.',
  },
  {
    id: 'no_work',
    label: 'Check in here without Restoration',
    detail: 'Processing changed its mind. Set where it goes and its price, and print the tags now.',
  },
];

/** What the Done tab says about a job that left the queue untouched. */
export const TAKE_OUT_LABELS: Record<RestorationTakeOutMode, string> = {
  given_back: 'Given back to Processing',
  no_work: 'Checked in, no work',
};

/** True once anyone has worked the item; then it is finished from the Bench. */
export function benchWorkStarted(job: RestorationJobDTO): boolean {
  return Boolean(job.bench_started_at) || (job.action_count ?? 0) > 0;
}

export function TakeOutOfQueueDialog({
  job,
  busy,
  onClose,
  onTakeOut,
}: {
  job: RestorationJobDTO | null;
  busy?: boolean;
  onClose: () => void;
  onTakeOut: (mode: RestorationTakeOutMode, reason: string) => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [choice, setChoice] = useState<RestorationTakeOutMode>('given_back');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!job) return;
    setChoice('given_back');
    setReason('');
  }, [job]);

  const units = job ? Math.max(job.quantity ?? 0, job.items?.length ?? 0, 1) : 1;
  const what = units > 1 ? `all ${units} units` : 'this item';
  const started = job ? benchWorkStarted(job) : false;
  const ready = !started && !busy && (choice !== 'given_back' || reason.trim().length > 0);

  return (
    <Dialog open={job != null} onClose={busy ? undefined : onClose} fullScreen={phone} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 950 }}>Take out of queue</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography sx={{ color: studio.inkMuted, fontWeight: 700 }}>
            {job?.name ?? ''} · {what}
          </Typography>
          {started ? (
            <Alert severity="warning">
              Bench work has started on this, so it can't leave the queue this way. Finish it from the Bench.
            </Alert>
          ) : null}
          <RadioGroup value={choice} onChange={(_e, next) => setChoice(next as RestorationTakeOutMode)}>
            {CHOICES.map((c) => (
              <FormControlLabel
                key={c.id}
                value={c.id}
                disabled={started || busy}
                control={<Radio />}
                sx={{ alignItems: 'flex-start', mb: 1, '& .MuiRadio-root': { mt: -0.5 } }}
                label={
                  <Stack spacing={0.25}>
                    <Typography sx={{ fontWeight: 900 }}>{c.label}</Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: studio.inkMuted }}>{c.detail}</Typography>
                  </Stack>
                }
              />
            ))}
          </RadioGroup>
          {choice === 'given_back' ? (
            <TextField
              label="Why is Restoration giving it back?"
              required
              multiline
              minRows={2}
              value={reason}
              disabled={started || busy}
              onChange={(e) => setReason(e.target.value)}
            />
          ) : (
            <Alert severity="info">Only if it hasn't been on the Bench. Next you set the price and print the tags.</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!ready}
          onClick={() => ready && onTakeOut(choice, reason.trim())}
          sx={{ fontWeight: 900 }}
        >
          {choice === 'given_back' ? 'Give back' : 'Next: price and tags'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
