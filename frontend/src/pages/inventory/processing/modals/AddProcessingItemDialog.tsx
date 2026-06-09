import {
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { getProducts } from '../../../../api/inventory.api';
import type { Product } from '../../../../types/inventory.types';

const CONDITION_OPTIONS = ['new', 'like_new', 'very_good', 'good', 'fair', 'salvage', 'unknown'];

export type ProductPickMode = 'new' | 'existing';

export interface AddProcessingItemDialogProps {
  open: boolean;
  orderId: number;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void | Promise<void>;
}

export function AddProcessingItemDialog({
  open,
  loading,
  onClose,
  onSubmit,
}: AddProcessingItemDialogProps) {
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('Generic');
  const [model, setModel] = useState('');
  const [upc, setUpc] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [retail, setRetail] = useState('');
  const [condition, setCondition] = useState('unknown');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [productMode, setProductMode] = useState<ProductPickMode>('new');
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const { data: productsPage, isFetching: productsLoading } = useQuery({
    queryKey: ['products', 'processing-add', productSearch],
    queryFn: async () => {
      const { data } = await getProducts({
        search: productSearch.trim() || undefined,
        page_size: 25,
      });
      return data;
    },
    enabled: open && productMode === 'existing',
    staleTime: 30_000,
  });

  const productOptions = useMemo(() => productsPage?.results ?? [], [productsPage?.results]);

  function resetForm() {
    setTitle('');
    setBrand('Generic');
    setModel('');
    setUpc('');
    setCategory('');
    setPrice('');
    setRetail('');
    setCondition('unknown');
    setNotes('');
    setQuantity('1');
    setProductMode('new');
    setProductSearch('');
    setSelectedProduct(null);
  }

  async function handleSubmit() {
    const qty = Number.parseInt(quantity, 10) || 1;
    const payload: Record<string, unknown> = {
      title: title.trim(),
      brand,
      model,
      upc,
      category,
      price: price || undefined,
      retail: retail || undefined,
      unit_retail: retail || undefined,
      condition,
      notes,
      quantity: qty,
      dispatch: 'on_shelf',
      product_mode: productMode === 'existing' ? 'existing' : 'new',
    };
    if (productMode === 'existing') {
      if (!selectedProduct) return;
      payload.product_id = selectedProduct.id;
    }
    await onSubmit(payload);
    resetForm();
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add item (no manifest line)</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Creates a Product and checked-in Item on this order, then adds an &quot;Added&quot; row to the processing
          queue.
        </Typography>
        <Stack spacing={1.5}>
          <TextField
            select
            label="Product"
            size="small"
            value={productMode}
            onChange={(e) => {
              setProductMode(e.target.value as ProductPickMode);
              setSelectedProduct(null);
            }}
            fullWidth
          >
            <MenuItem value="new">Create new product</MenuItem>
            <MenuItem value="existing">Use existing product</MenuItem>
          </TextField>

          {productMode === 'existing' ?
            <Autocomplete
              size="small"
              options={productOptions}
              loading={productsLoading}
              value={selectedProduct}
              onChange={(_e, v) => {
                setSelectedProduct(v);
                if (v) {
                  setTitle(v.title);
                  setBrand(v.brand || 'Generic');
                  setModel(v.model || '');
                  setUpc(v.upc || '');
                  setCategory(v.category || '');
                }
              }}
              onInputChange={(_e, v) => setProductSearch(v)}
              getOptionLabel={(o) => `${o.product_number ?? o.id} — ${o.title}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField {...params} label="Search catalog product" placeholder="Title, number, UPC…" />
              )}
            />
          : null}

          <TextField label="Title" size="small" required value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
          <TextField label="Brand" size="small" value={brand} onChange={(e) => setBrand(e.target.value)} fullWidth />
          <TextField label="Model" size="small" value={model} onChange={(e) => setModel(e.target.value)} fullWidth />
          <TextField label="UPC" size="small" value={upc} onChange={(e) => setUpc(e.target.value)} fullWidth />
          <TextField label="Category" size="small" value={category} onChange={(e) => setCategory(e.target.value)} fullWidth />
          <TextField label="Shelf price" size="small" value={price} onChange={(e) => setPrice(e.target.value)} fullWidth />
          <TextField label="Unit retail" size="small" value={retail} onChange={(e) => setRetail(e.target.value)} fullWidth />
          <TextField select label="Condition" size="small" value={condition} onChange={(e) => setCondition(e.target.value)} fullWidth>
            {CONDITION_OPTIONS.map((c) => (
              <MenuItem key={c} value={c}>
                {c.replace(/_/g, ' ')}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Quantity"
            size="small"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            slotProps={{ htmlInput: { min: 1, max: 500 } }}
            fullWidth
          />
          <TextField label="Notes" size="small" multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={loading || !title.trim() || (productMode === 'existing' && !selectedProduct)}
          onClick={() => void handleSubmit()}
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
