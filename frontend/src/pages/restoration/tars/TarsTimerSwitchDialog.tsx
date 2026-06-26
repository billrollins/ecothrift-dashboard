import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { jobSkuLabel } from './tarsJobAdapter';
import type { TimerGuardAction } from './tarsTimerWarnings';

interface TarsTimerSwitchDialogProps {
  open: boolean;
  runningJob: RestorationJobDTO | null;
  targetJob: RestorationJobDTO | null;
  action: TimerGuardAction | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function actionLabel(action: TimerGuardAction | null): string {
  switch (action) {
    case 'checkIn':
      return 'check in to this item';
    case 'startTimer':
      return 'start the timer on this item';
    case 'hold':
      return 'place this item on hold';
    case 'done':
      return 'complete this item';
    case 'moveBack':
      return 'move this item back to queue';
    default:
      return 'continue';
  }
}

export function TarsTimerSwitchDialog({
  open,
  runningJob,
  targetJob,
  action,
  busy,
  onConfirm,
  onCancel,
}: TarsTimerSwitchDialogProps) {
  if (!runningJob || !targetJob) return null;

  const runningSku = jobSkuLabel(runningJob);
  const targetSku = jobSkuLabel(targetJob);
  const startsNewTimer = action === 'checkIn' || action === 'startTimer';

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Timer running on another item</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>
          You have a timer running on <strong>{runningSku}</strong>.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {startsNewTimer ?
            `Stop that timer and ${actionLabel(action)} (${targetSku})?`
          : `Stop the running timer before you ${actionLabel(action)} (${targetSku})?`}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onCancel} disabled={busy}>
          No
        </Button>
        <Button variant="contained" onClick={onConfirm} disabled={busy}>
          Yes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
