import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import OpenInNew from '@mui/icons-material/OpenInNew';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TarsPartLine, TarsProcurementGroup } from './tarsWorkTypes';
import { newId } from './tarsWorkRollup';
import { newPartLine, orderPartLineTotal, partUnitPrice } from './tarsPartsListSession';
import { formatUsd as fmtMoney2, parseMoney, parseQty } from './tarsMoney';
import { absoluteUrl, urlDomain } from './tarsUrl';

export type TarsPartsOrderSavePayload = {
  order: TarsProcurementGroup;
  partUpdates: Array<Pick<TarsPartLine, 'id' | 'description' | 'url' | 'qty' | 'unitPriceEstimate'>>;
  /** Parts created inline in this dialog - appended to the master parts list. */
  newParts: TarsPartLine[];
};

export interface TarsPartsOrderDialogProps {
  open: boolean;
  parts: TarsPartLine[];
  existing?: TarsProcurementGroup | null;
  orderIndex?: number;
  onClose: () => void;
  onSave: (payload: TarsPartsOrderSavePayload) => void;
  onDelete?: () => void;
}

const ink = '#0f172a';
const muted = '#64748b';
const hairline = '#e2e8f0';
const subtleBg = '#f8fafc';
const accent = '#2e7d32';
const accentSoft = 'rgba(46, 125, 50, 0.08)';
const accentBorder = 'rgba(46, 125, 50, 0.32)';
const numeric = { fontVariantNumeric: 'tabular-nums' } as const;

const NEBRASKA_TAX_PCT = 7;

const round2 = (n: number) => Math.round(n * 100) / 100;

function fmtAmountField(raw: string): string {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return '';
  // No thousands separators - commas render as an empty value in
  // <input type="number">.
  return n.toFixed(2);
}

function fmtPctField(raw: string): string {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

const ORDER_PART_GRID =
  '32px minmax(0, 2fr) minmax(0, 1.2fr) 52px 104px 80px 32px';

// Shared compact money-field styling so Shipping/Fees/Tax share identical height,
// fill, radius, and value proportion.
const MONEY_FIELD_SX = {
  '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 2 },
  '& .MuiInputBase-input': { fontSize: 14 },
} as const;

function OrderPartLineRow({
  part,
  selected,
  displayQty,
  lineTotal,
  onToggle,
  onChange,
  onQtyChange,
}: {
  part: TarsPartLine;
  selected: boolean;
  displayQty: number;
  lineTotal: number;
  onToggle: () => void;
  onChange: (patch: Partial<TarsPartLine>) => void;
  onQtyChange: (raw: string) => void;
}) {
  const inputSx = { fontSize: 14, py: 0.5 };
  const [urlEditing, setUrlEditing] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const hasUrl = part.url.trim().length > 0;
  const urlDisplay = urlEditing ? part.url : hasUrl ? urlDomain(part.url) : '';

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: ORDER_PART_GRID,
        gap: 0.6,
        alignItems: 'center',
        py: 0.45,
        px: 0.6,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: selected ? accentBorder : hairline,
        bgcolor: selected ? accentSoft : '#fff',
        transition: 'background-color 150ms ease, border-color 150ms ease',
      }}
    >
      <Checkbox
        size="small"
        checked={selected}
        onChange={() => onToggle()}
        sx={{ p: 0.25, color: '#cbd5e1', '&.Mui-checked': { color: accent } }}
        inputProps={{ 'aria-label': 'Include part on order' }}
      />
      <TextField
        size="small"
        placeholder="Description"
        value={part.description}
        onChange={(e) => onChange({ description: e.target.value })}
        slotProps={{ input: { sx: inputSx } }}
      />
      <TextField
        size="small"
        inputRef={urlInputRef}
        placeholder="Add link"
        value={urlDisplay}
        onChange={(e) => onChange({ url: e.target.value })}
        onFocus={() => setUrlEditing(true)}
        onBlur={() => setUrlEditing(false)}
        slotProps={{
          input: {
            sx: inputSx,
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 0.25, ml: -0.25 }}>
                <Box
                  component="span"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    urlInputRef.current?.focus();
                    setUrlEditing(true);
                  }}
                  sx={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: hasUrl ? accent : '#cbd5e1',
                    cursor: 'text',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Edit
                </Box>
              </InputAdornment>
            ),
          },
        }}
      />
      <Tooltip title={selected ? 'Order qty (does not change parts list)' : 'Parts list qty'} arrow>
        <TextField
          size="small"
          placeholder="Qty"
          type="number"
          value={displayQty}
          onChange={(e) => onQtyChange(e.target.value)}
          slotProps={{ htmlInput: { min: 1 }, input: { sx: inputSx } }}
        />
      </Tooltip>
      <TextField
        size="small"
        placeholder="Price"
        type="number"
        value={part.unitPriceEstimate || ''}
        onChange={(e) => onChange({ unitPriceEstimate: parseMoney(e.target.value) })}
        slotProps={{
          htmlInput: { min: 0, step: 0.01 },
          input: {
            sx: inputSx,
            startAdornment: <InputAdornment position="start">$</InputAdornment>,
          },
        }}
      />
      <Typography fontFamily="monospace" fontWeight={800} textAlign="right" sx={{ fontSize: 13, pr: 0.25, ...numeric }}>
        {fmtMoney2(lineTotal)}
      </Typography>
      {part.url.trim() ?
        <Tooltip title="Open part link" arrow>
          <IconButton
            component="a"
            href={absoluteUrl(part.url)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open part link"
            size="small"
            sx={{ p: 0.25, color: accent }}
          >
            <OpenInNew sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      : <Box sx={{ width: 28, height: 28 }} />}
    </Box>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fullWidth
      size="small"
      type="number"
      slotProps={{
        htmlInput: { min: 0, step: 0.01, style: { fontVariantNumeric: 'tabular-nums' } },
        input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
      }}
      sx={MONEY_FIELD_SX}
    />
  );
}

