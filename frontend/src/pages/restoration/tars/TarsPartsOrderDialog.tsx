import Close from '@mui/icons-material/Close';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type {
  RestorationPartDTO,
  RestorationPartsOrderDTO,
  RestorationPartsOrderWritePayload,
} from '../../../types/inventory.types';
import { parseMoney, parseQty } from './tarsMoney';
import { moneyNumber } from './tarsPartsOrders';
import { fmtUsd } from './tarsProfit';

export interface TarsPartsOrderDialogProps {
  open: boolean;
  parts: RestorationPartDTO[];
  existing?: RestorationPartsOrderDTO | null;
  gradeOptions: string[];
  defaultGrade?: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: RestorationPartsOrderWritePayload) => void;
  onDelete?: () => void;
}

const hairline = '#e2e8f0';
const accent = '#2e7d32';
const accentSoft = 'rgba(46, 125, 50, 0.08)';
const accentBorder = 'rgba(46, 125, 50, 0.32)';
const GRID = '32px minmax(0, 1fr) 64px 80px';
const ROW_HEIGHT = 40;

export function TarsPartsOrderDialog({
  open,
  parts,
  existing,
  gradeOptions,
  defaultGrade = '',
  saving = false,
  onClose,
  onSave,
  onDelete,
}: TarsPartsOrderDialogProps) {
  const [name, setName] = useState('');
  const [targetGrade, setTargetGrade] = useState('');
  const [shipping, setShipping] = useState('0');
  const [tax, setTax] = useState('0');
  const [fees, setFees] = useState('0');
  const [selected, setSelected] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? '');
    setTargetGrade(existing?.target_grade || defaultGrade || gradeOptions[0] || '');
    setShipping(existing ? String(moneyNumber(existing.shipping)) : '0');
    setTax(existing ? String(moneyNumber(existing.tax)) : '0');
    setFees(existing ? String(moneyNumber(existing.fees)) : '0');
    const next: Record<number, number> = {};
    for (const line of existing?.lines ?? []) {
      next[line.part_id] = line.qty;
    }
    setSelected(next);
  }, [open, existing, defaultGrade]);

  const lines = useMemo(
    () =>
      parts
        .filter((part) => selected[part.id] != null)
        .map((part) => ({ part, qty: selected[part.id] })),
    [parts, selected],
  );
  const subtotal = lines.reduce((sum, row) => sum + moneyNumber(row.part.unit_price) * row.qty, 0);
  const extras = parseMoney(shipping) + parseMoney(tax) + parseMoney(fees);
  const total = subtotal + extras;
  const canSave = name.trim() !== '' && targetGrade.trim() !== '' && lines.length > 0 && !saving;
  const grades = useMemo(() => {
    const extras = [existing?.target_grade, defaultGrade, targetGrade]
      .map((grade) => (grade || '').trim())
      .filter((grade) => grade && !gradeOptions.includes(grade));
    return extras.length ? [...gradeOptions, ...extras] : gradeOptions;
  }, [gradeOptions, existing, defaultGrade, targetGrade]);
  const readOnly = Boolean(existing && existing.status !== 'draft');

  function toggle(part: RestorationPartDTO) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[part.id] != null) delete next[part.id];
      else next[part.id] = part.qty || 1;
      return next;
    });
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <Box sx={{ px: 2.25, py: 1.35, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
          {existing ? existing.name || 'Edit order' : 'New order'}
        </Typography>
        <IconButton aria-label="Close order" onClick={onClose}>
          <Close />
        </IconButton>
      </Box>
      <Stack spacing={1.25} sx={{ px: 2.25, pb: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.4fr 1fr' }, gap: 1 }}>
          <TextField
            size="small"
            label="Order name"
            value={name}
            disabled={readOnly}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            select
            required
            size="small"
            label="Grade this order achieves"
            value={targetGrade}
            disabled={readOnly}
            onChange={(e) => setTargetGrade(e.target.value)}
          >
            {!targetGrade ? <MenuItem value="">Choose a grade</MenuItem> : null}
            {grades.map((grade) => (
              <MenuItem key={grade} value={grade}>
                {grade}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Box sx={{ border: `1px solid ${hairline}`, borderRadius: 1.5, overflow: 'hidden' }}>
          {parts.length === 0 ? (
            <Typography sx={{ px: 1.25, py: 1.5, fontSize: '0.85rem', color: '#64748b', minHeight: ROW_HEIGHT }}>
              Add parts on the list tab first.
            </Typography>
          ) : (
            parts.map((part) => {
              const on = selected[part.id] != null;
              const qty = selected[part.id] ?? part.qty;
              return (
                <Box
                  key={part.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: GRID,
                    gap: 0.75,
                    alignItems: 'center',
                    minHeight: ROW_HEIGHT,
                    px: 1,
                    borderBottom: `1px solid ${hairline}`,
                    bgcolor: on ? accentSoft : '#fff',
                    borderLeft: `3px solid ${on ? accent : 'transparent'}`,
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={on}
                    disabled={readOnly}
                    onChange={() => toggle(part)}
                    sx={{ p: 0.25, '&.Mui-checked': { color: accent } }}
                    inputProps={{ 'aria-label': `Include ${part.description || 'part'}` }}
                  />
                  <Typography noWrap sx={{ fontSize: '0.84rem', fontWeight: 700 }}>
                    {part.description || part.part_number || 'Part'}
                  </Typography>
                  <TextField
                    size="small"
                    type="number"
                    value={qty}
                    disabled={readOnly || !on}
                    onChange={(e) =>
                      setSelected((prev) => ({ ...prev, [part.id]: parseQty(e.target.value) }))
                    }
                    slotProps={{ htmlInput: { min: 1 }, input: { sx: { fontSize: 13, py: 0.4 } } }}
                  />
                  <Typography
                    sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13, fontWeight: 800, textAlign: 'right' }}
                  >
                    {fmtUsd(moneyNumber(part.unit_price) * qty)}
                  </Typography>
                </Box>
              );
            })
          )}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1 }}>
          <TextField
            size="small"
            label="Shipping"
            type="number"
            value={shipping}
            disabled={readOnly}
            onChange={(e) => setShipping(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
          />
          <TextField
            size="small"
            label="Tax"
            type="number"
            value={tax}
            disabled={readOnly}
            onChange={(e) => setTax(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
          />
          <TextField
            size="small"
            label="Fees"
            type="number"
            value={fees}
            disabled={readOnly}
            onChange={(e) => setFees(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
          />
        </Box>

        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minHeight: 36 }}>
          <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>
            {lines.length} item{lines.length === 1 ? '' : 's'}
            {targetGrade ? ` · ${targetGrade}` : ''}
          </Typography>
          <Typography sx={{ fontWeight: 900, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
            {fmtUsd(total)}
          </Typography>
        </Stack>

        <Stack direction="row" justifyContent="space-between">
          <Box sx={{ minWidth: 88 }}>
            {existing && onDelete && existing.status === 'draft' ? (
              <Button color="error" onClick={onDelete} disabled={saving}>
                Delete
              </Button>
            ) : null}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!canSave || readOnly}
              onClick={() =>
                onSave({
                  name: name.trim(),
                  target_grade: targetGrade,
                  shipping: parseMoney(shipping),
                  tax: parseMoney(tax),
                  fees: parseMoney(fees),
                  lines: lines.map((row) => ({ part_id: row.part.id, qty: row.qty })),
                })
              }
              sx={{ bgcolor: accent, borderColor: accentBorder }}
            >
              Save order
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Dialog>
  );
}
