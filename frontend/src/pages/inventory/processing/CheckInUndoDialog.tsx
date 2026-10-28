/**
 * Undo check-in: move every item of one check-in somewhere else, or delete the check-in.
 *
 * One dialog, opened from Processing's Prior check-ins and from the Restoration queue. It reads
 * what will happen from the server first, and says plainly what blocks the undo (owner, 2026-10-28).
 */
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { getCheckInUndoPreview, type CheckInUndoPreview } from '../../../api/inventory.api';
import { apiErrorDetail } from '../../../hooks/useProductSearch';
import { useUndoItemCheckIn } from '../../../hooks/useProcessingWorkspace';
import { processingDispatchLabel } from './processingItemFormOptions';

export interface CheckInUndoTarget {
  orderId: number;
  itemCheckInId: number;
}

function placeLabel(location: string): string {
  return location === 'restoration' ? 'Restoration' : processingDispatchLabel(location);
}

function whereLine(where: Record<string, number>): string {
  return Object.entries(where)
    .map(([location, n]) => `${n} ${placeLabel(location).toLowerCase()}`)
    .join(', ');
}

function defaultDestination(preview: CheckInUndoPreview): string {
  const current = preview.dispatch || 'on_shelf';
  if (current !== 'on_shelf' && preview.destinations.includes('on_shelf')) return 'on_shelf';
  return preview.destinations.find((d) => d !== current) ?? 'on_shelf';
}

function Summary({ preview }: { preview: CheckInUndoPreview }) {
  const when = new Date(preview.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const row = preview.processing_row_number != null ? ` · row ${preview.processing_row_number}` : '';
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontWeight: 800 }}>
        {preview.quantity} × {preview.product_title || 'item'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Checked in {when}
        {preview.created_by ? ` by ${preview.created_by}` : ''} · {preview.purchase_order_number}
        {row}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Now: {whereLine(preview.where) || 'no items'}
        {preview.restoration_job ? ` · Restoration job #${preview.restoration_job.id} (${preview.restoration_job.stage})` : ''}
      </Typography>
    </Box>
  );
}

export function CheckInUndoDialog({
  target,
  onClose,
  onDone,
}: {
  target: CheckInUndoTarget | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'));
  const { enqueueSnackbar } = useSnackbar();
  const undo = useUndoItemCheckIn();
  const [choice, setChoice] = useState<'move' | 'delete'>('move');
  const [destination, setDestination] = useState('on_shelf');
  const preview = useQuery({
    queryKey: ['check-in-undo', target?.orderId, target?.itemCheckInId],
    queryFn: async () => (await getCheckInUndoPreview(target!.orderId, target!.itemCheckInId)).data,
    enabled: target != null,
    staleTime: 0,
  });
  const data = target != null ? preview.data : undefined;

  useEffect(() => {
    if (!data) return;
    setChoice('move');
    setDestination(defaultDestination(data));
  }, [data]);

  const blocked = (data?.blocks.length ?? 0) > 0;
  const n = data?.quantity ?? 0;
  const busy = undo.isPending;

  async function confirm() {
    if (!target || !data) return;
    try {
      const result = await undo.mutateAsync({
        ...target,
        payload: choice === 'move' ? { action: 'move', dispatch: destination } : { action: 'delete' },
      });
      enqueueSnackbar(
        result.undo.action === 'move'
          ? `Moved ${result.undo.quantity} to ${placeLabel(result.undo.to)}.`
          : `Deleted the check-in - ${result.undo.quantity} item${result.undo.quantity === 1 ? '' : 's'} removed.`,
        { variant: 'success' },
      );
      onDone?.();
      onClose();
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Could not undo that check-in'), { variant: 'error' });
      void preview.refetch();
    }
  }

  return (
    <Dialog open={target != null} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth fullScreen={phone}>
      <DialogTitle sx={{ fontWeight: 900 }}>Undo check-in</DialogTitle>
      <DialogContent>
        {preview.isError ? (
          <Alert severity="error">{apiErrorDetail(preview.error, 'Could not load this check-in.')}</Alert>
        ) : !data ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            <Summary preview={data} />
            {blocked ? (
              <Alert severity="warning">
                <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.5 }}>
                  This check-in can't be undone:
                </Typography>
                {data.blocks.map((reason) => (
                  <Typography key={reason} variant="body2">
                    {reason}
                  </Typography>
                ))}
              </Alert>
            ) : (
              <RadioGroup value={choice} onChange={(e) => setChoice(e.target.value as 'move' | 'delete')}>
                <FormControlLabel
                  value="move"
                  control={<Radio />}
                  label={<Typography sx={{ fontWeight: 700 }}>Move all {n} somewhere else</Typography>}
                />
                <Box sx={{ pl: 4, pb: 1.5 }}>
                  <TextField
                    select
                    size="small"
                    label="Move to"
                    value={destination}
                    disabled={choice !== 'move'}
                    onChange={(e) => setDestination(e.target.value)}
                    sx={{ minWidth: 220, maxWidth: '100%' }}
                  >
                    {data.destinations.map((d) => (
                      <MenuItem key={d} value={d}>
                        {placeLabel(d)}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    Items and tags stay.
                    {data.restoration_job ? ' The Restoration job is removed from the queue.' : ''}
                  </Typography>
                </Box>
                <FormControlLabel
                  value="delete"
                  control={<Radio />}
                  label={<Typography sx={{ fontWeight: 700 }}>Delete the check-in</Typography>}
                />
                <Typography variant="body2" color="text.secondary" sx={{ pl: 4 }}>
                  Removes {n} item{n === 1 ? '' : 's'} from inventory - throw their tags away.
                  {data.pending_after_delete == null
                    ? ''
                    : data.pending_after_delete === data.pending_now
                      ? ` Row ${data.processing_row_number ?? ''} stays at ${data.pending_now} pending (it has more checked in than the manifest says).`
                      : ` Row ${data.processing_row_number ?? ''} goes back to ${data.pending_after_delete} pending (now ${data.pending_now}).`}
                  {data.restoration_job ? ' The Restoration job is removed.' : ''}
                </Typography>
              </RadioGroup>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          {blocked ? 'Close' : 'Cancel'}
        </Button>
        {data && !blocked ? (
          <Button
            variant="contained"
            color={choice === 'delete' ? 'error' : 'primary'}
            disabled={busy}
            onClick={() => void confirm()}
          >
            {choice === 'delete' ? `Delete ${n}` : `Move ${n} to ${placeLabel(destination)}`}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
