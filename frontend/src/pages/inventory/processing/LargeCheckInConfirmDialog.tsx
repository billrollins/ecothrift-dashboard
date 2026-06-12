import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { printPhraseMatches, requiredPrintPhrase } from './largeCheckIn';

export interface LargeCheckInConfirmDialogProps {
  open: boolean;
  quantity: number;
  /** When true the confirm also prints `quantity` labels — requires typing the phrase. */
  printLabels: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation for big check-ins; typing `PRINT <qty>` gates label runs. */
export function LargeCheckInConfirmDialog({
  open,
  quantity,
  printLabels,
  loading = false,
  onCancel,
  onConfirm,
}: LargeCheckInConfirmDialogProps) {
  const [phrase, setPhrase] = useState('');

  useEffect(() => {
    if (open) setPhrase('');
  }, [open]);

  const phraseOk = !printLabels || printPhraseMatches(phrase, quantity);

  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Check in {quantity.toLocaleString()} items?</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Alert severity="warning" sx={{ py: 0.5 }}>
            You are about to check in <strong>{quantity.toLocaleString()}</strong> items
            {printLabels ? (
              <>
                {' '}and print <strong>{quantity.toLocaleString()}</strong> labels
              </>
            ) : null}
            .
          </Alert>
          {printLabels ? (
            <>
              <Typography variant="body2" color="text.secondary">
                Type <strong>{requiredPrintPhrase(quantity)}</strong> to confirm the label run.
              </Typography>
              <TextField
                autoFocus
                size="small"
                value={phrase}
                placeholder={requiredPrintPhrase(quantity)}
                onChange={(e) => setPhrase(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && phraseOk && !loading) {
                    e.preventDefault();
                    onConfirm();
                  }
                }}
                slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
              />
            </>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={printLabels ? 'warning' : 'primary'}
          disabled={loading || !phraseOk}
          onClick={onConfirm}
        >
          {printLabels ?
            `Check in ${quantity.toLocaleString()} & print`
          : `Check in ${quantity.toLocaleString()}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
