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
import { remapItemProduct } from '../../../api/inventory.api';
import { ProductSearchAutocomplete } from '../../../components/inventory/ProductSearchAutocomplete';
import type { Product } from '../../../types/inventory.types';

export interface ItemProductRemapDialogProps {
  open: boolean;
  itemId: number;
  currentProductTitle?: string;
  checkInId?: number | null;
  onClose: () => void;
  onRemapped?: (productId: number) => void;
}

export function ItemProductRemapDialog({
  open,
  itemId,
  currentProductTitle,
  checkInId,
  onClose,
  onRemapped,
}: ItemProductRemapDialogProps) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [selected, setSelected] = useState<Product | null>(null);

  const remapMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select a product');
      return remapItemProduct(itemId, {
        product_mode: 'existing',
        product_id: selected.id,
      });
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      void queryClient.invalidateQueries({ queryKey: ['item-check-ins'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      enqueueSnackbar('Item product corrected', { variant: 'success' });
      onRemapped?.(res.data.product_id);
      setSelected(null);
      onClose();
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not change product', { variant: 'error' });
    },
  });

  return (
    <Dialog open={open} onClose={remapMutation.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Correct item product</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This item will point to the selected product instead of the check-in default.
          {checkInId ? ` Check-in #${checkInId} is unchanged unless all its items share one product.` : ''}
          {currentProductTitle ? ` Currently: ${currentProductTitle}.` : ''}
        </Typography>
        <ProductSearchAutocomplete
          scope={`item-remap-${itemId}`}
          enabled={open}
          label="Correct product"
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
          Apply correction
        </Button>
      </DialogActions>
    </Dialog>
  );
}
