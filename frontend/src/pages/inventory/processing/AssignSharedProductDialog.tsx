import {
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { Product, ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import { useProductSearch } from '../../../hooks/useProductSearch';
import { queueTitleText } from './processingQueueCellText';

export interface AssignSharedProductDialogProps {
  open: boolean;
  rows: ProcessingWorkspaceRowDTO[];
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<boolean>;
  /**
   * 'assign' (default) posts to assign-shared-product; 'collapse' reuses the same
   * payload shape against collapse-rows (rows had mixed product decisions, so the
   * shared product must be picked as part of the collapse).
   */
  mode?: 'assign' | 'collapse';
}

export function AssignSharedProductDialog({
  open,
  rows,
  loading,
  onClose,
  onSubmit,
  mode = 'assign',
}: AssignSharedProductDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { products, isFetching } = useProductSearch('processing-assign-shared', search, open);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedProduct(null);
  }, [open, rows]);

  const submitDisabled = loading || !selectedProduct || rows.length < 2;
  const firstRow = [...rows].sort((a, b) => a.rowNum - b.rowNum)[0];

  async function handleSubmit() {
    if (!selectedProduct) return;
    const ok = await onSubmit({
      processing_row_ids: rows.map((row) => row.processing_row_id),
      product_mode: 'existing',
      product_id: selectedProduct.id,
    });
    if (ok) onClose();
  }

  // No catalog product yet: create one from the first row's fields and assign it to all.
  async function handleSubmitNew() {
    const ok = await onSubmit({
      processing_row_ids: rows.map((row) => row.processing_row_id),
      product_mode: 'new',
    });
    if (ok) onClose();
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{mode === 'collapse' ? 'Collapse rows — pick the shared product' : 'Assign shared product'}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {mode === 'collapse' ?
              `These ${rows.length} rows have different product decisions. Pick the one product they all are, and they'll collapse into a single row — check-ins fill the earliest rows first. Manifest lines stay untouched.`
            : `Set the same decided product on ${rows.length} rows without merging manifest lines. You can check in together after assigning.`}
          </Typography>
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
          <Typography variant="caption" color="text.secondary">
            Rows: {rows.map((row) => `#${row.rowNum} ${queueTitleText(row)}`).join(' · ')}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="outlined"
          color="success"
          disabled={loading || rows.length < 2}
          onClick={() => void handleSubmitNew()}
          title={firstRow ? `Creates a new catalog product from row #${firstRow.rowNum} (${queueTitleText(firstRow)}) and assigns it to all selected rows.` : undefined}
        >
          New product from row #{firstRow?.rowNum ?? '—'}
        </Button>
        <Button
          variant="contained"
          disabled={submitDisabled}
          onClick={() => void handleSubmit()}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {mode === 'collapse' ? 'Collapse with this product' : 'Assign product'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
