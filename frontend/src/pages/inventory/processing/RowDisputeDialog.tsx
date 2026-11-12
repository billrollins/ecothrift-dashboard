/**
 * Dispute a manifest row straight from the Processing queue (Dash Update #100, Bill 2026-11-11: "Dispute is
 * unit/manifest ROW based. NOT Product or Item ... It does not make sense to create a product and check in just to
 * dispute that it did not come"). Pick what is wrong and how many units; nothing else is made. The units leave what
 * is left to process and count in the truck's dispute numbers (header, Close the truck, the B-Stock list). Undo puts
 * them back. Server: `services/row_disputes.py`.
 */
import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRowDispute, getRowDisputes, rowDisputesKey, undoRowDispute, type RowDisputeDTO,
} from '../../../api/rowDisputes.api';
import { truckPalletsKey } from '../../../hooks/useTruckPallets';
import { truckPlanKey, truckSummaryKey } from '../../../hooks/useTruckPlan';
import { apiErrorMessage } from '../../../utils/apiError';
import {
  disputeRetail, initialRowDisputeForm, PARTIAL_REASONS, rowDisputePayload, rowDisputeProblems, type RowDisputeForm,
} from './rowDispute';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function DisputeLine({ d, onUndo, busy }: { d: RowDisputeDTO; onUndo: () => void; busy: boolean }) {
  const undone = Boolean(d.undone_at);
  const when = d.at ? new Date(d.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 0.75, borderTop: 1, borderColor: 'divider', opacity: undone ? 0.55 : 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, textDecoration: undone ? 'line-through' : 'none' }}>
          {d.units} · {d.reason_label}{PARTIAL_REASONS.includes(d.reason) ? ` · ${d.pct_lost}% of value lost` : ''}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" noWrap title={d.note || undefined}>
          {[d.by, when, d.note].filter(Boolean).join(' · ')}
          {undone ? ` · Undone${d.undone_by ? ` by ${d.undone_by}` : ''}` : ''}
        </Typography>
      </Box>
      {!undone && <Button size="small" onClick={onUndo} disabled={busy}>Undo</Button>}
    </Stack>
  );
}

