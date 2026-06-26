import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
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

export interface TarsHoldSubmit extends Omit<TarsPendingInfo, 'pendingStartedAt'> {
  pendingStartedAt?: string;
  requestParts: boolean;
  requestGrade: string;
}

export interface TarsHoldDialogProps {
  open: boolean;
  title?: string;
  initial?: Partial<TarsPendingInfo>;
  /** When true, show the "also request parts" option (new hold on the bench). */
  canRequestParts?: boolean;
  gradeOptions?: string[];
  selectedGrade?: string | null;
  requesting?: boolean;
  onClose: () => void;
  onSubmit: (info: TarsHoldSubmit) => void;
}

export function TarsHoldDialog({
  open,
  title = 'Place on hold',
  initial,
  canRequestParts = false,
  gradeOptions = [],
  selectedGrade,
  requesting = false,
  onClose,
  onSubmit,
}: TarsHoldDialogProps) {
  const [reason, setReason] = useState<TarsPendingReason>('parts_needed');
  const [storageLocation, setStorageLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [requestParts, setRequestParts] = useState(false);
  const [requestGrade, setRequestGrade] = useState('');

  useEffect(() => {
    if (!open) return;
    const nextReason = initial?.reason ?? 'parts_needed';
    setReason(nextReason);
    setStorageLocation(initial?.storageLocation ?? '');
    setNotes(initial?.notes ?? '');
    setRequestParts(canRequestParts && nextReason === 'parts_needed');
    setRequestGrade(selectedGrade ?? gradeOptions[0] ?? '');
  }, [open, initial, canRequestParts, selectedGrade, gradeOptions]);

  const requestBlocked = requestParts && !requestGrade;

  const handleSubmit = () => {
    if (requestBlocked) return;
    onSubmit({
      reason,
      storageLocation: storageLocation.trim(),
      notes: notes.trim(),
      pendingStartedAt: initial?.pendingStartedAt,
      requestParts: canRequestParts && requestParts,
      requestGrade,
    });
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
            onChange={(e) => {
              const next = e.target.value as TarsPendingReason;
              setReason(next);
              if (canRequestParts) setRequestParts(next === 'parts_needed');
            }}
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

          {canRequestParts ?
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={requestParts}
                    onChange={(e) => setRequestParts(e.target.checked)}
                  />
                }
                label="Also request parts now"
              />
              {requestParts ?
                gradeOptions.length === 0 ?
                  <Alert severity="warning" sx={{ py: 0.5 }}>
                    No priced grades on this item — set grade values before requesting parts.
                  </Alert>
                : <TextField
                    select
                    fullWidth
                    size="small"
                    required
                    label="Grade option for this request"
                    helperText="The owner needs to know which option the spend is for"
                    value={requestGrade}
                    onChange={(e) => setRequestGrade(e.target.value)}
                  >
                    {gradeOptions.map((g) => (
                      <MenuItem key={g} value={g}>
                        {g}
                      </MenuItem>
                    ))}
                  </TextField>
              : null}
            </>
          : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={requestBlocked || requesting} onClick={handleSubmit}>
          {requestParts ? 'Hold & request parts' : 'Place on hold'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
