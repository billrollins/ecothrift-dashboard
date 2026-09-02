/**
 * A catalog item that is not in restoration yet. Confirm before creating a job.
 */
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import type { RestorationScanItemDTO } from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';

export function RestorationAddToQueueDialog({
  item,
  busy,
  onCancel,
  onConfirm,
}: {
  item: RestorationScanItemDTO | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const open = item != null;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onCancel();
      }}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: { borderRadius: 2 },
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 900 }}>Add to queue?</DialogTitle>
      <DialogContent>
        <Stack spacing={0.75}>
          <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.85rem', color: studio.accentDark }}>
            {item?.sku ?? '-'}
          </Typography>
          <Typography sx={{ fontWeight: 800, color: studio.ink }}>{item?.name || 'Unnamed item'}</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: studio.inkMuted }}>
            Location: {item?.location || '-'}
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: studio.inkMuted }}>
            Status: {item?.status || '-'}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="contained" disabled={busy || item == null}>
          Add to queue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
