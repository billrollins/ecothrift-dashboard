import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import type {
  ReceivingDetailDTO,
  ReceivingMissingPhotoSlot,
  ReceivingPhotoOverridePayload,
} from '../../../types/inventory.types';

export interface ReceivingCompleteDialogProps {
  open: boolean;
  receiving: ReceivingDetailDTO;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (overrides: ReceivingPhotoOverridePayload[]) => void;
}

function slotKey(s: ReceivingMissingPhotoSlot): string {
  return s.key;
}

/**
 * Complete Receiving confirmation - lists every missing required photo slot
 * with its own required override reason when photos are incomplete.
 */
export function ReceivingCompleteDialog({
  open,
  receiving,
  loading = false,
  onClose,
  onConfirm,
}: ReceivingCompleteDialogProps) {
  const missing = useMemo(
    () => receiving.missing_required_photos ?? [],
    [receiving.missing_required_photos],
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const s of missing) next[slotKey(s)] = '';
    setReasons(next);
  }, [open, missing]);

  const allReasonsFilled =
    missing.length === 0 ||
    missing.every((s) => (reasons[slotKey(s)] || '').trim().length > 0);

  const submit = () => {
    if (!allReasonsFilled) return;
    const overrides: ReceivingPhotoOverridePayload[] = missing.map((s) => ({
      kind: s.kind,
      pallet_number: s.pallet_number,
      side: s.side || '',
      reason: (reasons[slotKey(s)] || '').trim(),
    }));
    onConfirm(overrides);
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Complete Receiving</DialogTitle>
      <DialogContent dividers>
        {missing.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            All required photos are present (BOL, truck, and four sides for each pallet). Complete
            receiving and mark the order delivered?
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="warning">
              {missing.length} required photo{missing.length === 1 ? '' : 's'} missing. Provide a
              reason for each slot to override, or go back and add the photos.
            </Alert>
            {missing.map((s) => (
              <Box key={slotKey(s)}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.75 }}>{s.label}</Typography>
                <TextField
                  fullWidth
                  size="small"
                  required
                  multiline
                  minRows={2}
                  label="Reason for no photo"
                  value={reasons[slotKey(s)] ?? ''}
                  disabled={loading}
                  onChange={(e) =>
                    setReasons((prev) => ({ ...prev, [slotKey(s)]: e.target.value }))
                  }
                />
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          disabled={loading || !allReasonsFilled}
          onClick={submit}
        >
          {loading
            ? 'Completing…'
            : missing.length
              ? 'Override & complete'
              : 'Complete & deliver'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
