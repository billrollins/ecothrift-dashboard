/**
 * Sending a finished item back to the Queue before Processing takes it in.
 *
 * This undoes the finish. The note is required so the next person knows why.
 */
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { JobNotesSlot } from '../../../components/notes/JobNotesSlot';

export function RestorationReopenDialog({
  open,
  itemLabel,
  jobId,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  itemLabel: string;
  jobId?: number | null;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  const ready = note.trim() !== '';

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      onClose={busy ? undefined : onCancel}
      TransitionProps={{
        onExited: () => setNote(''),
      }}
    >
      <DialogTitle sx={{ fontWeight: 950 }}>Back to Queue: {itemLabel}</DialogTitle>
      <DialogContent>
        <JobNotesSlot jobId={open ? jobId ?? null : null} />
        <Typography variant="body2" sx={{ color: '#65748a', mb: 1.5, mt: 1.25, minHeight: 40 }}>
          This discards the final grade, where the item went, and the value it earned. Write why.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          label="Why"
          value={note}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          disabled={!ready || busy}
          onClick={() => onSubmit(note.trim())}
        >
          Back to Queue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
