import Add from '@mui/icons-material/Add';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { ProcessingWorkspaceRowDTO } from '../../../../types/inventory.types';

const CONDITION_OPTIONS = ['New', 'Like New', 'Very Good', 'Used Good', 'Used Fair', 'Salvage'];

const DISPATCH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'on_shelf', label: 'On shelf / floor' },
  { value: 'restoration', label: 'Restoration' },
  { value: 'back_storage', label: 'Back storage' },
  { value: 'online_sales', label: 'Online sales' },
  { value: 'salvage', label: 'Salvage' },
];

export type BulkDispositionGroupForm = {
  count: number;
  condition: string;
  dispatch: string;
  price: string;
  /** null = normal check-in counts toward printed labels */
  outcome: 'check_in' | 'broken' | 'undelivered';
  pct: string;
  desc: string;
};

function pendingCountForRows(rows: ProcessingWorkspaceRowDTO[]): number {
  return rows.reduce((acc, r) => {
    const fromItems = r.items.filter((i) => i.status === 'intake' || i.status === 'processing').length;
    if (fromItems > 0) return acc + fromItems;
    const lazy = r.pendingItemCount ?? 0;
    return acc + lazy;
  }, 0);
}

export interface BulkDispositionModalProps {
  open: boolean;
  onClose: () => void;
  processingRowIds: number[];
  rows: ProcessingWorkspaceRowDTO[];
  loading: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

export function BulkDispositionModal({ open, onClose, processingRowIds, rows, loading, onSubmit }: BulkDispositionModalProps) {
  const pending = useMemo(() => pendingCountForRows(rows), [rows]);
  const defaultRetail = rows[0]?.unitRetail ?? '';
  const defaultPrice = rows[0]?.price ?? '';

  const [retail, setRetail] = useState('');
  const [groups, setGroups] = useState<BulkDispositionGroupForm[]>([
    { count: 0, condition: CONDITION_OPTIONS[3], dispatch: 'on_shelf', price: '', outcome: 'check_in', pct: '50', desc: '' },
  ]);

  useEffect(() => {
    if (!open) return;
    setRetail(defaultRetail ?? '');
    setGroups([
      {
        count: pending,
        condition: CONDITION_OPTIONS[3],
        dispatch: 'on_shelf',
        price: defaultPrice != null ? String(defaultPrice) : '',
        outcome: 'check_in',
        pct: '50',
        desc: '',
      },
    ]);
  }, [open, pending, defaultRetail, defaultPrice]);

  const titles = useMemo(() => rows.map((r) => `#${r.rowNum} ${r.title || r.sku || ''}`.slice(0, 80)), [rows]);

  const totalGrouped = groups.reduce((s, g) => s + Math.max(0, g.count), 0);
  const validTotals = pending > 0 && totalGrouped === pending && groups.every((g) => g.count > 0);
  const validBroken = groups.every((g) => {
    if (g.outcome !== 'broken') return true;
    return g.desc.trim().length > 0 && Number.parseInt(g.pct, 10) >= 0 && Number.parseInt(g.pct, 10) <= 100;
  });
  const valid = validTotals && validBroken;

  const printCount = groups.reduce((s, g) => (g.outcome === 'check_in' ? s + g.count : s), 0);

  const updateGroup = (i: number, patch: Partial<BulkDispositionGroupForm>) => {
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  };

  const addSplit = () => {
    setGroups((gs) => {
      if (gs.length === 0) return gs;
      const last = gs[gs.length - 1];
      const half = Math.floor(last.count / 2);
      if (half < 1 || last.count < 2) return gs;
      const rest = last.count - half;
      return [...gs.slice(0, -1), { ...last, count: half }, { ...last, count: rest, outcome: last.outcome }];
    });
  };

  const removeGroup = (i: number) => {
    setGroups((gs) => {
      if (gs.length <= 1) return gs;
      const next = gs.filter((_, j) => j !== i);
      const lost = gs[i].count;
      next[0] = { ...next[0], count: next[0].count + lost };
      return next;
    });
  };

  return (
    <Dialog open={open} onClose={() => !loading && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>Bulk disposition</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Summary: <strong>{processingRowIds.length}</strong> processing line(s), <strong>{pending}</strong> pending unit(s) to assign.
        </Typography>
        <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
          {titles.map((t) => (
            <Typography key={t} variant="caption" display="block">
              {t}
            </Typography>
          ))}
        </Alert>
        <TextField label="Retail (default for check-in arms)" size="small" value={retail} onChange={(e) => setRetail(e.target.value)} />
        {groups.map((g, i) => (
          <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Group {i + 1}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Outcome determines whether units print shelf labels vs dispute-only.
            </Typography>
            <RadioGroup row value={g.outcome} onChange={(e) => updateGroup(i, { outcome: e.target.value as BulkDispositionGroupForm['outcome'] })}>
              <FormControlLabel value="check_in" control={<Radio size="small" />} label="Check in" />
              <FormControlLabel value="broken" control={<Radio size="small" />} label="Broken" />
              <FormControlLabel value="undelivered" control={<Radio size="small" />} label="Undelivered" />
            </RadioGroup>
            <TextField
              label="Count"
              type="number"
              size="small"
              fullWidth
              sx={{ mt: 1, mb: 1 }}
              inputProps={{ min: 1, max: pending }}
              value={g.count}
              onChange={(e) => updateGroup(i, { count: Number.parseInt(e.target.value, 10) || 0 })}
            />
            <TextField
              select
              label="Condition"
              size="small"
              fullWidth
              sx={{ mb: 1 }}
              value={g.condition}
              onChange={(e) => updateGroup(i, { condition: e.target.value })}
            >
              {CONDITION_OPTIONS.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Dispatch"
              size="small"
              fullWidth
              sx={{ mb: 1 }}
              value={g.dispatch}
              onChange={(e) => updateGroup(i, { dispatch: e.target.value })}
            >
              {DISPATCH_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Shelf price" size="small" fullWidth value={g.price} onChange={(e) => updateGroup(i, { price: e.target.value })} />
            {g.outcome === 'broken' ?
              <>
                <TextField
                  label="% loss"
                  size="small"
                  type="number"
                  sx={{ mt: 1 }}
                  inputProps={{ min: 0, max: 100 }}
                  value={g.pct}
                  onChange={(e) => updateGroup(i, { pct: e.target.value })}
                />
                <TextField
                  label="Description"
                  size="small"
                  multiline
                  minRows={2}
                  value={g.desc}
                  onChange={(e) => updateGroup(i, { desc: e.target.value })}
                />
              </>
            : null}
            {groups.length > 1 ? (
              <IconButton size="small" aria-label="Remove group" onClick={() => removeGroup(i)} sx={{ mt: 1 }}>
                <DeleteOutline />
              </IconButton>
            ) : null}
          </Box>
        ))}
        <Button size="small" startIcon={<Add />} onClick={addSplit} disabled={groups.reduce((s, g) => s + g.count, 0) < 2}>
          Split last group in half
        </Button>
        <Typography variant="caption" color={totalGrouped === pending ? 'text.secondary' : 'error'}>
          Group totals {totalGrouped} / {pending} pending
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Planned shelf labels after success: <strong>{printCount}</strong> unit(s).
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={loading || !valid}
          onClick={async () => {
            await onSubmit({
              processing_row_ids: processingRowIds,
              retail: retail.trim() || undefined,
              groups: groups.map((g) => ({
                count: g.count,
                condition: g.condition,
                dispatch: g.dispatch,
                price: g.price.trim() || undefined,
                disputed:
                  g.outcome === 'broken' ?
                    {
                      type: 'broken',
                      pct_loss: Number.parseInt(g.pct, 10),
                      description: g.desc.trim(),
                    }
                  : g.outcome === 'undelivered' ?
                    { type: 'undelivered' }
                  : null,
              })),
            });
          }}
        >
          {printCount > 0 ? `Print ${printCount} label(s) + disposition` : 'Apply disposition'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
