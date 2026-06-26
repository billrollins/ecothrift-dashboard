import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

interface TarsNeedsPricesDialogProps {
  open: boolean;
  sku: string;
  onClose: () => void;
}

export function TarsNeedsPricesDialog({ open, sku, onClose }: TarsNeedsPricesDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Prices required</DialogTitle>
      <DialogContent>
        <Typography variant="body2" gutterBottom>
          Item <strong>{sku}</strong> still needs prices from the processor before starting work.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Please have a processor add grade values on this queue item, then scan the tag at TARS to move
          it to the bench.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button variant="contained" onClick={onClose} autoFocus>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
