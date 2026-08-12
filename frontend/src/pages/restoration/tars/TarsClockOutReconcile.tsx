/**
 * Leaving with the clock still running.
 *
 * Clocking out ends the shift, so it also ends whatever was being worked. That
 * is the last moment anyone will remember what they were doing, so it is where
 * the description is asked for — after this, the item goes back on a shelf and
 * the answer is gone.
 *
 * The dialog stops the restoration clock and clocks out in one go, rather than
 * asking someone to remember to do both.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  useDescribeRestorationAction,
  usePauseRestorationJobTimer,
  useRestorationActions,
  useTarsBenchJobs,
} from '../../../hooks/useRestorationBench';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { actionScopeLabel, categoryMeta, formatDuration } from './tarsActions';
import { myRunningRestorationJob } from './tarsJobAdapter';

/** The item this user still has a clock running on, if any. */
export function useRunningRestorationWork(): RestorationJobDTO | null {
  const { user } = useAuth();
  const { data: jobs } = useTarsBenchJobs();
  return useMemo(
    () => myRunningRestorationJob(jobs ?? [], user?.id),
    [jobs, user?.id],
  );
}

export function TarsClockOutReconcileDialog({
  job,
  onCancel,
  onConfirm,
}: {
  job: RestorationJobDTO;
  onCancel: () => void;
  /** Called once the restoration clock is stopped and the work written up. */
  onConfirm: () => void;
}) {
  const actions = useRestorationActions(job.id);
  const describe = useDescribeRestorationAction();
  const pauseTimer = usePauseRestorationJobTimer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const current = actions.data?.results.find((a) => a.id === actions.data?.current_action_id) ?? null;
  const [draft, setDraft] = useState('');
  const description = draft || current?.description || '';
  const needsDescription = description.trim() === '';

  const label = job.items?.[0]?.sku || job.sku || job.name;
  const meta = current ? categoryMeta(current.category) : null;

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      if (current && draft.trim() && draft.trim() !== current.description) {
        await describe.mutateAsync({
          id: job.id,
          payload: { action_id: current.id, description: draft.trim() },
        });
      }
      await pauseTimer.mutateAsync({ id: job.id, reason: 'clock_out' });
      onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not stop the restoration clock.');
      setBusy(false);
    }
  };

  return (
    <Dialog open maxWidth="sm" fullWidth onClose={busy ? undefined : onCancel}>
      <DialogTitle sx={{ fontWeight: 950 }}>Restoration time is still running</DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ color: '#344258' }}>
          The clock is still on <strong>{label}</strong>. Clocking out will stop it.
        </Typography>

        {current ? (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              mt: 1.5,
              px: 1.25,
              py: 0.85,
              borderRadius: '8px',
              bgcolor: '#f6f8fa',
              border: '1px solid #e2e8f0',
              borderLeft: `4px solid ${meta?.color ?? '#94a3b8'}`,
            }}
          >
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 900, color: meta?.color, textTransform: 'uppercase' }}>
              {meta?.label}
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569' }}>
              {actionScopeLabel(current.grade)}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 900, color: '#334155' }}>
              {formatDuration(current.seconds)}
            </Typography>
          </Stack>
        ) : null}

        <Typography variant="body2" sx={{ mt: 2, mb: 0.75, color: '#65748a' }}>
          {needsDescription
            ? 'Say what you did before you go — this is the last chance to record it.'
            : 'Add anything else worth recording, or leave it as it is.'}
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={2}
          autoFocus
          disabled={busy}
          value={draft || current?.description || ''}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What did you do, and how did it go?"
        />

        <Box sx={{ minHeight: 28, mt: 0.5 }}>
          {error ? (
            <Typography variant="caption" sx={{ color: '#b3261e', fontWeight: 700 }}>
              {error}
            </Typography>
          ) : null}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button variant="outlined" disabled={busy} onClick={onCancel} sx={{ minWidth: 120, fontWeight: 800 }}>
          Keep working
        </Button>
        <Button
          variant="contained"
          disabled={busy || needsDescription}
          onClick={() => void handleConfirm()}
          sx={{ minWidth: 180, bgcolor: '#087b6f', fontWeight: 950 }}
        >
          Stop work and clock out
        </Button>
      </DialogActions>
    </Dialog>
  );
}
