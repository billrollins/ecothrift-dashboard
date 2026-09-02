/**
 * Sending an item back unfinished.
 *
 * From the bench this is not a hold and not a kick to Processing. It means
 * you are not ready to do this yet. Holding has its own reasons.
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
import { JobNotesSlot } from '../../../components/notes/JobNotesSlot';
import { BENCH_SEND_BACK, benchSendBackReady, type BenchSendBackReason } from './sendBackReasons';

const HOLDING_REASONS = [
  'Parts arrived',
  'Decided not to repair',
  'Someone else should take this',
];

export type SendBackSubmit = {
  note: string;
  reason?: BenchSendBackReason;
};

export function TarsSendBackDialog({
  open,
  itemLabel,
  from = 'bench',
  jobId,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  itemLabel: string;
  /** Holding offers different quick reasons than the bench. */
  from?: 'bench' | 'holding';
  jobId?: number | null;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (result: SendBackSubmit) => void;
}) {
  const [note, setNote] = useState('');
  const [reason, setReason] = useState<BenchSendBackReason | null>(null);
  const fromBench = from === 'bench';
  const selected = BENCH_SEND_BACK.find((item) => item.id === reason) ?? null;
  const ready = fromBench ? benchSendBackReady(reason, note) : note.trim() !== '';
  const noteHelper = fromBench
    ? (selected?.hint ?? 'Pick why you are not ready.')
    : 'Whoever picks it up next needs this sentence.';

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      onClose={busy ? undefined : onCancel}
      TransitionProps={{
        onExited: () => {
          setNote('');
          setReason(null);
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 950 }}>Back to Queue: {itemLabel}</DialogTitle>
      <DialogContent>
        <JobNotesSlot jobId={open ? jobId ?? null : null} />
        <Typography variant="body2" sx={{ color: '#65748a', mb: 1.5, mt: 1.25, minHeight: 64 }}>
          {fromBench
            ? 'Not a hold, and not a finish. The item goes back to the queue because you are not ready to do this yet. What you write is added to the item note as {Sent Back to Queue} - it does not replace it.'
            : 'It goes back to the queue. What you write is added to the item note as {Sent Back to Queue} - it does not replace it.'}
        </Typography>

        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          {fromBench
            ? BENCH_SEND_BACK.map((item) => {
                const active = reason === item.id;
                return (
                  <Button
                    key={item.id}
                    size="small"
                    variant={active ? 'contained' : 'outlined'}
                    disabled={busy}
                    onClick={() => setReason(item.id)}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 800,
                      fontSize: '0.74rem',
                      borderColor: '#dbe3ec',
                      color: active ? '#fff' : '#475569',
                      bgcolor: active ? '#087b6f' : undefined,
                      '&:hover': { bgcolor: active ? '#0a6b61' : undefined },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })
            : HOLDING_REASONS.map((label) => (
                <Button
                  key={label}
                  size="small"
                  variant="outlined"
                  disabled={busy}
                  onClick={() => setNote(label)}
                  sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.74rem', borderColor: '#dbe3ec', color: '#475569' }}
                >
                  {label}
                </Button>
              ))}
        </Stack>

        <TextField
          fullWidth
          multiline
          minRows={3}
          autoFocus={!fromBench}
          disabled={busy}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required={Boolean(selected?.noteRequired)}
          label={fromBench ? 'Note' : 'Why is it coming back?'}
          placeholder={
            fromBench
              ? selected?.noteRequired
                ? 'What does Processing need to know?'
                : 'Optional.'
              : 'What needs to happen before this is worth another look?'
          }
          helperText={noteHelper}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button variant="outlined" disabled={busy} onClick={onCancel} sx={{ minWidth: 110, fontWeight: 800 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={busy || !ready}
          onClick={() =>
            onSubmit({
              note: note.trim(),
              reason: fromBench ? (reason ?? undefined) : undefined,
            })
          }
          sx={{ minWidth: 150, bgcolor: '#087b6f', fontWeight: 950 }}
        >
          Back to Queue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
