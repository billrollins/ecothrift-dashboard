import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { createModificationRequest } from '../../api/hr.api';
import type { TimeEntry } from '../../types/hr.types';

export function TimeChangeDialog({
  entry,
  onClose,
}: {
  entry: TimeEntry | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
  const { enqueueSnackbar } = useSnackbar();
  const [form, setForm] = useState({
    requested_clock_in: '',
    requested_clock_out: '',
    requested_break_minutes: '',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setForm({
      requested_clock_in: entry.clock_in ? format(parseISO(entry.clock_in), "yyyy-MM-dd'T'HH:mm") : '',
      requested_clock_out: entry.clock_out ? format(parseISO(entry.clock_out), "yyyy-MM-dd'T'HH:mm") : '',
      requested_break_minutes: String(entry.break_minutes ?? 0),
      reason: '',
    });
  }, [entry]);

  async function submit() {
    if (!entry || !form.reason.trim()) {
      enqueueSnackbar('Reason is required', { variant: 'warning' });
      return;
    }
    setSubmitting(true);
    try {
      await createModificationRequest({
        time_entry: entry.id,
        requested_clock_in: form.requested_clock_in || null,
        requested_clock_out: form.requested_clock_out || null,
        requested_break_minutes: form.requested_break_minutes
          ? parseInt(form.requested_break_minutes, 10)
          : null,
        reason: form.reason.trim(),
      });
      enqueueSnackbar('Modification request submitted', { variant: 'success' });
      onClose();
    } catch {
      enqueueSnackbar('Failed to submit request', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={Boolean(entry)}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      sx={isPhone ? { '& .MuiDialog-container': { alignItems: 'flex-end' } } : undefined}
      slotProps={{
        paper: isPhone
          ? { sx: { m: 0, mt: 'auto', borderRadius: '16px 16px 0 0', width: '100%' } }
          : undefined,
      }}
    >
      <DialogTitle>Request time change</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Requested clock in"
            type="datetime-local"
            value={form.requested_clock_in}
            onChange={(e) => setForm((f) => ({ ...f, requested_clock_in: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
          <TextField
            label="Requested clock out"
            type="datetime-local"
            value={form.requested_clock_out}
            onChange={(e) => setForm((f) => ({ ...f, requested_clock_out: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
          <TextField
            label="Break minutes"
            type="number"
            value={form.requested_break_minutes}
            onChange={(e) => setForm((f) => ({ ...f, requested_break_minutes: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Reason"
            required
            multiline
            minRows={3}
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={submitting}>
          Submit request
        </Button>
      </DialogActions>
    </Dialog>
  );
}
