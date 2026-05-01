import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState, type KeyboardEvent } from 'react';
import type { ProcessingWorkspaceRowDTO } from '../../../../types/inventory.types';

const CONDITION_OPTIONS = ['New', 'Like New', 'Very Good', 'Used Good', 'Used Fair', 'Salvage'];

const DISPATCH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'on_shelf', label: 'On shelf / floor' },
  { value: 'restoration', label: 'Restoration' },
  { value: 'back_storage', label: 'Back storage' },
  { value: 'online_sales', label: 'Online sales' },
  { value: 'salvage', label: 'Salvage' },
];

export interface PrintMultipleModalProps {
  open: boolean;
  onClose: () => void;
  row: ProcessingWorkspaceRowDTO | null;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  loading: boolean;
}

export function PrintMultipleModal({ open, onClose, row, onSubmit, loading }: PrintMultipleModalProps) {
  const pendingCount =
    row ? row.items.filter((i) => i.status === 'intake' || i.status === 'processing').length : 0;

  const [qty, setQty] = useState(1);
  const [conditionUi, setConditionUi] = useState(CONDITION_OPTIONS[3]);
  const [dispatch, setDispatch] = useState('on_shelf');
  const [retail, setRetail] = useState('');
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (!open || !row) return;
    const max = Math.max(0, pendingCount);
    setQty(max > 0 ? max : 1);
    setRetail(row.unitRetail ?? '');
    const pri = row.price;
    setPrice(pri != null ? String(pri) : '');
  }, [open, row, pendingCount]);

  useEffect(() => {
    if (!open || !row) return;
    const max = Math.max(0, pendingCount);
    if (qty > max) setQty(Math.max(1, max));
  }, [open, row, pendingCount, qty]);

  const canSubmit = Boolean(row?.manifest_row_id) && pendingCount >= 2 && qty >= 1 && qty <= pendingCount;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) {
      e.stopPropagation();
      onClose();
    }
    if (e.key === 'Enter' && canSubmit && !loading) {
      e.preventDefault();
      e.stopPropagation();
      void onSubmit(submitPayload());
    }
  };

  const submitPayload = () => ({
    manifest_row_id: row!.manifest_row_id as number,
    qty,
    condition: conditionUi,
    dispatch,
    retail: retail || undefined,
    price: price || undefined,
  });

  return (
    <Dialog
      open={open}
      onClose={() => !loading && onClose()}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { onKeyDown: handleKeyDown } }}
    >
      <DialogTitle>Print multiple labels</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {!row ? (
          <Typography color="text.secondary">Select a row first.</Typography>
        ) : pendingCount < 1 ? (
          <Typography color="text.secondary">No pending units on this row.</Typography>
        ) : pendingCount < 2 ? (
          <Typography color="text.secondary">Need at least two pending units on the row for print-multiple parity.</Typography>
        ) : (
          <>
            <Typography variant="body2">
              Row {row.rowNum}: <strong>{pendingCount}</strong> pending; first N by item id ascend together after submit.
            </Typography>
            <TextField
              label="Quantity"
              type="number"
              size="small"
              inputProps={{ min: 1, max: pendingCount }}
              value={qty}
              error={qty < 1 || qty > pendingCount}
              helperText={qty < 1 || qty > pendingCount ? `Use 1–${pendingCount}` : undefined}
              onChange={(e) => setQty(Number.parseInt(e.target.value, 10) || 0)}
            />
            <TextField select label="Condition" size="small" value={conditionUi} onChange={(e) => setConditionUi(e.target.value)}>
              {CONDITION_OPTIONS.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Dispatch" size="small" value={dispatch} onChange={(e) => setDispatch(e.target.value)}>
              {DISPATCH_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Retail" size="small" value={retail} onChange={(e) => setRetail(e.target.value)} />
            <TextField label="Shelf price (optional)" size="small" value={price} onChange={(e) => setPrice(e.target.value)} />
            <Typography variant="caption" color="text.secondary">
              Enter confirms when valid; Esc cancels (V-25 / V-36).
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={loading || !canSubmit}
          onClick={async () => {
            await onSubmit(submitPayload());
          }}
        >
          Check in & print
        </Button>
      </DialogActions>
    </Dialog>
  );
}
