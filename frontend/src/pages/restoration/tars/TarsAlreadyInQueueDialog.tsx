import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

interface TarsAlreadyInQueueDialogProps {
  open: boolean;
  sku: string;
  stackQuantity: number;
  removePending?: boolean;
  onClose: () => void;
  onRemoveFromStack?: () => void;
}

export function TarsAlreadyInQueueDialog({
  open,
  sku,
  stackQuantity,
  removePending,
  onClose,
  onRemoveFromStack,
}: TarsAlreadyInQueueDialogProps) {
  const canRemove = stackQuantity > 1 && Boolean(onRemoveFromStack);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Already in queue</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          Item <strong>{sku}</strong> is already in the Queue.
        </Typography>
        {canRemove ?
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This item is part of a {stackQuantity}-item stack. Remove it to work as a single item.
          </Typography>
        : null}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        {canRemove ?
          <Button color="warning" disabled={removePending} onClick={onRemoveFromStack}>
            Remove from stack
          </Button>
        : null}
        <Button variant="contained" onClick={onClose} autoFocus>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
