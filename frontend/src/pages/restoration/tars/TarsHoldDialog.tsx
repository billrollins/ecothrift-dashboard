import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useEffect, useState } from 'react';
import {
  TARS_PENDING_REASON_LABELS,
  type TarsPendingInfo,
  type TarsPendingReason,
} from './tarsWorkTypes';

const REASONS = Object.keys(TARS_PENDING_REASON_LABELS) as TarsPendingReason[];

export interface TarsHoldDialogProps {
  open: boolean;
  title?: string;
  initial?: Partial<TarsPendingInfo>;
  onClose: () => void;
  onSubmit: (info: Omit<TarsPendingInfo, 'pendingStartedAt'> & { pendingStartedAt?: string }) => void;
}

export function TarsHoldDialog({
  open,
  title = 'Place on hold',
  initial,
  onClose,
  onSubmit,
}: TarsHoldDialogProps) {
  const [reason, setReason] = useState<TarsPendingReason>('parts_needed');
  const [storageLocation, setStorageLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [expectedResumeAt, setExpectedResumeAt] = useState('');

  useEffect(() => {
    if (!open) return;
    setReason(initial?.reason ?? 'parts_needed');
    setStorageLocation(initial?.storageLocation ?? '');
    setNotes(initial?.notes ?? '');
    setExpectedResumeAt(initial?.expectedResumeAt ?? '');
  }, [open, initial]);

  const handleSubmit = () => {
    onSubmit({
      reason,
      storageLocation: storageLocation.trim(),
      notes: notes.trim(),
      expectedResumeAt: expectedResumeAt.trim(),
      pendingStartedAt: initial?.pendingStartedAt,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.25} sx={{ pt: 0.5 }}>
          <TextField
            select
            fullWidth
            size="small"
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as TarsPendingReason)}
          >
            {REASONS.map((r) => (
              <MenuItem key={r} value={r}>
                {TARS_PENDING_REASON_LABELS[r]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            size="small"
            label="Shelf / storage location"
            value={storageLocation}
            onChange={(e) => setStorageLocation(e.target.value)}
          />
          <TextField
            fullWidth
            size="small"
            label="Notes"
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <TextField
            fullWidth
            size="small"
            label="Expected resume (optional)"
            value={expectedResumeAt}
            onChange={(e) => setExpectedResumeAt(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit}>
          Place on hold
        </Button>
      </DialogActions>
    </Dialog>
  );
}
