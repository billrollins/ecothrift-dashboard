import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import {
  normalizeProcessingCondition,
  PROCESSING_ITEM_CONDITION_OPTIONS,
  PROCESSING_ITEM_DEFAULT_CONDITION,
  PROCESSING_ITEM_DISPATCH_OPTIONS,
} from './processingItemFormOptions';
import { queueTitleText } from './processingQueueCellText';
import { RestorationRequestFields } from '../restorationRequest/RestorationRequestFields';
import {
  EMPTY_REQUEST,
  requestPayload,
  requestProblems,
  type RestorationRequestForm,
} from '../restorationRequest/restorationRequest';

export interface CheckInTogetherDialogProps {
  open: boolean;
  rows: ProcessingWorkspaceRowDTO[];
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>, options?: { printLabels?: boolean }) => Promise<boolean>;
}

function remainingQty(row: ProcessingWorkspaceRowDTO): number {
  return Math.max(0, row.qty - row.qtyDispositioned);
}

export function CheckInTogetherDialog({ open, rows, loading, onClose, onSubmit }: CheckInTogetherDialogProps) {
  const productId = rows[0]?.productId ?? null;
  const [condition, setCondition] = useState(PROCESSING_ITEM_DEFAULT_CONDITION);
  const [dispatch, setDispatch] = useState('on_shelf');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [qtyByRowId, setQtyByRowId] = useState<Record<number, string>>({});
  const [estimate, setEstimate] = useState<RestorationRequestForm>(EMPTY_REQUEST);

  useEffect(() => {
    if (!open) return;
    const nextQty: Record<number, string> = {};
    for (const row of rows) {
      nextQty[row.processing_row_id] = String(remainingQty(row));
    }
    setQtyByRowId(nextQty);
    const first = rows[0];
    setCondition(normalizeProcessingCondition(first?.condition));
    setDispatch(first?.dispatch || 'on_shelf');
    setPrice(first?.price ?? '');
    setNotes('');
    setEstimate(EMPTY_REQUEST);
  }, [open, rows]);

  const totalUnits = useMemo(
    () =>
      rows.reduce((sum, row) => {
        const raw = qtyByRowId[row.processing_row_id];
        const qty = Math.max(1, Math.min(500, Number.parseInt(raw, 10) || 1));
        return sum + qty;
      }, 0),
    [rows, qtyByRowId],
  );

  // Every item sent to Restoration carries the request (owner, 2026-10-28); a stack is one job.
  const toRestoration = dispatch === 'restoration';
  const problems = toRestoration ? requestProblems(estimate) : [];

  const buildPayload = (): Record<string, unknown> | null => {
    if (productId == null) return null;
    const rowPayloads = rows.map((row) => {
      const raw = qtyByRowId[row.processing_row_id];
      const qty = Math.max(1, Math.min(500, Number.parseInt(raw, 10) || 1));
      return { processing_row_id: row.processing_row_id, quantity: qty };
    });
    return {
      processing_row_ids: rows.map((r) => r.processing_row_id),
      rows: rowPayloads,
      product_mode: 'existing',
      product_id: productId,
      condition,
      dispatch,
      price: price.trim() || undefined,
      notes: notes.trim() || undefined,
      ...(toRestoration ? { restoration: requestPayload(estimate) } : {}),
    };
  };

  const handleSubmit = async (printLabels: boolean) => {
    const payload = buildPayload();
    if (!payload) return;
    const ok = await onSubmit(payload, { printLabels });
    if (ok) onClose();
  };

  const productLabel = rows[0]?.product?.title || (productId != null ? `Product #${productId}` : 'Product');

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Check in together</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {rows.length} rows · {productLabel} · {totalUnits} unit{totalUnits === 1 ? '' : 's'}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
            gap: 2,
            mb: 2,
          }}
        >
          <TextField
            select
            size="small"
            label="Condition"
            value={condition}
            onChange={(e) => setCondition(normalizeProcessingCondition(e.target.value))}
          >
            {PROCESSING_ITEM_CONDITION_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Dispatch"
            value={dispatch}
            onChange={(e) => setDispatch(e.target.value)}
          >
            {PROCESSING_ITEM_DISPATCH_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputProps={{ inputMode: 'decimal' }}
          />
          <TextField
            size="small"
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={1}
          />
        </Box>
        {toRestoration ?
          <Box sx={{ mb: 2 }}>
            <RestorationRequestFields value={estimate} onChange={setEstimate} disabled={loading} />
          </Box>
        : null}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Row #</TableCell>
              <TableCell>Title</TableCell>
              <TableCell align="right">Remaining</TableCell>
              <TableCell align="right" width={100}>
                Qty
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const rem = remainingQty(row);
              return (
                <TableRow key={row.processing_row_id}>
                  <TableCell>{row.rowNum}</TableCell>
                  <TableCell>{queueTitleText(row)}</TableCell>
                  <TableCell align="right">{rem}</TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      value={qtyByRowId[row.processing_row_id] ?? String(rem)}
                      onChange={(e) =>
                        setQtyByRowId((prev) => ({ ...prev, [row.processing_row_id]: e.target.value }))
                      }
                      inputProps={{ min: 1, max: Math.min(500, rem), style: { textAlign: 'right' } }}
                      sx={{ width: 72 }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Typography variant="caption" color="warning.main" sx={{ mr: 'auto', pl: 1 }}>
          {problems[0] ?? ''}
        </Typography>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={() => void handleSubmit(false)} disabled={loading || productId == null || problems.length > 0}>
          Check in without print
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSubmit(true)}
          disabled={loading || productId == null || problems.length > 0}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Check in & print
        </Button>
      </DialogActions>
    </Dialog>
  );
}