export function RowDisputeDialog({
  open,
  orderId,
  processingRowId,
  onClose,
}: {
  open: boolean;
  orderId: number;
  processingRowId: number | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const enabled = open && processingRowId != null;
  const data = useQuery({
    queryKey: rowDisputesKey(orderId, processingRowId ?? 0),
    queryFn: () => getRowDisputes(orderId, processingRowId as number),
    enabled,
  });
  const [form, setForm] = useState<RowDisputeForm>(() => initialRowDisputeForm(0));
  const [tried, setTried] = useState(false);
  const remaining = data.data?.row.remaining ?? 0;

  // A fresh form each time the window opens on a row (and once its numbers arrive).
  const loadedFor = data.data ? `${processingRowId}:${data.dataUpdatedAt}` : '';
  const [formFor, setFormFor] = useState('');
  useEffect(() => {
    if (!open) {
      setFormFor('');
      setTried(false);
      return;
    }
    if (data.data && !formFor) {
      setForm(initialRowDisputeForm(data.data.row.remaining, data.data.default_pct_lost));
      setFormFor(loadedFor);
    }
  }, [open, data.data, formFor, loadedFor]);

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['processing-workspace', orderId] });
    void qc.invalidateQueries({ queryKey: ['processing-row-detail', orderId] });
    void qc.invalidateQueries({ queryKey: truckSummaryKey(orderId) });
    void qc.invalidateQueries({ queryKey: truckPlanKey(orderId) });
    void qc.invalidateQueries({ queryKey: truckPalletsKey(orderId) });
  };
  const save = useMutation({
    mutationFn: () => createRowDispute(orderId, rowDisputePayload(processingRowId as number, form)),
    onSuccess: (res) => {
      qc.setQueryData(rowDisputesKey(orderId, processingRowId as number), res);
      refreshAll();
      onClose();
    },
  });
  const undo = useMutation({
    mutationFn: (id: number) => undoRowDispute(orderId, id),
    onSuccess: (res) => {
      qc.setQueryData(rowDisputesKey(orderId, processingRowId as number), res);
      setForm((f) => ({ ...f, units: String(res.row.remaining) }));
      refreshAll();
    },
  });

  const problems = data.data ? rowDisputeProblems(form, remaining) : [];
  const busy = save.isPending || undo.isPending;
  const reasons = data.data?.reasons ?? [];
  const partial = form.reason !== '' && PARTIAL_REASONS.includes(form.reason);
  const atStake = disputeRetail(form, data.data?.row.unit_retail ?? null);
  const set = (patch: Partial<RowDisputeForm>) => setForm((f) => ({ ...f, ...patch }));
  const submit = () => {
    setTried(true);
    if (!problems.length) save.mutate();
  };
  const row = data.data?.row;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={phone} fullWidth maxWidth="sm" aria-labelledby="row-dispute-title">
      <DialogTitle id="row-dispute-title" sx={{ pb: 0.5 }}>
        Dispute row {row?.row_number ?? ''}
        <Typography variant="body2" color="text.secondary" noWrap title={row?.title}>{row?.title ?? ' '}</Typography>
      </DialogTitle>
      <DialogContent>
        {data.isLoading && <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={24} /></Box>}
        {data.isError && <Alert severity="error">{apiErrorMessage(data.error, 'Could not load this row.')}</Alert>}
        {row && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`${row.quantity} on the manifest`} />
              <Chip size="small" color={remaining ? 'default' : 'success'} variant="outlined" label={`${remaining} left to process`} />
              {row.disputed > 0 && <Chip size="small" color="warning" variant="outlined" label={`${row.disputed} disputed`} />}
            </Stack>

            {remaining > 0 ? (
              <>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>What is wrong</Typography>
                  <ToggleButtonGroup
                    exclusive
                    value={form.reason}
                    onChange={(_, v) => v && set({ reason: v })}
                    size="small"
                    sx={{ display: 'flex', flexWrap: 'wrap', mt: 0.5, '& .MuiToggleButton-root': { flex: '1 1 auto', textTransform: 'none' } }}
                  >
                    {reasons.map((r) => <ToggleButton key={r.value} value={r.value}>{r.label}</ToggleButton>)}
                  </ToggleButtonGroup>
                </Box>
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    label="How many units"
                    value={form.units}
                    onChange={(e) => set({ units: e.target.value })}
                    size="small"
                    inputProps={{ inputMode: 'numeric', 'aria-label': 'How many units' }}
                    helperText={`Up to ${remaining}`}
                    sx={{ width: 150 }}
                  />
                  {partial && (
                    <TextField
                      label="Value lost"
                      value={form.pctLost}
                      onChange={(e) => set({ pctLost: e.target.value })}
                      size="small"
                      inputProps={{ inputMode: 'numeric', 'aria-label': 'Value lost' }}
                      InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                      helperText="Of each unit's value"
                      sx={{ width: 150 }}
                    />
                  )}
                </Stack>
                <TextField
                  label="Note"
                  placeholder="Optional: what you saw, which pallet"
                  value={form.note}
                  onChange={(e) => set({ note: e.target.value })}
                  size="small"
                  multiline
                  minRows={2}
                />
                <Typography variant="caption" color="text.secondary">
                  No product or check-in is made. The units come off what is left to process and count in the truck's
                  dispute (the header and Close the truck). Undo puts them back.
                  {atStake != null ? ` About ${money(atStake)} of manifest retail.` : ''}
                </Typography>
              </>
            ) : (
              <Alert severity="info">
                Nothing is left to process on this row. To change a dispute, undo it below; to dispute items already
                checked in, open the row.
              </Alert>
            )}

            {tried && problems.length > 0 && <Alert severity="warning">{problems[0]}</Alert>}
            {save.isError && <Alert severity="error">{apiErrorMessage(save.error, 'The dispute was not saved.')}</Alert>}
            {undo.isError && <Alert severity="error">{apiErrorMessage(undo.error, 'Undo did not work.')}</Alert>}

            {data.data && data.data.disputes.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>Disputes on this row</Typography>
                {data.data.disputes.map((d) => (
                  <DisputeLine key={d.id} d={d} busy={busy} onUndo={() => undo.mutate(d.id)} />
                ))}
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>{remaining > 0 ? 'Cancel' : 'Close'}</Button>
        {remaining > 0 && (
          <Button variant="contained" color="warning" onClick={submit} disabled={busy || !row}
            startIcon={save.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}>
            Dispute {form.units.trim() || ''} unit{form.units.trim() === '1' ? '' : 's'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
