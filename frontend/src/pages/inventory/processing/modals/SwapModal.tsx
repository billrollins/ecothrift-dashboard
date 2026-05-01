import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { ProcessingWorkspaceRowDTO } from '../../../../types/inventory.types';

export type SwapModeDerived = 'a_to_b' | 'b_to_a' | 'both' | null;

export interface SwapModalProps {
  open: boolean;
  onClose: () => void;
  /** Full workspace rows for picker + inference */
  workspaceRows: ProcessingWorkspaceRowDTO[];
  initialRowA?: number | null;
  initialRowB?: number | null;
  loading: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

function rowHasCheckedIn(row: ProcessingWorkspaceRowDTO): boolean {
  return row.items.some((i) => i.status === 'on_shelf');
}

export function SwapModal({
  open,
  onClose,
  workspaceRows,
  initialRowA,
  initialRowB,
  loading,
  onSubmit,
}: SwapModalProps) {
  const sorted = useMemo(
    () => [...workspaceRows].sort((a, b) => a.rowNum - b.rowNum),
    [workspaceRows],
  );
  const [rowA, setRowA] = useState<ProcessingWorkspaceRowDTO | null>(null);
  const [rowB, setRowB] = useState<ProcessingWorkspaceRowDTO | null>(null);

  useEffect(() => {
    if (!open) return;
    const a = sorted.find((r) => r.rowNum === initialRowA) ?? null;
    const b = sorted.find((r) => r.rowNum === initialRowB) ?? null;
    setRowA(a);
    setRowB(b);
  }, [open, sorted, initialRowA, initialRowB]);

  const mode: SwapModeDerived = useMemo(() => {
    if (!rowA || !rowB || rowA.manifest_row_id === rowB.manifest_row_id) return null;
    const aIn = rowHasCheckedIn(rowA);
    const bIn = rowHasCheckedIn(rowB);
    if (!aIn && !bIn) return null;
    if (aIn && bIn) return 'both';
    if (aIn && !bIn) return 'a_to_b';
    if (!aIn && bIn) return 'b_to_a';
    return null;
  }, [rowA, rowB]);

  const scenarioCopy = useMemo(() => {
    if (!rowA || !rowB) return 'Pick two different manifest rows.';
    if (rowA.manifest_row_id === rowB.manifest_row_id) return 'Choose two different rows.';
    const aIn = rowHasCheckedIn(rowA);
    const bIn = rowHasCheckedIn(rowB);
    if (!aIn && !bIn) return 'Neither row has checked-in units — swap is blocked (§7.5).';
    if (aIn && bIn) return 'Both checked in: fields swap between paired items; reprint labels if prices differ.';
    if (aIn && !bIn) return 'Only row A checked in: copy A onto B, reset A to pending.';
    if (!aIn && bIn) return 'Only row B checked in: copy B onto A, reset B to pending.';
    return '';
  }, [rowA, rowB]);

  const valid = mode != null;

  return (
    <Dialog
      open={open}
      onClose={() => !loading && onClose()}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !loading) onClose();
          },
        },
      }}
    >
      <DialogTitle>Swap checked-in fields</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Search by row #, title, or SKU. The server enforces item-count pairing and valid source/target states.
        </Typography>
        <Autocomplete
          size="small"
          options={sorted}
          value={rowA}
          onChange={(_e, v) => setRowA(v)}
          getOptionLabel={(r) => `#${r.rowNum} — ${r.title || r.sku || 'Line'}`}
          isOptionEqualToValue={(a, b) => a.manifest_row_id === b.manifest_row_id}
          renderInput={(params) => <TextField {...params} label="Row A" />}
        />
        <Autocomplete
          size="small"
          options={sorted}
          value={rowB}
          onChange={(_e, v) => setRowB(v)}
          getOptionLabel={(r) => `#${r.rowNum} — ${r.title || r.sku || 'Line'}`}
          isOptionEqualToValue={(a, b) => a.manifest_row_id === b.manifest_row_id}
          renderInput={(params) => <TextField {...params} label="Row B" />}
        />
        <Alert severity={valid ? 'info' : 'warning'} variant="outlined">
          {scenarioCopy}
          {valid && mode ? (
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              Derived mode: <strong>{mode}</strong>
            </Typography>
          ) : null}
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={loading || !valid || !rowA || !rowB}
          onClick={async () => {
            if (!rowA || !rowB || !mode) return;
            await onSubmit({ row_a: rowA.rowNum, row_b: rowB.rowNum, mode });
          }}
        >
          Run swap
        </Button>
      </DialogActions>
    </Dialog>
  );
}
