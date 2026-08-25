import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { JobNotesSlot } from '../../../components/notes/JobNotesSlot';

export function TarsRejectDialog({
  open,
  itemLabel,
  busy,
  jobId,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  itemLabel: string;
  jobId?: number | null;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const ready = reason.trim() !== '';

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      onClose={busy ? undefined : onCancel}
      TransitionProps={{
        onExited: () => setReason(''),
      }}
    >
      <DialogTitle sx={{ fontWeight: 950 }}>Reject: {itemLabel}</DialogTitle>
      <DialogContent>
        <JobNotesSlot jobId={open ? jobId ?? null : null} />
        <TextField
          autoFocus
          fullWidth
          size="small"
          required
          label="Why"
          multiline
          minRows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          helperText="Sends the item to Processing as rejected. No restoration attempted."
          sx={{ mt: 1.25 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          disabled={!ready || busy}
          onClick={() => onSubmit(reason.trim())}
        >
          Reject
        </Button>
      </DialogActions>
    </Dialog>
  );
}
