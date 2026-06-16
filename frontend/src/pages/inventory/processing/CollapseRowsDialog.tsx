import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import type { ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import { queueTitleText } from './processingQueueCellText';

export interface CollapseRowsDialogProps {
  open: boolean;
  rows: ProcessingWorkspaceRowDTO[];
  loading: boolean;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}

function sortedRows(rows: ProcessingWorkspaceRowDTO[]): ProcessingWorkspaceRowDTO[] {
  return [...rows].sort((a, b) => a.rowNum - b.rowNum);
}

export function CollapseRowsDialog({
  open,
  rows,
  loading,
  onClose,
  onConfirm,
}: CollapseRowsDialogProps) {
  const ordered = sortedRows(rows);
  const master = ordered[0];
  const masterLabel = master ? `#${master.rowNum} ${queueTitleText(master)}` : '—';

  async function handleConfirm() {
    const ok = await onConfirm();
    if (ok) onClose();
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Collapse rows</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            These {rows.length} rows will act as one group in the queue. You do not pick a single shared
            product — every attached product and every prior check-in from each row stays linked.
            Row details (title, brand, identifiers, etc.) come from the earliest row: {masterLabel}.
            Manifest lines stay untouched.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            When you check in on the collapsed row, units fill the earliest rows first — each partial
            row gets its own check-in batch. Any remainder after earlier rows are full lands on the
            last row (including overage).
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Rows: {ordered.map((row) => `#${row.rowNum} ${queueTitleText(row)}`).join(' · ')}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={loading || rows.length < 2}
          onClick={() => void handleConfirm()}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Collapse rows
        </Button>
      </DialogActions>
    </Dialog>
  );
}
