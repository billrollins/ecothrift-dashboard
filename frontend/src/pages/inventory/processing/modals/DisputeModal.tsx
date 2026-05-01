import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import type { ProcessingWorkspaceItemDTO } from '../../../../types/inventory.types';

export interface DisputeModalProps {
  open: boolean;
  onClose: () => void;
  item: ProcessingWorkspaceItemDTO | null;
  /** When set, disputes all pending intake/processing units on these manifest rows (batch). */
  bulkManifestRowIds?: number[] | null;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  loading: boolean;
}

export function DisputeModal({ open, onClose, item, bulkManifestRowIds, onSubmit, loading }: DisputeModalProps) {
  const [dtype, setDtype] = useState<'broken' | 'undelivered'>('broken');
  const [pct, setPct] = useState('50');
  const [desc, setDesc] = useState('');

  useEffect(() => {
    if (!open) return;
    setDtype('broken');
    setPct('50');
    setDesc('');
  }, [open, item?.id, bulkManifestRowIds?.join(',')]);

  const bulk = bulkManifestRowIds && bulkManifestRowIds.length > 0;
  const canBroken = dtype === 'broken';
  const pending =
    item && (item.status === 'intake' || item.status === 'processing');

  const blocker =
    bulk ? canBroken && !desc.trim() : (!item || !pending || (canBroken && !desc.trim()));

  return (
    <Dialog open={open} onClose={() => !loading && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>{bulk ? `Dispute ${bulkManifestRowIds!.length} manifest row(s)` : 'Dispute unit'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Broken requires description & loss %. Undelivered marks matching units terminal without extra fields (V-26 / V-27).
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box
            onClick={() => !loading && setDtype('broken')}
            sx={{
              p: 1.5,
              borderRadius: 1,
              border: 2,
              borderColor: dtype === 'broken' ? 'primary.main' : 'divider',
              cursor: loading ? 'default' : 'pointer',
              bgcolor: dtype === 'broken' ? 'action.selected' : 'background.paper',
            }}
          >
            <Typography variant="subtitle2">Broken / damaged</Typography>
            <Typography variant="caption" color="text.secondary">
              Scrapping with loss % plus narrative for claims.
            </Typography>
          </Box>
          <Box
            onClick={() => !loading && setDtype('undelivered')}
            sx={{
              p: 1.5,
              borderRadius: 1,
              border: 2,
              borderColor: dtype === 'undelivered' ? 'primary.main' : 'divider',
              cursor: loading ? 'default' : 'pointer',
              bgcolor: dtype === 'undelivered' ? 'action.selected' : 'background.paper',
            }}
          >
            <Typography variant="subtitle2">Undelivered</Typography>
            <Typography variant="caption" color="text.secondary">
              Marks intake/processing units as undelivered (lost mapping server-side).
            </Typography>
          </Box>
        </Box>

        {bulk ?
          <>
            <Typography variant="body2" color="text.secondary">
              Applies every intake/processing unit on the chosen manifest rows.
            </Typography>
            {canBroken ? (
              <>
                <TextField
                  label="% loss"
                  size="small"
                  type="number"
                  inputProps={{ min: 0, max: 100 }}
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                />
                <TextField label="Description" size="small" multiline minRows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
              </>
            ) : null}
          </>
        : !item ? (
          <Typography color="text.secondary">No item selected.</Typography>
        ) : !pending ? (
          <Typography color="text.secondary">Disputes apply to pending intake/processing units.</Typography>
        ) : (
          <>
            <Typography variant="body2">
              {item.sku} — {item.condition_label}
            </Typography>
            {canBroken ? (
              <>
                <TextField
                  label="% loss"
                  size="small"
                  type="number"
                  inputProps={{ min: 0, max: 100 }}
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                />
                <TextField label="Description" size="small" multiline minRows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
              </>
            ) : null}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          color="warning"
          variant="contained"
          disabled={loading || blocker}
          onClick={async () => {
            const payload: Record<string, unknown> = {
              type: dtype,
            };
            if (bulk) {
              payload.scope = 'manifest_rows';
              payload.ids = bulkManifestRowIds;
            } else {
              if (!item) return;
              payload.scope = 'items';
              payload.ids = [item.id];
            }
            if (dtype === 'broken') {
              payload.pct_loss = Number.parseInt(pct, 10);
              payload.description = desc.trim();
            }
            await onSubmit(payload);
          }}
        >
          Record dispute
        </Button>
      </DialogActions>
    </Dialog>
  );
}
