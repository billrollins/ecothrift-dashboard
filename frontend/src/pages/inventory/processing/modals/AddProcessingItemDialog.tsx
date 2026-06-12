import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import ItemForm, { ITEM_DRAWER_FORM_ID } from '../../../../components/inventory/ItemForm';

export interface AddProcessingItemDialogProps {
  open: boolean;
  orderId: number;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void | Promise<void>;
}

/**
 * P8e: the workspace "Add unmanifested item" hosts the EXACT same form as the Items
 * page (ItemForm — AI suggest, taxonomy category, validation, qty-aware). Submission
 * routes through the page's processing-add-item pipeline so the queue gets its
 * workspace patch, labels print, and the new Added row opens — no refetch lag.
 */
export function AddProcessingItemDialog({
  open,
  orderId,
  loading,
  onClose,
  onSubmit,
}: AddProcessingItemDialogProps) {
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        Add item (no manifest line)
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Creates checked-in unit(s) on this order plus an Added row in the processing queue.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <ItemForm
          mode="create"
          defaultPurchaseOrderId={orderId}
          lockPurchaseOrder
          submitOverride={async (payload) => {
            // find-or-create product from the fields (same resolution as the Items page).
            await onSubmit({ ...payload, product_mode: 'edit' });
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          type="submit"
          form={ITEM_DRAWER_FORM_ID}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
