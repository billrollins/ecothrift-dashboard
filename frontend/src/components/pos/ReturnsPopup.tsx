import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';

/** The share of what was paid that a 3-day return gives back, as Thrift+ credit (rulebook W3: 80%). */
export const RETURN_CREDIT_PERCENT = 80;

/** "Thu Oct 23" from the server's ISO date, or '' when there is none. */
export function returnsThrough(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'EEE MMM d');
  } catch {
    return '';
  }
}

/**
 * After a Thrift+ member's sale with a 3-day-return item (owner 2026-10-20): a popup the cashier taps through, so the
 * member hears the last day and what a return gives. The date is the server's (``returns_until``, the sale day + 3);
 * the closed-days note comes from the server too.
 */
export default function ReturnsPopup({
  until, note, onClose,
}: {
  until: string | null;
  note?: string;
  onClose: () => void;
}) {
  const through = returnsThrough(until);
  return (
    <Dialog
      open={Boolean(through)}
      onClose={(_, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return; // the cashier must tap through
      }}
      disableEscapeKeyDown
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle sx={{ fontWeight: 800 }}>Tell the customer</DialogTitle>
      <DialogContent data-testid="returns-popup">
        <Typography variant="h5" sx={{ lineHeight: 1.35 }}>
          Say: Returns are valid through <b data-testid="returns-popup-date">{through}</b> and are{' '}
          <b>{RETURN_CREDIT_PERCENT}% store credit</b>.
        </Typography>
        {note ? <Alert severity="warning" sx={{ mt: 2 }} data-testid="returns-popup-note">{note}</Alert> : null}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button variant="contained" size="large" fullWidth autoFocus onClick={onClose} sx={{ minHeight: 56, fontWeight: 800 }}>
          I said it
        </Button>
      </DialogActions>
    </Dialog>
  );
}
