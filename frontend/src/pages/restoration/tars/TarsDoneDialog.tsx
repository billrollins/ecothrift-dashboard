import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Pause from '@mui/icons-material/Pause';
import { useEffect, useMemo, useState } from 'react';
import type {
  RestorationJobDTO,
  RestorationJobDonePayload,
  RestorationBenchDisposition,
} from '../../../types/inventory.types';
import type { TarsWorkEvaluation } from './tarsWorkTypes';
import { formatElapsed } from './tarsJobAdapter';
import {
  doneTimeWarning,
  doneTimeWarningMessage,
  type DoneTimeWarningKind,
} from './tarsTimerWarnings';

const DESTINATIONS: { value: RestorationBenchDisposition; label: string }[] = [
  { value: 'processing', label: 'Processing' },
  { value: 'storage', label: 'Storage' },
  { value: 'salvage', label: 'Salvage' },
  { value: 'online_sales', label: 'Online Sales' },
];

interface TarsDoneDialogProps {
  open: boolean;
  job: RestorationJobDTO | null;
  evaluation: TarsWorkEvaluation | null;
  onClose: () => void;
  onSubmit: (payload: RestorationJobDonePayload) => void;
  onTimerStart: () => void;
  onTimerPause: () => void;
  timerBusy?: boolean;
}

export function TarsDoneDialog({
  open,
  job,
  evaluation,
  onClose,
  onSubmit,
  onTimerStart,
  onTimerPause,
  timerBusy,
}: TarsDoneDialogProps) {
  const [destination, setDestination] = useState<RestorationBenchDisposition>('processing');
  const [finalGrade, setFinalGrade] = useState('');
  const [notes, setNotes] = useState('');
  const [spentHours, setSpentHours] = useState('');
  const [spentParts, setSpentParts] = useState('');
  const [timeWarning, setTimeWarning] = useState<DoneTimeWarningKind>(null);
  const [overrideNote, setOverrideNote] = useState('');

  const gradeOptions = useMemo(
    () => Object.keys(job?.grade_values ?? {}).filter((g) => (job?.grade_values[g] ?? 0) > 0),
    [job],
  );

  const defaultHours = job?.elapsed_hours ?? '0';
  const defaultParts = useMemo(() => {
    const selected = evaluation?.directions.find((d) => d.isSelected);
    if (selected?.partsCost != null) return String(selected.partsCost);
    return '0';
  }, [evaluation]);

  useEffect(() => {
    if (!open || !job) return;
    setDestination('processing');
    setFinalGrade(
      evaluation?.selectedGrade
      ?? evaluation?.recommendedGrade
      ?? gradeOptions[0]
      ?? '',
    );
    setNotes('');
    setSpentHours(defaultHours);
    setSpentParts(defaultParts);
    setTimeWarning(null);
    setOverrideNote('');
  }, [open, job, evaluation, gradeOptions, defaultHours, defaultParts]);

  if (!job) return null;

  const elapsedLabel = formatElapsed(job.elapsed_seconds ?? 0);

  const buildPayload = (): RestorationJobDonePayload => {
    const baseNotes = notes.trim();
    const override = overrideNote.trim();
    const combinedNotes =
      override ?
        [baseNotes, `[Time override: ${override}]`].filter(Boolean).join('\n')
      : baseNotes;
    return {
      destination,
      final_grade: finalGrade.trim(),
      notes: combinedNotes,
      spent_hours: spentHours.trim() || defaultHours,
      spent_parts_cost: spentParts.trim() || defaultParts,
    };
  };

  const handleSubmit = () => {
    if (!finalGrade.trim()) return;
    const warning = doneTimeWarning(spentHours.trim() || defaultHours);
    if (warning && !overrideNote.trim()) {
      setTimeWarning(warning);
      return;
    }
    onSubmit(buildPayload());
    onClose();
  };

  const confirmTimeOverride = () => {
    if (!overrideNote.trim()) return;
    onSubmit(buildPayload());
    setTimeWarning(null);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Done — disposition</DialogTitle>
        <DialogContent>
          <Stack spacing={1.25} sx={{ pt: 0.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={800} display="block">
                  Active time
                </Typography>
                <Typography variant="h6" fontFamily="monospace" fontWeight={900}>
                  {elapsedLabel}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={job.timer_is_running ? <Pause /> : <PlayArrow />}
                disabled={timerBusy}
                onClick={() => (job.timer_is_running ? onTimerPause() : onTimerStart())}
              >
                {job.timer_is_running ? 'Pause for break' : 'Resume timer'}
              </Button>
            </Stack>

            <TextField
              select
              fullWidth
              size="small"
              label="Destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value as RestorationBenchDisposition)}
            >
              {DESTINATIONS.map((d) => (
                <MenuItem key={d.value} value={d.value}>
                  {d.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              fullWidth
              size="small"
              required
              label="Final grade"
              value={finalGrade}
              onChange={(e) => setFinalGrade(e.target.value)}
            >
              {gradeOptions.map((g) => (
                <MenuItem key={g} value={g}>
                  {g}
                </MenuItem>
              ))}
            </TextField>

            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="Spent hours"
                type="number"
                inputProps={{ min: 0, step: 0.01 }}
                value={spentHours}
                onChange={(e) => setSpentHours(e.target.value)}
                helperText={`Timer default: ${defaultHours}h`}
              />
              <TextField
                fullWidth
                size="small"
                label="Spent parts $"
                type="number"
                inputProps={{ min: 0, step: 0.01 }}
                value={spentParts}
                onChange={(e) => setSpentParts(e.target.value)}
                helperText={`Eval default: $${defaultParts}`}
              />
            </Stack>

            <TextField
              fullWidth
              size="small"
              label="Notes"
              multiline
              minRows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" disabled={!finalGrade.trim()} onClick={handleSubmit}>
            Complete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={timeWarning != null} onClose={() => setTimeWarning(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          {timeWarning === 'high' ? 'Unusually high bench time' : 'Very low bench time'}
        </DialogTitle>
        <DialogContent>
          <Alert severity={timeWarning === 'high' ? 'warning' : 'info'} sx={{ mb: 1.5 }}>
            {doneTimeWarningMessage(timeWarning)}
          </Alert>
          <TextField
            fullWidth
            size="small"
            required
            label="Override note"
            placeholder="Explain why this time is correct"
            value={overrideNote}
            onChange={(e) => setOverrideNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button onClick={() => setTimeWarning(null)}>Go back</Button>
          <Button variant="contained" disabled={!overrideNote.trim()} onClick={confirmTimeOverride}>
            Override and complete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