export function TarsPartsOrderDialog({
  open,
  parts,
  existing,
  orderIndex = 0,
  onClose,
  onSave,
  onDelete,
}: TarsPartsOrderDialogProps) {
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  const [draftParts, setDraftParts] = useState<Record<string, TarsPartLine>>({});
  const [extraPartIds, setExtraPartIds] = useState<string[]>([]);
  const [partQtyOverrides, setPartQtyOverrides] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [shipping, setShipping] = useState('');
  const [taxMode, setTaxMode] = useState<'amount' | 'percent'>('amount');
  const [taxInput, setTaxInput] = useState('');
  const [taxFocused, setTaxFocused] = useState(false);
  const [fees, setFees] = useState('');
  const [notes, setNotes] = useState('');
  const initialSnapshotRef = useRef('');

  useEffect(() => {
    if (!open) return;
    const nextDraftParts = Object.fromEntries(parts.map((p) => [p.id, { ...p }]));
    const nextSelected = existing?.partIds ?? [];
    const overrides: Record<string, number> = { ...(existing?.partQtyOverrides ?? {}) };
    for (const id of nextSelected) {
      if (overrides[id] == null) {
        const part = parts.find((p) => p.id === id);
        if (part) overrides[id] = part.qty || 1;
      }
    }
    const nextName = existing?.supplierName ?? '';
    const nextShipping = existing != null ? String(existing.shipping) : '';
    const nextTax = existing != null ? String(existing.tax) : '';
    const nextFees = existing != null ? String(existing.fees) : '';
    const nextNotes = existing?.notes ?? '';
    setDraftParts(nextDraftParts);
    setExtraPartIds([]);
    setSelectedPartIds(nextSelected);
    setPartQtyOverrides(overrides);
    setName(nextName);
    setShipping(nextShipping);
    setTaxMode('amount');
    setTaxInput(nextTax);
    setTaxFocused(false);
    setFees(nextFees);
    setNotes(nextNotes);
    initialSnapshotRef.current = JSON.stringify({
      draftParts: nextDraftParts,
      extraPartIds: [],
      selectedPartIds: nextSelected,
      partQtyOverrides: overrides,
      name: nextName,
      shipping: nextShipping,
      taxInput: nextTax,
      fees: nextFees,
      notes: nextNotes,
    });
  }, [open, existing, parts]);

  const isDirty = () =>
    JSON.stringify({
      draftParts,
      extraPartIds,
      selectedPartIds,
      partQtyOverrides,
      name,
      shipping,
      taxInput,
      fees,
      notes,
    }) !== initialSnapshotRef.current;

  const handleDialogClose = (_event: unknown, reason?: string) => {
    // Guard against accidental data loss on backdrop click / escape - the
    // explicit Cancel and close buttons still discard immediately.
    if (
      (reason === 'backdropClick' || reason === 'escapeKeyDown') &&
      isDirty() &&
      !window.confirm('Discard unsaved order changes?')
    ) {
      return;
    }
    onClose();
  };

  const selectedSet = useMemo(() => new Set(selectedPartIds), [selectedPartIds]);

  const orderedParts = useMemo<TarsPartLine[]>(() => {
    const existingRows = parts.map((p) => draftParts[p.id] ?? p);
    const extraRows = extraPartIds
      .map((id) => draftParts[id])
      .filter((p): p is TarsPartLine => p != null);
    return [...existingRows, ...extraRows];
  }, [parts, draftParts, extraPartIds]);

  const addPart = () => {
    const part = newPartLine();
    setDraftParts((prev) => ({ ...prev, [part.id]: part }));
    setExtraPartIds((prev) => [...prev, part.id]);
    setSelectedPartIds((prev) => [...prev, part.id]);
    setPartQtyOverrides((prev) => ({ ...prev, [part.id]: 1 }));
  };

  const draftOrderBase: Omit<TarsProcurementGroup, 'tax'> = useMemo(
    () => ({
      id: existing?.id ?? newId(),
      supplierName: name.trim(),
      cartUrl: '',
      shipping: parseMoney(shipping),
      fees: parseMoney(fees),
      notes: notes.trim(),
      partIds: selectedPartIds,
      partQtyOverrides,
    }),
    [existing?.id, name, shipping, fees, notes, selectedPartIds, partQtyOverrides],
  );

  const partsCost = useMemo(() => {
    return selectedPartIds.reduce((sum, id) => {
      const part = draftParts[id];
      if (!part) return sum;
      const draftOrder: TarsProcurementGroup = { ...draftOrderBase, tax: 0 };
      return sum + orderPartLineTotal(draftOrder, part);
    }, 0);
  }, [selectedPartIds, draftParts, draftOrderBase]);

  const taxDollars = useMemo(() => {
    const raw = Number.parseFloat(taxInput);
    if (!Number.isFinite(raw) || raw < 0) return 0;
    if (taxMode === 'percent') return Math.round(((partsCost * raw) / 100) * 100) / 100;
    return Math.round(raw * 100) / 100;
  }, [taxInput, taxMode, partsCost]);

  const draftOrder: TarsProcurementGroup = useMemo(
    () => ({ ...draftOrderBase, tax: taxDollars }),
    [draftOrderBase, taxDollars],
  );

  const total = partsCost + draftOrder.shipping + draftOrder.tax + draftOrder.fees;
  const hasSelection = selectedPartIds.length > 0;

  const togglePart = (partId: string) => {
    setSelectedPartIds((prev) => {
      if (prev.includes(partId)) {
        setPartQtyOverrides((overrides) => {
          const next = { ...overrides };
          delete next[partId];
          return next;
        });
        return prev.filter((id) => id !== partId);
      }
      const part = draftParts[partId];
      if (part) {
        setPartQtyOverrides((overrides) => ({ ...overrides, [partId]: part.qty || 1 }));
      }
      return [...prev, partId];
    });
  };

  const updatePart = (partId: string, patch: Partial<TarsPartLine>) => {
    setDraftParts((prev) => ({
      ...prev,
      [partId]: { ...prev[partId], ...patch },
    }));
  };

  const updateQty = (partId: string, raw: string) => {
    const qty = parseQty(raw);
    if (selectedSet.has(partId)) {
      setPartQtyOverrides((prev) => ({ ...prev, [partId]: qty }));
    } else {
      updatePart(partId, { qty });
    }
  };

  const displayQty = (partId: string, part: TarsPartLine): number => {
    if (selectedSet.has(partId)) return partQtyOverrides[partId] ?? part.qty ?? 1;
    return part.qty || 1;
  };

  const lineTotalForPart = (partId: string, part: TarsPartLine): number => {
    const qty = displayQty(partId, part);
    return partUnitPrice(part) * qty;
  };

  const setTaxModeKeepValue = (mode: 'amount' | 'percent') => {
    if (mode === taxMode) return;
    const current = Number.parseFloat(taxInput);
    if (Number.isFinite(current)) {
      if (mode === 'percent') {
        const pct = partsCost > 0 ? round2((current / partsCost) * 100) : 0;
        setTaxInput(String(pct));
      } else {
        setTaxInput(String(round2((current / 100) * partsCost)));
      }
    }
    setTaxMode(mode);
  };

  const applyNebraskaTax = () => {
    setTaxMode('amount');
    setTaxInput(String(round2((partsCost * NEBRASKA_TAX_PCT) / 100)));
  };

  const handleSave = () => {
    if (!hasSelection) return;
    const partUpdates = parts.map((p) => {
      const draft = draftParts[p.id];
      if (!draft) return null;
      return {
        id: p.id,
        description: draft.description,
        url: draft.url,
        qty: draft.qty,
        unitPriceEstimate: draft.unitPriceEstimate,
      };
    }).filter((row): row is TarsPartsOrderSavePayload['partUpdates'][number] => row != null);
    const newParts = extraPartIds
      .map((id) => draftParts[id])
      .filter((p): p is TarsPartLine => p != null);
    onSave({ order: draftOrder, partUpdates, newParts });
    onClose();
  };

  const title = existing ? `Edit order ${orderIndex + 1}` : 'New order';
  const selectionChip = hasSelection
    ? `${selectedPartIds.length} part${selectedPartIds.length === 1 ? '' : 's'} · ${fmtMoney2(partsCost)}`
    : 'No parts selected';

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      fullWidth
      maxWidth="md"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 4,
            overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(15, 23, 42, 0.22), 0 2px 8px rgba(15, 23, 42, 0.08)',
          },
        },
      }}
    >
      {/* Header */}
      <Box sx={{ px: 3, pt: 2.5, pb: 2, position: 'relative' }}>
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: 'absolute', top: 14, right: 14, color: muted }}
        >
          <Close fontSize="small" />
        </IconButton>
        <Typography sx={{ fontSize: 21, fontWeight: 800, color: ink, letterSpacing: '-0.01em' }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 13.5, color: muted, mt: 0.25 }}>
          Check parts for this order. Description, URL, and price update the parts list; qty on checked rows is order-only.
        </Typography>
        <Box
          sx={{
            mt: 1.5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.25,
            py: 0.5,
            borderRadius: 999,
            bgcolor: hasSelection ? accentSoft : subtleBg,
            border: '1px solid',
            borderColor: hasSelection ? accentBorder : hairline,
          }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: hasSelection ? accent : '#cbd5e1',
            }}
          />
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: hasSelection ? accent : muted, ...numeric }}>
            {selectionChip}
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: hairline }} />

      {/* Body */}
      <Box sx={{ px: 3, py: 2, maxHeight: '62vh', overflowY: 'auto' }}>
        <Stack spacing={2.5}>
          {/* Order name */}
          <TextField
            label="Order name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
            placeholder={`Order ${orderIndex + 1}`}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: subtleBg },
              '& .MuiInputBase-input': { fontSize: 14 },
            }}
          />

          {/* Parts list */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography
                sx={{ fontSize: 11.5, fontWeight: 800, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}
              >
                Parts
              </Typography>
              <Button
                size="small"
                startIcon={<Add sx={{ fontSize: 16 }} />}
                onClick={addPart}
                sx={{ fontWeight: 700, fontSize: 12.5, color: accent, '&:hover': { bgcolor: accentSoft } }}
              >
                Add part
              </Button>
            </Stack>
            {orderedParts.length === 0 ?
              <Box
                sx={{
                  py: 3,
                  px: 2,
                  textAlign: 'center',
                  borderRadius: 2,
                  border: '1px dashed',
                  borderColor: hairline,
                  bgcolor: subtleBg,
                }}
              >
                <Typography sx={{ fontSize: 13, color: muted, fontWeight: 600 }}>
                  No parts yet - use “Add part” to build this order from scratch.
                </Typography>
              </Box>
            : <Stack spacing={0.5}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: ORDER_PART_GRID,
                    gap: 0.6,
                    px: 0.6,
                  }}
                >
                  <span />
                  <Typography sx={{ fontSize: 11, fontWeight: 800, color: muted, textTransform: 'uppercase' }}>
                    Description
                  </Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 800, color: muted, textTransform: 'uppercase' }}>
                    URL
                  </Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 800, color: muted, textTransform: 'uppercase' }}>
                    Qty
                  </Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 800, color: muted, textTransform: 'uppercase' }}>
                    Price
                  </Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 800, color: muted, textTransform: 'uppercase', textAlign: 'right' }}>
                    Line
                  </Typography>
                  <span />
                </Box>
                {orderedParts.map((part) => {
                  const selected = selectedSet.has(part.id);
                  return (
                    <OrderPartLineRow
                      key={part.id}
                      part={part}
                      selected={selected}
                      displayQty={displayQty(part.id, part)}
                      lineTotal={lineTotalForPart(part.id, part)}
                      onToggle={() => togglePart(part.id)}
                      onChange={(patch) => updatePart(part.id, patch)}
                      onQtyChange={(raw) => updateQty(part.id, raw)}
                    />
                  );
                })}
              </Stack>
            }
          </Box>

          {/* Costs */}
          <Box>
            <Typography
              sx={{ fontSize: 11.5, fontWeight: 800, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}
            >
              Order charges
            </Typography>
            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: subtleBg, border: '1px solid', borderColor: hairline }}>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1}>
                  <MoneyField label="Shipping" value={shipping} onChange={setShipping} />
                  <MoneyField label="Fees" value={fees} onChange={setFees} />
                </Stack>
                <TextField
                  label="Tax"
                  value={taxFocused ? taxInput : taxMode === 'amount' ? fmtAmountField(taxInput) : fmtPctField(taxInput)}
                  onChange={(e) => setTaxInput(e.target.value)}
                  onFocus={() => setTaxFocused(true)}
                  onBlur={() => setTaxFocused(false)}
                  fullWidth
                  size="small"
                  type="number"
                  slotProps={{
                    htmlInput: {
                      inputMode: 'decimal',
                      min: 0,
                      style: { fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
                    },
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">{taxMode === 'amount' ? '$' : '%'}</InputAdornment>
                      ),
                    },
                  }}
                  sx={MONEY_FIELD_SX}
                />
                {/* Tax tools + computed note */}
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  spacing={1}
                  sx={{ mt: '-2px' }}
                >
                  <Box sx={{ display: 'inline-flex', p: 0.25, borderRadius: 1.5, bgcolor: '#eef2f6' }}>
                    {(['amount', 'percent'] as const).map((mode) => {
                      const active = taxMode === mode;
                      return (
                        <Box
                          key={mode}
                          role="button"
                          tabIndex={0}
                          aria-pressed={active}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setTaxModeKeepValue(mode)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setTaxModeKeepValue(mode);
                            }
                          }}
                          sx={{
                            px: 1.25,
                            py: 0.25,
                            minWidth: 30,
                            textAlign: 'center',
                            fontSize: 12.5,
                            fontWeight: 800,
                            lineHeight: 1.4,
                            cursor: 'pointer',
                            borderRadius: 1,
                            color: active ? '#fff' : muted,
                            bgcolor: active ? accent : 'transparent',
                            transition: 'all 150ms ease',
                          }}
                        >
                          {mode === 'amount' ? '$' : '%'}
                        </Box>
                      );
                    })}
                  </Box>
                  <Typography
                    sx={{ fontSize: 11.5, color: muted, fontWeight: 600, ...numeric }}
                    noWrap
                  >
                    {taxMode === 'percent'
                      ? `${fmtPctField(taxInput) || '0.00'}% of ${fmtMoney2(partsCost)} = ${fmtMoney2(taxDollars)}`
                      : `Tax ${fmtMoney2(taxDollars)}`}
                  </Typography>
                  <Button
                    size="small"
                    onClick={applyNebraskaTax}
                    onMouseDown={(e) => e.preventDefault()}
                    sx={{
                      minWidth: 0,
                      px: 1,
                      py: 0.25,
                      fontWeight: 800,
                      fontSize: 12,
                      borderRadius: 1.5,
                      color: accent,
                      bgcolor: accentSoft,
                      border: '1px solid',
                      borderColor: accentBorder,
                      '&:hover': { bgcolor: 'rgba(46, 125, 50, 0.16)' },
                    }}
                  >
                    NE 7%
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Box>

          {/* Summary */}
          <Box
            sx={{
              px: 1.75,
              py: 1.25,
              borderRadius: 3,
              bgcolor: '#fff',
              border: '1px solid',
              borderColor: hairline,
              textAlign: 'right',
            }}
          >
            <Typography
              sx={{ fontSize: 10.5, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              Total
            </Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 900, color: ink, lineHeight: 1.1, ...numeric }}>
              {fmtMoney2(total)}
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: muted, mt: 0.25, ...numeric }} noWrap>
              Parts {fmtMoney2(partsCost)} · Ship {fmtMoney2(draftOrder.shipping)} · Tax {fmtMoney2(draftOrder.tax)} · Fees {fmtMoney2(draftOrder.fees)}
            </Typography>
          </Box>

          {/* Notes */}
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            size="small"
            multiline
            minRows={2}
            placeholder="Order notes…"
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: subtleBg },
              '& .MuiInputBase-input': { fontSize: 14 },
            }}
          />
        </Stack>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderTop: '1px solid',
          borderColor: hairline,
          display: 'flex',
          alignItems: 'center',
          justifyContent: existing && onDelete ? 'space-between' : 'flex-end',
          gap: 1,
        }}
      >
        {existing && onDelete ?
          <Button
            onClick={() => {
              onDelete();
              onClose();
            }}
            sx={{ color: '#b91c1c', fontWeight: 600, '&:hover': { bgcolor: 'rgba(185, 28, 28, 0.06)' } }}
          >
            Delete order
          </Button>
        : null}
        <Stack direction="row" spacing={1} alignItems="center">
          <Button onClick={onClose} sx={{ color: muted, fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!hasSelection}
            disableElevation
            sx={{
              px: 3,
              py: 0.85,
              borderRadius: 999,
              fontWeight: 700,
              bgcolor: accent,
              '&:hover': { bgcolor: '#1b5e20' },
              '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' },
            }}
          >
            Save order
          </Button>
        </Stack>
      </Box>
    </Dialog>
  );
}

export function orderPartLines(sessionParts: TarsPartLine[], order: TarsProcurementGroup): TarsPartLine[] {
  const byId = new Map(sessionParts.map((p) => [p.id, p]));
  return order.partIds.map((id) => byId.get(id)).filter((p): p is TarsPartLine => p != null);
}
