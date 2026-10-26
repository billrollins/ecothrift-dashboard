import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import type { RestorationEstimatePayload } from '../../../types/inventory.types';
import { RestorationEstimateFields } from './RestorationEstimateFields';
import {
  EMPTY_ESTIMATE,
  estimatePayload,
  estimateProblems,
  type RestorationEstimateForm,
} from './restorationEstimate';

/**
 * Asks for the Restoration estimates when a quick edit (a Goes-to dropdown) sends a check-in to Restoration.
 * Full width on a phone, a small dialog on desktop.
 */
export function RestorationEstimateDialog({
  open,
  initial = EMPTY_ESTIMATE,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  initial?: RestorationEstimateForm;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (estimate: RestorationEstimatePayload) => void;
}) {
  const [form, setForm] = useState<RestorationEstimateForm>(initial);
  useEffect(() => {
    if (open) setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const problems = estimateProblems(form);
  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>Send to Restoration</DialogTitle>
      <DialogContent>
        <RestorationEstimateFields value={form} onChange={setForm} disabled={busy} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="warning.main" sx={{ flex: 1, minWidth: 160 }}>
          {problems[0] ?? ''}
        </Typography>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="contained" disabled={busy || problems.length > 0} onClick={() => onConfirm(estimatePayload(form))}>
          Send to Restoration
        </Button>
      </DialogActions>
    </Dialog>
  );
}
