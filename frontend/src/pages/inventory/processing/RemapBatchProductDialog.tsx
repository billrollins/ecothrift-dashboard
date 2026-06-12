import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { Product } from '../../../types/inventory.types';
import { useProductSearch } from '../../../hooks/useProductSearch';
import type { CheckedInHistoryRow } from './checkedInHistory';
import { checkedInTitleText } from './checkedInHistoryDisplay';

type RemapProductMode = 'existing' | 'new';

export interface RemapBatchProductDialogProps {
  open: boolean;
  batchRow: CheckedInHistoryRow | null;
  fallbackProductTitle?: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

export function RemapBatchProductDialog({
  open,
  batchRow,
  fallbackProductTitle,
  loading,
  onClose,
  onSubmit,
}: RemapBatchProductDialogProps) {
  const [mode, setMode] = useState<RemapProductMode>('existing');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [upc, setUpc] = useState('');

  const { products, isFetching } = useProductSearch('processing-remap-batch', search, open && mode === 'existing');

  useEffect(() => {
    if (!open) return;
    setMode('existing');
    setSearch('');
    setSelectedProduct(null);
    setTitle(batchRow ? checkedInTitleText(batchRow, null) : fallbackProductTitle || '');
    setBrand(batchRow?.item.product_brand || '');
    setCategory(batchRow?.batchProductCategory || '');
    setUpc('');
  }, [open, batchRow, fallbackProductTitle]);

  const submitDisabled =
    loading
    || (mode === 'existing' && !selectedProduct)
    || (mode === 'new' && !title.trim());

  async function handleSubmit() {
    const payload: Record<string, unknown> = { product_mode: mode };
    if (mode === 'existing' && selectedProduct) {
      payload.product_id = selectedProduct.id;
    } else {
      payload.title = title.trim();
      payload.brand = brand.trim();
      payload.category = category.trim();
      payload.upc = upc.trim();
    }
    await onSubmit(payload);
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Change batch product</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Remap all {batchRow?.qty ?? 0} item(s) in this check-in batch to a different product.
          </Typography>
          <TextField select label="Product source" size="small" value={mode} onChange={(e) => setMode(e.target.value as RemapProductMode)}>
            <MenuItem value="existing">Existing product</MenuItem>
            <MenuItem value="new">New product</MenuItem>
          </TextField>
          {mode === 'existing' ?
            <Autocomplete
              options={products}
              loading={isFetching}
              value={selectedProduct}
              onChange={(_e, value) => setSelectedProduct(value)}
              inputValue={search}
              onInputChange={(_e, value) => setSearch(value)}
              getOptionLabel={(option) => `${option.product_number || option.id} · ${option.title}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => <TextField {...params} label="Search products" size="small" />}
            />
          : <>
              <TextField label="Title" size="small" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <TextField label="Brand" size="small" value={brand} onChange={(e) => setBrand(e.target.value)} />
              <TextField label="Category" size="small" value={category} onChange={(e) => setCategory(e.target.value)} />
              <TextField label="UPC" size="small" value={upc} onChange={(e) => setUpc(e.target.value)} />
            </>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" disabled={submitDisabled} onClick={() => void handleSubmit()}>
          Remap batch
        </Button>
      </DialogActions>
    </Dialog>
  );
}
