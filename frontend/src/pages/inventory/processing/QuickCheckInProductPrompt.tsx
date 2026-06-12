import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddCircleOutline from '@mui/icons-material/AddCircleOutline';
import Search from '@mui/icons-material/Search';
import { useEffect, useState } from 'react';
import { useProductSearch } from '../../../hooks/useProductSearch';
import type { Product } from '../../../types/inventory.types';

export interface QuickCheckInProductPromptProps {
  open: boolean;
  /** Row title shown so staff know what the new product would be created from. */
  rowTitle: string;
  loading: boolean;
  onClose: () => void;
  /** Create a new catalog Product from the row's fields and check in. */
  onNewProduct: () => void;
  /** Check in against a picked existing catalog Product. */
  onExistingProduct: (product: Product) => void;
  /** Bail out to the full Detailed check-in dialog. */
  onDetailed: () => void;
}

/**
 * P8c: quick check-in on a row with NO decided product and NO prior batch must ask
 * explicitly — new product from the row, or an existing catalog product. One question,
 * two big buttons; search only appears after picking "existing".
 */
export function QuickCheckInProductPrompt({
  open,
  rowTitle,
  loading,
  onClose,
  onNewProduct,
  onExistingProduct,
  onDetailed,
}: QuickCheckInProductPromptProps) {
  const [pickExisting, setPickExisting] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const { products, isFetching } = useProductSearch('quick-check-in-prompt', search, open && pickExisting);

  useEffect(() => {
    if (!open) return;
    setPickExisting(false);
    setSearch('');
    setSelected(null);
  }, [open]);

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>No product decided for this row yet</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            This is the first check-in on this row and no catalog product is linked. Pick how to identify it —
            later check-ins on this row will reuse your choice automatically.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button
              fullWidth
              size="large"
              variant={pickExisting ? 'outlined' : 'contained'}
              color="success"
              startIcon={<AddCircleOutline />}
              disabled={loading}
              onClick={onNewProduct}
              sx={{ textTransform: 'none', fontWeight: 700, justifyContent: 'flex-start' }}
            >
              New product from this row
            </Button>
            <Button
              fullWidth
              size="large"
              variant={pickExisting ? 'contained' : 'outlined'}
              startIcon={<Search />}
              disabled={loading}
              onClick={() => setPickExisting(true)}
              sx={{ textTransform: 'none', fontWeight: 700, justifyContent: 'flex-start' }}
            >
              Existing catalog product…
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap title={rowTitle}>
            Row: {rowTitle}
          </Typography>
          {pickExisting ? (
            <Autocomplete
              size="small"
              autoFocus
              options={products}
              loading={isFetching}
              value={selected}
              onChange={(_e, value) => {
                setSelected(value);
                if (value) onExistingProduct(value);
              }}
              inputValue={search}
              onInputChange={(_e, value) => setSearch(value)}
              getOptionLabel={(option) => `${option.product_number || option.id} · ${option.title}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField {...params} autoFocus label="Search products" placeholder="Title, number, UPC…" />
              )}
            />
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onDetailed} disabled={loading}>
          Detailed check-in…
        </Button>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
