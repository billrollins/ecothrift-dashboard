/**
 * Edit category (Bill, 2026-10-28): a product's category › subcategory with an Edit button. The dialog picks a
 * category, then one of its subcategories, from the taxonomy (`.ai/extended/product-taxonomy.md`, the same lists
 * Add item uses) and saves them by hand. Sits in the Product window's header and on the Item window's Overview.
 */
import { useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { getAddItemTaxonomy } from '../../api/addItem.api';
import { getProductCategory, setProductCategory } from '../../api/inventory.api';
import { IconEdit } from '../../icons/ecoIcons';
import { apiErrorMessage } from '../../utils/apiError';

export function productCategoryText(category: string, subcategory: string): string {
  return [category, subcategory].filter(Boolean).join(' › ');
}

function EditCategoryDialog({
  productId, category, subcategory, onClose,
}: { productId: number; category: string; subcategory: string; onClose: () => void }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [cat, setCat] = useState(category);
  const [sub, setSub] = useState(subcategory);
  const { data: taxonomy = [], isLoading } = useQuery({
    queryKey: ['add-item-taxonomy'],
    queryFn: getAddItemTaxonomy,
    staleTime: 60 * 60 * 1000,
  });
  const subs = taxonomy.find((t) => t.name === cat)?.subcategories ?? [];
  const ready = Boolean(cat) && (subs.length === 0 || subs.includes(sub));
  const save = useMutation({
    mutationFn: async () => (await setProductCategory(productId, { category: cat, subcategory: subs.length ? sub : '' })).data,
    onSuccess: (data) => {
      qc.setQueryData(['product-category', productId], data);
      void qc.invalidateQueries({ queryKey: ['inventory-search'] });
      void qc.invalidateQueries({ queryKey: ['inventory-search-items'] });
      void qc.invalidateQueries({ queryKey: ['item-card'] });
      enqueueSnackbar(`Category: ${productCategoryText(data.category, data.subcategory)}`, { variant: 'success' });
      onClose();
    },
    onError: (err) => enqueueSnackbar(apiErrorMessage(err, 'Could not save the category'), { variant: 'error' }),
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" fullScreen={phone}>
      <DialogTitle>Edit category</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            select
            label="Category"
            value={taxonomy.length ? cat : ''}
            onChange={(e) => {
              setCat(e.target.value);
              setSub('');
            }}
            disabled={isLoading}
            fullWidth
          >
            {taxonomy.map((t) => (
              <MenuItem key={t.name} value={t.name}>{t.name}</MenuItem>
            ))}
          </TextField>
          {subs.length > 0 && (
            <TextField
              select
              label="Subcategory"
              value={subs.includes(sub) ? sub : ''}
              onChange={(e) => setSub(e.target.value)}
              fullWidth
            >
              {subs.map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </TextField>
          )}
          <Typography variant="caption" color="text.secondary">
            Saved by hand: the cleanup passes won't change it back.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** "Electronics › Phones & tablets  Edit". `fallback` shows while the product has no category on its standard. */
export function ProductCategoryLine({
  productId, fallback = '', label = false,
}: { productId: number; fallback?: string; label?: boolean }) {
  const [editing, setEditing] = useState(false);
  const { data } = useQuery({
    queryKey: ['product-category', productId],
    queryFn: async () => (await getProductCategory(productId)).data,
  });
  const text = data ? productCategoryText(data.category, data.subcategory) : '';
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 0.5, minWidth: 0 }}>
      {label && <Typography component="span" variant="body2" color="text.secondary">Category:</Typography>}
      <Typography component="span" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
        {text || fallback || 'None'}
      </Typography>
      <Button
        size="small"
        startIcon={<IconEdit fontSize="small" />}
        onClick={() => setEditing(true)}
        disabled={!data}
        sx={{ minWidth: 0, py: 0, px: 0.75 }}
        aria-label="Edit category"
      >
        Edit
      </Button>
      {editing && data && (
        <EditCategoryDialog
          productId={productId}
          category={data.category}
          subcategory={data.subcategory}
          onClose={() => setEditing(false)}
        />
      )}
    </Box>
  );
}
