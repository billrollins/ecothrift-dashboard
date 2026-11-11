import { useEffect, useState, type ReactNode } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import type { RestorationRequestPayload } from '../../../types/inventory.types';
import { RestorationRequestFields } from './RestorationRequestFields';
import {
  EMPTY_REQUEST,
  requestPayload,
  requestProblems,
  type RestorationRequestForm,
} from './restorationRequest';

/**
 * Asks for the Restoration request when a quick edit (a Goes-to dropdown) sends a check-in to Restoration.
 * Full width on a phone, a small dialog on desktop.
 */
export function RestorationRequestDialog({
  open,
  initial = EMPTY_REQUEST,
  busy,
  onCancel,
  onConfirm,
  price,
  about,
}: {
  open: boolean;
  initial?: RestorationRequestForm;
  /** The check-in's price: the done price starts as it (Dash Updates #2). */
  price?: string | null;
  busy?: boolean;
  /** Drawn above the request: which item this is, when the window opens from a list of items. */
  about?: ReactNode;
  onCancel: () => void;
  onConfirm: (request: RestorationRequestPayload) => void;
}) {
  const [form, setForm] = useState<RestorationRequestForm>(initial);
  useEffect(() => {
    if (open) setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const problems = requestProblems(form);
  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>Send to Restoration</DialogTitle>
      <DialogContent>
        {about ? <Box sx={{ mb: 2 }}>{about}</Box> : null}
        {open ? <RestorationRequestFields key={String(open)} value={form} onChange={setForm} disabled={busy} price={price} /> : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="warning.main" sx={{ flex: 1, minWidth: 160 }}>
          {problems[0] ?? ''}
        </Typography>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="contained" disabled={busy || problems.length > 0} onClick={() => onConfirm(requestPayload(form))}>
          Send to Restoration
        </Button>
      </DialogActions>
    </Dialog>
  );
}
