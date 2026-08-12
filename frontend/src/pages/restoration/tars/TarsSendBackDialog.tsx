/**
 * Sending an item back unfinished.
 *
 * The note is the whole point of the trip. An item that reappears in the queue
 * with no explanation just gets picked up and put down again by the next
 * person, so this asks for the one sentence that stops that happening.
 */
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

/** Reasons an item goes back, as one press instead of a sentence typed twice. */
const COMMON_REASONS = [
  'Needs prices for the other grades',
  'Not worth restoring',
  'Wrong item sent over',
  'Missing parts or accessories',
];

export function TarsSendBackDialog({
  open,
  itemLabel,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  itemLabel: string;
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
      // A fresh note each time; the last item's reason is never this one's.
      TransitionProps={{ onExited: () => setNote('') }}
    >
      <DialogTitle sx={{ fontWeight: 950 }}>Send {itemLabel} back</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: '#65748a', mb: 1.5 }}>
          It goes back to the queue with whatever you write here, so whoever picks it up next
          knows what to do differently.
        </Typography>

        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          {COMMON_REASONS.map((reason) => (
            <Button
              key={reason}
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={() => setNote(reason)}
              sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.74rem', borderColor: '#dbe3ec', color: '#475569' }}
            >
              {reason}
            </Button>
          ))}
        </Stack>

        <TextField
          fullWidth
          multiline
          minRows={3}
          autoFocus
          disabled={busy}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          label="Why is it coming back?"
          placeholder="What needs to happen before this is worth another look?"
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button variant="outlined" disabled={busy} onClick={onCancel} sx={{ minWidth: 110, fontWeight: 800 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={busy || !ready}
          onClick={() => onSubmit(note.trim())}
          sx={{ minWidth: 150, bgcolor: '#087b6f', fontWeight: 950 }}
        >
          Send back
        </Button>
      </DialogActions>
    </Dialog>
  );
}
