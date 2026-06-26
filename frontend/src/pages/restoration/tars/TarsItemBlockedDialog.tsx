import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

export type TarsBlockedLocation = 'on_bench' | 'on_pending';

interface TarsItemBlockedDialogProps {
  open: boolean;
  sku: string;
  location: TarsBlockedLocation;
  onClose: () => void;
  onGoTo: () => void;
}

const LOCATION_LABELS: Record<TarsBlockedLocation, { title: string; goLabel: string }> = {
  on_bench: { title: 'On bench', goLabel: 'Go to On Bench' },
  on_pending: { title: 'Pending', goLabel: 'Go to Pending' },
};

export function TarsItemBlockedDialog({
  open,
  sku,
  location,
  onClose,
  onGoTo,
}: TarsItemBlockedDialogProps) {
  const labels = LOCATION_LABELS[location];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Cannot add to queue</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          Item <strong>{sku}</strong> cannot be added because it is in{' '}
          <strong>{labels.title}</strong>.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onClose}>OK</Button>
        <Button variant="contained" onClick={onGoTo}>
          {labels.goLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
