import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { processingRemapItemCheckInProduct } from '../../../api/inventory.api';
import { ProductSearchAutocomplete } from '../../../components/inventory/ProductSearchAutocomplete';
import type { Product } from '../../../types/inventory.types';

export interface CheckInRemapDialogProps {
  open: boolean;
  orderId: number;
  checkInId: number;
  currentProductTitle?: string;
  onClose: () => void;
  onRemapped?: (productId: number) => void;
}

export function CheckInRemapDialog({
  open,
  orderId,
  checkInId,
  currentProductTitle,
  onClose,
  onRemapped,
}: CheckInRemapDialogProps) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [selected, setSelected] = useState<Product | null>(null);

  const remapMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select a product');
      return processingRemapItemCheckInProduct(orderId, checkInId, {
        product_mode: 'existing',
        product_id: selected.id,
      });
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['item-check-ins'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      enqueueSnackbar('Check-in remapped to new product', { variant: 'success' });
      onRemapped?.(res.data.product_id);
      setSelected(null);
      onClose();
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not remap check-in', { variant: 'error' });
    },
  });

  return (
    <Dialog open={open} onClose={remapMutation.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Remap check-in product</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          All items in check-in #{checkInId} will point to the selected product.
          {currentProductTitle ? ` Currently: ${currentProductTitle}.` : ''}
        </Typography>
        <ProductSearchAutocomplete
          scope={`checkin-remap-${checkInId}`}
          enabled={open}
          label="New product"
          value={selected}
          onSelect={setSelected}
          helperText=""
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={remapMutation.isPending}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!selected || remapMutation.isPending}
          onClick={() => remapMutation.mutate()}
        >
          Remap
        </Button>
      </DialogActions>
    </Dialog>
  );
}
