import {
  Alert,
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
import { useEffect, useMemo, useState } from 'react';
import type { Product, ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import type { ProcessingRestartSummary } from '../../../api/inventory.api';
import { useProductSearch } from '../../../hooks/useProductSearch';

export type ProcessingTransformMode = 'break_apart' | 'make_set';

type TransformProductMode = 'keep' | 'existing' | 'new';

function parsePositive(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface ProcessingTransformDialogProps {
  open: boolean;
  mode: ProcessingTransformMode;
  row: ProcessingWorkspaceRowDTO;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

/**
 * P9 transforms (owner spec 2026-06-12): one dialog body for both directions.
 * Break apart: N units × X subitems each. Make set: K sets × S units each.
 * Live math mirrors the server: full-quantity + nothing checked in rewrites the row
 * in place; anything partial creates a `#12.1` sub row on the same manifest line.
 */
export function ProcessingTransformDialog({
  open,
  mode,
  row,
  loading,
  onClose,
  onSubmit,
}: ProcessingTransformDialogProps) {
  const isBreakApart = mode === 'break_apart';
  const available = Math.max(
    0,
    (row.qty ?? 0) - (row.qtyDispositioned ?? 0) - (row.pendingItemCount ?? 0),
  );
  const nothingCheckedIn = available === (row.qty ?? 0);

  const [unitsRaw, setUnitsRaw] = useState('');
  const [factorRaw, setFactorRaw] = useState('');
  const [setSizeRaw, setSetSizeRaw] = useState('');
  const [numSetsRaw, setNumSetsRaw] = useState('');
  const [productMode, setProductMode] = useState<TransformProductMode>('keep');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [shelfPrice, setShelfPrice] = useState('');

  const { products, isFetching } = useProductSearch(
    'processing-transform',
    search,
    open && productMode === 'existing',
  );

  useEffect(() => {
    if (!open) return;
    setUnitsRaw(String(available));
    setFactorRaw('');
    setSetSizeRaw('');
    setNumSetsRaw('');
    setProductMode('keep');
    setSearch('');
    setSelectedProduct(null);
    setNewTitle('');
    setShelfPrice('');
  }, [open, available]);

  const units = parsePositive(unitsRaw);
  const factor = parsePositive(factorRaw);
  const setSize = parsePositive(setSizeRaw);
  const numSets = parsePositive(numSetsRaw);

  const math = useMemo(() => {
    if (isBreakApart) {
      if (!units || !factor || factor < 2) return null;
      const subitems = units * factor;
      const remainder = (row.qty ?? 0) - units;
      const inPlace = units === (row.qty ?? 0) && nothingCheckedIn;
      return {
        valid: units <= available,
        inPlace,
        line: inPlace
          ? `Entire row becomes ${subitems.toLocaleString()} subitems.`
          : `${units.toLocaleString()} × ${factor.toLocaleString()} = ${subitems.toLocaleString()} subitems on a new sub row · ${remainder.toLocaleString()} stay as-is.`,
      };
    }
    if (!setSize || setSize < 2 || !numSets) return null;
    const consumed = setSize * numSets;
    const remainder = (row.qty ?? 0) - consumed;
    const inPlace = consumed === (row.qty ?? 0) && nothingCheckedIn;
    return {
      valid: consumed <= available,
      inPlace,
      line: inPlace
        ? `Entire row becomes ${numSets.toLocaleString()} set(s) of ${setSize.toLocaleString()}.`
        : `${numSets.toLocaleString()} set(s) × ${setSize.toLocaleString()} = ${consumed.toLocaleString()} units on a new sub row · ${remainder.toLocaleString()} stay as-is.`,
    };
  }, [isBreakApart, units, factor, setSize, numSets, row.qty, available, nothingCheckedIn]);

  const submitDisabled =
    loading
    || !math
    || !math.valid
    || (productMode === 'existing' && !selectedProduct)
    || (productMode === 'new' && !newTitle.trim());

  async function handleSubmit() {
    const payload: Record<string, unknown> = {
      processing_row_id: row.processing_row_id,
      product_mode: productMode,
    };
    if (isBreakApart) {
      payload.units = units;
      payload.factor = factor;
    } else {
      payload.set_size = setSize;
      payload.num_sets = numSets;
    }
    if (productMode === 'existing' && selectedProduct) payload.product_id = selectedProduct.id;
    if (productMode === 'new') payload.title = newTitle.trim();
    if (shelfPrice.trim()) payload.shelf_price = shelfPrice.trim();
    await onSubmit(payload);
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isBreakApart ? 'Break apart' : 'Make set'} — row {row.rowNum}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {isBreakApart
              ? 'Sell the contents of larger units individually (e.g. 10 cases of 500 plates → 5,000 plates).'
              : 'Bundle units into sets sold with ONE tag each (e.g. boxes of 500 candles at a bulk price).'}
            {' '}
            {available.toLocaleString()} of {(row.qty ?? 0).toLocaleString()} unit(s) are still un-checked-in.
          </Typography>

          {isBreakApart ? (
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Units to break apart"
                size="small"
                value={unitsRaw}
                onChange={(e) => setUnitsRaw(e.target.value)}
                inputProps={{ inputMode: 'numeric' }}
                fullWidth
              />
              <TextField
                label="Subitems per unit"
                size="small"
                value={factorRaw}
                onChange={(e) => setFactorRaw(e.target.value)}
                inputProps={{ inputMode: 'numeric' }}
                fullWidth
                autoFocus
              />
            </Stack>
          ) : (
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Set size (units per set)"
                size="small"
                value={setSizeRaw}
                onChange={(e) => setSetSizeRaw(e.target.value)}
                inputProps={{ inputMode: 'numeric' }}
                fullWidth
                autoFocus
              />
              <TextField
                label="Number of sets"
                size="small"
                value={numSetsRaw}
                onChange={(e) => setNumSetsRaw(e.target.value)}
                inputProps={{ inputMode: 'numeric' }}
                fullWidth
              />
            </Stack>
          )}

          {math ? (
            <Alert severity={math.valid ? 'info' : 'error'} sx={{ py: 0.25 }}>
              {math.valid
                ? math.line
                : `That needs more units than the ${available.toLocaleString()} still un-checked-in.`}
            </Alert>
          ) : null}

          <TextField
            select
            label={isBreakApart ? 'Product for the subitems' : 'Product for the sets'}
            size="small"
            value={productMode}
            onChange={(e) => setProductMode(e.target.value as TransformProductMode)}
          >
            <MenuItem value="keep">Keep current product decision</MenuItem>
            <MenuItem value="existing">Existing product</MenuItem>
            <MenuItem value="new">New product</MenuItem>
          </TextField>
          {productMode === 'existing' ? (
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
          ) : null}
          {productMode === 'new' ? (
            <TextField
              label="New product title"
              size="small"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={isBreakApart ? `${row.title} (single)` : `${row.title} — Set of ${setSizeRaw || 'N'}`}
              required
            />
          ) : null}

          <TextField
            label={isBreakApart ? 'Price per subitem (optional)' : 'Price per set (optional)'}
            size="small"
            value={shelfPrice}
            onChange={(e) => setShelfPrice(e.target.value)}
            inputProps={{ inputMode: 'decimal' }}
            helperText="Blank = scaled from the row's current price."
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" disabled={submitDisabled} onClick={() => void handleSubmit()}>
          {isBreakApart ? 'Break apart' : 'Make sets'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export interface ProcessingRestartRowDialogProps {
  open: boolean;
  summary: ProcessingRestartSummary | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

/** Coarse v1 undo confirm — the server already vetoed sold/cart-referenced families. */
export function ProcessingRestartRowDialog({
  open,
  summary,
  loading,
  onClose,
  onConfirm,
}: ProcessingRestartRowDialogProps) {
  const skus = summary?.on_shelf_skus ?? [];
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Restart row {summary?.root_row_number}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.25} sx={{ pt: 0.5 }}>
          <Alert severity="warning" sx={{ py: 0.25 }}>
            This undoes every Break apart / Make set on this row and all of its check-ins.
            The row returns to its original finalized state.
          </Alert>
          <Typography variant="body2">
            • Deletes <b>{summary?.item_count ?? 0}</b> item(s)
            {summary?.disputed_count ? ` (including ${summary.disputed_count} disputed)` : ''} and
            removes sub row(s) {summary?.sub_row_numbers.length ? summary.sub_row_numbers.join(', ') : '—'}.
          </Typography>
          {summary?.on_shelf_count ? (
            <Typography variant="body2" color="error">
              • {summary.on_shelf_count} item(s) are ON THE SHELF — pull these tags from the floor:{' '}
              {skus.join(', ')}
              {summary.on_shelf_count > skus.length ? ` +${summary.on_shelf_count - skus.length} more` : ''}
            </Typography>
          ) : null}
          {summary?.created_product_ids.length ? (
            <Typography variant="body2">
              • Products created by these transforms are deleted when nothing else uses them
              (kept and reported otherwise).
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button color="error" variant="contained" disabled={loading} onClick={() => void onConfirm()}>
          Delete {summary?.item_count ?? 0} item(s) & restart
        </Button>
      </DialogActions>
    </Dialog>
  );
}
