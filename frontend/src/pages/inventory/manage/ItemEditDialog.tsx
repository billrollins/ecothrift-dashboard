import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import type { Item, ItemCondition } from '../../../types/inventory.types';
import { getProduct, updateItem } from '../../../api/inventory.api';
import { ProductDisplayLine } from '../../../components/inventory/ProductDisplayLine';
import { productLikeFromItemFields } from '../../../utils/productCatalog';
import {
  normalizeProcessingCondition,
  PROCESSING_ITEM_CONDITION_OPTIONS,
} from '../processing/processingItemFormOptions';
import { processingTokens } from '../processing/processingTokens';
import { manageItemsSearchUrl } from '../../../utils/richInventorySearch';

const LOCKED_ITEM_STATUSES = new Set(['sold', 'scrapped', 'lost']);

/** Sold, terminal, or POS-linked items cannot be edited from Manage Items (phase one). */
export function isItemEditLocked(item: Item | null | undefined): boolean {
  if (!item) return false;
  if (item.status === 'sold' || Boolean(item.sold_at)) return true;
  return LOCKED_ITEM_STATUSES.has(item.status);
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface ItemEditDialogProps {
  open: boolean;
  item: Item | null;
  onClose: () => void;
}

export function ItemEditDialog({ open, item, onClose }: ItemEditDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const [condition, setCondition] = useState<ItemCondition>('good');
  const [price, setPrice] = useState('');
  const [retail, setRetail] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const locked = isItemEditLocked(item);

  useEffect(() => {
    if (!item) return;
    setCondition(normalizeProcessingCondition(item.condition));
    setPrice(item.price || '');
    setRetail(item.retail || item.retail_value || '');
    setLocation(item.location || '');
    setNotes(item.notes || '');
    setError('');
  }, [item]);

  const productQuery = useQuery({
    queryKey: ['products', 'item-edit', item?.product],
    queryFn: async () => {
      const { data } = await getProduct(Number(item!.product));
      return data;
    },
    enabled: open && Boolean(item?.product),
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error('No item selected.');
      if (locked) throw new Error('This item cannot be edited here.');
      const { data } = await updateItem(item.id, {
        condition,
        price: price.trim() || '0.00',
        retail: retail.trim() || null,
        location: location.trim(),
        notes,
      });
      return data;
    },
    onSuccess: async () => {
      enqueueSnackbar('Item updated.', { variant: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not save item.');
    },
  });

  const productDisplay = useMemo(() => {
    if (productQuery.data) return productQuery.data;
    if (!item?.product) return null;
    return productLikeFromItemFields(item.product, item);
  }, [item, productQuery.data]);

  const itemCheckInId = item?.item_check_in_id ?? null;

  const openCheckInGroup = () => {
    if (!itemCheckInId) return;
    const filters: Record<string, string | number> = { checkin: itemCheckInId };
    if (item?.product) filters.product = item.product;
    navigate(manageItemsSearchUrl({ filters }));
    onClose();
  };

  if (!item) return null;

  const busy = saveMutation.isPending;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack spacing={0.75}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Edit item
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Chip label={item.sku} size="small" color="primary" variant="outlined" sx={{ fontFamily: 'monospace' }} />
              <Chip label={formatStatusLabel(item.status)} size="small" variant="outlined" />
            </Stack>
          </Box>
          <Typography variant="body2" color="text.secondary">
            This edits one physical unit - not the full check-in group. To review or adjust every item checked in together, use the check-in group action below.
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

        {locked ?
          <Alert severity="warning" sx={{ mb: 2 }}>
            {item.status === 'sold' || item.sold_at ?
              'Sold or POS-linked items cannot be edited here. Use the manager reversal workflow if this sale needs to be undone.'
            : 'This item is in a terminal status and cannot be edited from Manage Items.'}
          </Alert>
        : null}

        <Box
          sx={{
            p: 1.5,
            mb: 2,
            border: 1,
            borderColor: processingTokens.border,
            borderRadius: 1.5,
            bgcolor: '#f8faf8',
          }}
        >
          {productDisplay ?
            <ProductDisplayLine product={productDisplay} variant="selected" />
          : (
            <Typography variant="body2" color="text.secondary">
              No linked product
            </Typography>
          )}
          {item.category ?
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              Category: {item.category}
            </Typography>
          : null}
          {item.purchase_order_number ?
            <Typography variant="caption" color="text.secondary" display="block">
              PO: {item.purchase_order_number}
              {item.checked_in_at ? ` · checked in ${formatShortDate(item.checked_in_at)}` : ''}
            </Typography>
          : null}
        </Box>

        {itemCheckInId ?
          <Alert severity="info" sx={{ mb: 2 }} icon={false}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Part of check-in #{itemCheckInId}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Quantity and group-wide changes belong on the check-in group view, not this single-item editor.
            </Typography>
          </Alert>
        : null}

        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <TextField
              select
              size="small"
              label="Condition"
              value={condition}
              onChange={(e) => setCondition(normalizeProcessingCondition(e.target.value))}
              disabled={locked || busy}
              fullWidth
            >
              {PROCESSING_ITEM_CONDITION_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={locked || busy}
              fullWidth
            />
            <TextField
              size="small"
              label="Shelf price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={locked || busy}
              fullWidth
            />
            <TextField
              size="small"
              label="Retail / MSRP"
              value={retail}
              onChange={(e) => setRetail(e.target.value)}
              disabled={locked || busy}
              fullWidth
            />
          </Box>
          <TextField
            size="small"
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={locked || busy}
            fullWidth
            multiline
            minRows={2}
          />
          {item.cost ?
            <Typography variant="caption" color="text.secondary">
              Allocated cost: {item.cost}
              {item.sold_for ? ` · sold for ${item.sold_for}` : ''}
            </Typography>
          : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, justifyContent: 'space-between' }}>
        <Box>
          {itemCheckInId ?
            <Button
              startIcon={<SearchOutlinedIcon />}
              onClick={openCheckInGroup}
              disabled={busy}
            >
              Search check-in items
            </Button>
          : null}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} disabled={busy}>
            Close
          </Button>
          {!locked ?
            <Button
              variant="contained"
              startIcon={<SaveOutlinedIcon />}
              disabled={busy}
              onClick={() => saveMutation.mutate()}
            >
              Save item
            </Button>
          : null}
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
