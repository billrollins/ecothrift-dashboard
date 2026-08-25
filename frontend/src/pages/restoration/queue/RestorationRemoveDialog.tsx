/**
 * Send this item back to Processing's FROM desk — it leaves restoration.
 *
 * Untouched needs a reason. Worked needs the grade it actually reached. Notes
 * are optional either way. Confirm is the submit: this is hard to take back.
 */
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useState } from 'react';
import type {
  RestorationJobDTO,
  RestorationJobReturnPayload,
  RestorationReturnDispositionType,
  RestorationUntouchedReason,
} from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';
import { dispatchJobSku } from './queueDispatch';

const UNTOUCHED_REASONS: { id: RestorationUntouchedReason; label: string }[] = [
  { id: 'recalled', label: 'Recalled' },
  { id: 'not_worth_it', label: 'Not worth it from a preliminary look' },
  { id: 'other', label: 'Other' },
];

const FIELD_SLOT = 56;

export function RestorationRemoveDialog({
  open,
  job,
  scales,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  job: RestorationJobDTO | null;
  scales: Record<string, string[]>;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (payload: RestorationJobReturnPayload) => void;
}) {
  const [family, setFamily] = useState<RestorationReturnDispositionType>('untouched');
  const [reason, setReason] = useState<RestorationUntouchedReason | ''>('');
  const [scale, setScale] = useState('');
  const [grade, setGrade] = useState('');
  const [notes, setNotes] = useState('');

  const itemLabel = job ? dispatchJobSku(job) : 'this item';
  const scaleNames = Object.keys(scales);
  const gradeOptions = (scale && scales[scale]) || Object.keys(job?.grade_values ?? {});
  const untouched = family === 'untouched';
  const ready = untouched ? reason !== '' : scale.trim() !== '' && grade.trim() !== '';

  function reset() {
    setFamily('untouched');
    setReason('');
    setScale(job?.scale || '');
    setGrade('');
    setNotes('');
  }

  function handleSubmit() {
    if (!ready) return;
    if (untouched) {
      onSubmit({
        disposition_type: 'untouched',
        reason: reason as RestorationUntouchedReason,
        notes: notes.trim(),
      });
      return;
    }
    onSubmit({
      disposition_type: 'tars_completed',
      scale: scale.trim(),
      grade: grade.trim(),
      notes: notes.trim(),
    });
  }

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      onClose={busy ? undefined : onCancel}
      TransitionProps={{
        onEnter: () => {
          setFamily('untouched');
          setReason('');
          setScale(job?.scale || '');
          setGrade('');
          setNotes('');
        },
        onExited: reset,
      }}
      PaperProps={{
        sx: { borderRadius: '12px' },
      }}
    >
      <DialogTitle
        component="div"
        sx={{
          px: 3,
          pt: 2.5,
          pb: 0.75,
          bgcolor: 'transparent',
        }}
      >
        <Typography sx={{ fontWeight: 950, fontSize: '1.15rem', color: studio.ink, lineHeight: 1.25 }}>
          Remove from restoration
        </Typography>
        <Typography
          sx={{
            mt: 0.4,
            fontFamily: 'monospace',
            fontWeight: 800,
            fontSize: '0.8rem',
            color: studio.inkMuted,
          }}
        >
          {itemLabel}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pb: 0.5, '&&': { pt: 1.25 } }}>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: studio.inkMuted, lineHeight: 1.45 }}>
            This item leaves restoration for Processing FROM. Restoration cannot pull it back.
          </Typography>

          <Box>
            <FieldLabel>How it left</FieldLabel>
            <Stack direction="row" spacing={1}>
              <FamilyChoice
                label="Untouched"
                selected={untouched}
                disabled={busy}
                onClick={() => setFamily('untouched')}
              />
              <FamilyChoice
                label="Worked"
                selected={!untouched}
                disabled={busy}
                onClick={() => setFamily('tars_completed')}
              />
            </Stack>
          </Box>

          <Stack spacing={1.5}>
            <Box sx={{ minHeight: FIELD_SLOT, display: 'flex', alignItems: 'flex-start' }}>
              {untouched ? (
                <TextField
                  select
                  fullWidth
                  size="small"
                  required
                  disabled={busy}
                  label="Why is it coming back untouched?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as RestorationUntouchedReason)}
                >
                  {UNTOUCHED_REASONS.map((entry) => (
                    <MenuItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField
                  select
                  fullWidth
                  size="small"
                  required
                  disabled={busy || scaleNames.length === 0}
                  label="Achieved scale"
                  value={scale}
                  onChange={(e) => {
                    setScale(e.target.value);
                    setGrade('');
                  }}
                >
                  {scaleNames.map((name) => (
                    <MenuItem key={name} value={name}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Box>
            <Box sx={{ minHeight: FIELD_SLOT, display: 'flex', alignItems: 'flex-start' }}>
              {untouched ? (
                <Typography variant="body2" sx={{ color: studio.inkFaint, pt: 0.75, lineHeight: 1.4 }}>
                  No work was done. Processing will treat it as untouched.
                </Typography>
              ) : (
                <TextField
                  select
                  fullWidth
                  size="small"
                  required
                  disabled={busy || gradeOptions.length === 0}
                  label="Achieved grade"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                >
                  {gradeOptions.map((name) => (
                    <MenuItem key={name} value={name}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Box>
          </Stack>

          <TextField
            fullWidth
            size="small"
            disabled={busy}
            label="Notes"
            placeholder="Anything Processing should know"
            multiline
            minRows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pt: 1.5, pb: 2.25, gap: 1 }}>
        <Button
          variant="outlined"
          disabled={busy}
          onClick={onCancel}
          sx={{ minWidth: 96, fontWeight: 800, textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={busy || !ready}
          onClick={handleSubmit}
          sx={{ minWidth: 120, fontWeight: 900, textTransform: 'none' }}
        >
          Remove
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Typography
      sx={{
        mb: 0.75,
        fontSize: '0.62rem',
        fontWeight: 800,
        letterSpacing: 0.7,
        textTransform: 'uppercase',
        color: studio.inkLabel,
      }}
    >
      {children}
    </Typography>
  );
}

function FamilyChoice({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      fullWidth
      disabled={disabled}
      onClick={onClick}
      sx={{
        height: 36,
        textTransform: 'none',
        fontWeight: 800,
        fontSize: '0.85rem',
        borderRadius: '8px',
        border: '1px solid',
        borderColor: selected ? studio.accentDark : studio.panelBorder,
        bgcolor: selected ? studio.accentDark : studio.panel,
        color: selected ? '#ffffff' : studio.ink,
        '&:hover': {
          bgcolor: selected ? studio.accentDark : studio.canvas,
          borderColor: selected ? studio.accentDark : studio.accent,
        },
      }}
    >
      {label}
    </Button>
  );
}
