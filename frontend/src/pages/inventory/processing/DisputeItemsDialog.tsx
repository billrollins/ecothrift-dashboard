/**
 * Mark checked-in items as disputed (Ashley, Dash Updates #1): from a Prior check-ins row, pick the item(s), what is
 * wrong and how much of its value is lost. It marks the item (the "Disputed N%" chip); it does not file a claim with
 * the supplier (the truck claim counts broken and missing only, until Bill says otherwise). Saves through the item's
 * processing patch, which leaves status and price alone. Only items on the shelf can take it.
 */
import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel,
  InputAdornment, InputLabel, MenuItem, Select, Stack, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { apiErrorMessage } from '../../../utils/apiError';
import type { ProcessingItemDisputeType, ProcessingWorkspaceItemDTO } from '../../../types/inventory.types';

/** The words here in one place, so Spanish is a later swap. */
export const DISPUTE_COPY = {
  title: 'Mark as disputed',
  items: 'Which items',
  soldAlready: 'Not on the shelf',
  type: "What's wrong",
  pct: 'Value lost',
  pctHelp: '% of its value lost (0 to 100)',
  description: 'Describe it',
  note: 'This marks the item. It does not file a claim with the supplier.',
  cancel: 'Cancel',
  save: 'Mark disputed',
  clear: 'Clear dispute',
  pickOne: 'Pick at least one item.',
  needType: "Pick what's wrong.",
  needPct: 'Say how much of its value is lost (0 to 100).',
} as const;

export const DISPUTE_TYPES: { value: Exclude<ProcessingItemDisputeType, 'undelivered'>; label: string }[] = [
  { value: 'broken', label: 'Broken' },
  { value: 'missing_pieces', label: 'Missing pieces' },
  { value: 'cosmetic_damage', label: 'Cosmetic damage' },
  { value: 'missing_critical_piece', label: 'Missing key piece' },
  { value: 'bad_condition', label: 'Bad condition' },
  { value: 'other', label: 'Other' },
];

export interface DisputeResult {
  saved: number;
  failed: { sku: string; why: string }[];
}

export function DisputeItemsDialog({
  open,
  items,
  onClose,
  patch,
}: {
  open: boolean;
  /** The check-in's items. */
  items: ProcessingWorkspaceItemDTO[];
  onClose: (result?: DisputeResult) => void;
  /** Save one item's dispute (the processing patch). */
  patch: (itemId: number, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'));
  const onShelf = items.filter((it) => it.status === 'on_shelf');
  const disputed = onShelf.filter((it) => it.dispute_type);
  const first = disputed[0];
  const [picked, setPicked] = useState<number[]>([]);
  const [type, setType] = useState<string>('');
  const [pct, setPct] = useState('');
  const [description, setDescription] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    // One item: it is picked. An item already disputed: its dispute is shown to change or clear.
    setPicked(onShelf.length === 1 ? [onShelf[0].id] : disputed.map((it) => it.id));
    setType(first?.dispute_type && first.dispute_type !== 'undelivered' ? first.dispute_type : '');
    setPct(first?.dispute_pct_loss != null ? String(first.dispute_pct_loss) : '');
    setDescription(first?.dispute_description ?? '');
    setProblem('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = async (payload: Record<string, unknown>) => {
    setBusy(true);
    const result: DisputeResult = { saved: 0, failed: [] };
    // Each item in turn; one that fails does not stop the others.
    for (const it of onShelf.filter((x) => picked.includes(x.id))) {
      try {
        await patch(it.id, payload);
        result.saved += 1;
      } catch (err) {
        result.failed.push({ sku: it.sku, why: apiErrorMessage(err, 'Could not save') });
      }
    }
    setBusy(false);
    if (result.failed.length) {
      setProblem(result.failed.map((f) => `${f.sku}: ${f.why}`).join(' · '));
      return;
    }
    onClose(result);
  };

  const save = () => {
    const n = Number(pct);
    if (!picked.length) return setProblem(DISPUTE_COPY.pickOne);
    if (!type) return setProblem(DISPUTE_COPY.needType);
    if (pct.trim() === '' || !Number.isInteger(n) || n < 0 || n > 100) return setProblem(DISPUTE_COPY.needPct);
    void run({ disputed: true, dispute_type: type, dispute_pct_loss: n, dispute_description: description.trim() });
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : () => onClose()} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle sx={{ fontWeight: 800 }}>{DISPUTE_COPY.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {items.length > 1 ? (
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase' }}>
                {DISPUTE_COPY.items}
              </Typography>
              {items.map((it) => {
                const shelf = it.status === 'on_shelf';
                return (
                  <FormControlLabel
                    key={it.id}
                    sx={{ display: 'flex', minHeight: 44 }}
                    disabled={!shelf || busy}
                    control={(
                      <Checkbox
                        checked={picked.includes(it.id)}
                        onChange={(e) => setPicked((now) => (e.target.checked ? [...now, it.id] : now.filter((id) => id !== it.id)))}
                      />
                    )}
                    label={(
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {it.sku}
                        {it.dispute_type ? ` · ${it.dispute_pct_loss ?? 0}%` : ''}
                        {!shelf ? ` · ${DISPUTE_COPY.soldAlready}` : ''}
                      </Typography>
                    )}
                  />
                );
              })}
            </Box>
          ) : null}
          <FormControl fullWidth size="small">
            <InputLabel id="dispute-type-label">{DISPUTE_COPY.type}</InputLabel>
            <Select labelId="dispute-type-label" label={DISPUTE_COPY.type} value={type} disabled={busy}
              onChange={(e) => setType(String(e.target.value))}>
              {DISPUTE_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" label={DISPUTE_COPY.pct} value={pct} disabled={busy} helperText={DISPUTE_COPY.pctHelp}
            onChange={(e) => setPct(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
            slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { inputMode: 'numeric' } }} />
          <TextField size="small" label={DISPUTE_COPY.description} value={description} disabled={busy} multiline minRows={2}
            onChange={(e) => setDescription(e.target.value)} />
          <Typography variant="caption" color="text.secondary">{DISPUTE_COPY.note}</Typography>
          {problem ? <Alert severity="warning">{problem}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
        {disputed.length ? (
          <Button color="warning" disabled={busy} sx={{ mr: 'auto' }}
            onClick={() => {
              if (!picked.length) return setProblem(DISPUTE_COPY.pickOne);
              void run({ disputed: false });
            }}>
            {DISPUTE_COPY.clear}
          </Button>
        ) : null}
        <Button onClick={() => onClose()} disabled={busy}>{DISPUTE_COPY.cancel}</Button>
        <Button variant="contained" onClick={save} disabled={busy}>{DISPUTE_COPY.save}</Button>
      </DialogActions>
    </Dialog>
  );
}
