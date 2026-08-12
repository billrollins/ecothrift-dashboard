/**
 * Everything about a queued item that anyone is allowed to answer.
 *
 * A modal rather than inline fields, so filling in a grade never moves the card
 * behind it. No role gate: whoever is at a screen when the answer is known
 * should be able to record it.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { fmtUsd } from '../tars/tarsProfit';
import { INTENDED_DESTINATIONS } from './restorationQueueModel';

export interface QueueDetailsSubmit {
  scale?: string;
  grade_values?: Record<string, number>;
  intended_destination?: string;
  queue_note?: string;
}

export function RestorationQueueDetailsDialog({
  job,
  scales,
  busy,
  onClose,
  onSubmit,
}: {
  job: RestorationJobDTO | null;
  scales: Record<string, string[]>;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (jobId: number, payload: QueueDetailsSubmit) => Promise<void>;
}) {
  const [scale, setScale] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [destination, setDestination] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!job) return;
    setScale(job.scale ?? '');
    setDestination(job.intended_destination ?? '');
    setNote(job.queue_note ?? '');
    const next: Record<string, string> = {};
    for (const [grade, value] of Object.entries(job.grade_values ?? {})) {
      next[grade] = typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
    }
    setValues(next);
  }, [job?.id, job?.scale, job?.intended_destination, job?.queue_note, job?.grade_values]);

  const grades = useMemo(() => {
    const fromScale = scales[scale] ?? [];
    if (fromScale.length > 0) return fromScale;
    return Object.keys(values);
  }, [scales, scale, values]);

  const spread = useMemo(() => {
    const parsed = grades
      .map((g) => Number.parseFloat(values[g] ?? ''))
      .filter((n) => Number.isFinite(n));
    if (parsed.length < 2) return null;
    return Math.max(...parsed) - Math.min(...parsed);
  }, [grades, values]);

  async function handleSave() {
    if (!job) return;
    const gradeValues: Record<string, number> = {};
    for (const grade of grades) {
      const parsed = Number.parseFloat(values[grade] ?? '');
      if (Number.isFinite(parsed)) gradeValues[grade] = parsed;
    }
    await onSubmit(job.id, {
      scale,
      grade_values: gradeValues,
      intended_destination: destination,
      queue_note: note.trim(),
    });
  }

  return (
    <Dialog open={job != null} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5, fontWeight: 900 }}>
        {job?.name ?? 'Queue details'}
        <Typography sx={{ fontSize: '0.78rem', color: '#7c8899', fontWeight: 600 }}>
          {job?.items[0]?.sku ?? job?.sku ?? ''}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              select
              fullWidth
              size="small"
              label="Grade scale"
              value={scale}
              onChange={(e) => setScale(e.target.value)}
            >
              {Object.keys(scales).map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              fullWidth
              size="small"
              label="Final destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <MenuItem value="">Not decided</MenuItem>
              {INTENDED_DESTINATIONS.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 900, color: '#94a3b8', letterSpacing: 0.5 }}>
                WHAT IT SELLS FOR AT EACH GRADE
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>
                at stake {spread == null ? '—' : fmtUsd(spread)}
              </Typography>
            </Stack>
            <Stack spacing={1}>
              {grades.length === 0 ? (
                <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Choose a grade scale to price the grades.
                </Typography>
              ) : (
                grades.map((grade) => (
                  <TextField
                    key={grade}
                    fullWidth
                    size="small"
                    label={grade}
                    value={values[grade] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [grade]: e.target.value }))}
                    inputMode="decimal"
                    slotProps={{
                      input: {
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      },
                    }}
                  />
                ))
              )}
            </Stack>
          </Box>

          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            label="Note for the bench"
            placeholder="Anything the person picking this up should know"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => void handleSave()}
          sx={{ textTransform: 'none', fontWeight: 800 }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
