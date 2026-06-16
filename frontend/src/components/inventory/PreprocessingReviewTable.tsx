import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import Add from '@mui/icons-material/Add';
import Remove from '@mui/icons-material/Remove';
import { useVirtualizer } from '@tanstack/react-virtual';
import type {
  PreprocessingReviewRow,
  PreprocessingReviewRowPatch,
  PreprocessingReviewRowUpdate,
  PreprocessingReviewSummary,
} from '../../api/inventory.api';
import { PreprocessingMatchCell } from './PreprocessingMatchCell';
import { formatConditionLabel, ITEM_CONDITIONS } from '../../constants/inventory.constants';
import { isTaxonomyV1CategoryName, TAXONOMY_V1_CATEGORY_NAMES } from '../../constants/taxonomyV1';
import { formatCurrency } from '../../utils/format';
import {
  computeReviewPricingTotals,
  effectiveReviewSetPrice,
  exactTargetPrices,
  roundReviewPrice,
} from '../../utils/preprocessingReviewTotals';

/** Fixed row height — virtualization contract (mimics ProcessingQueueTable). */
const REVIEW_ROW_HEIGHT = 34;
const REVIEW_COLUMN_COUNT = 12;

type SortKey = 'row' | 'title' | 'brand' | 'model' | 'qty' | 'category' | 'condition' | 'retail' | 'price' | 'ai' | 'ideal';

function numOrNull(v: string | number | null | undefined): number | null {
  const n = Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
}

function sortValue(r: PreprocessingReviewRow, key: SortKey): string | number | null {
  switch (key) {
    case 'row': return r.row_number;
    case 'title': return (r.title || '').toLowerCase();
    case 'brand': return (r.brand || '').toLowerCase();
    case 'model': return (r.model || '').toLowerCase();
    case 'qty': return r.quantity ?? null;
    case 'category': return (r.category || '').toLowerCase();
    case 'condition': return (r.condition || '').toLowerCase();
    case 'retail': return numOrNull(r.unit_retail);
    case 'price': return numOrNull(r.final_price ?? r.proposed_price);
    case 'ai': return numOrNull(r.proposed_price);
    case 'ideal': return numOrNull(r.ideal_price);
    default: return null;
  }
}

interface PreprocessingReviewTableProps {
  /** Full order row set (client-side filtering/virtualization — no pagination). */
  rows: PreprocessingReviewRow[];
  summary: PreprocessingReviewSummary | null;
  isLoading?: boolean;
  isSaving: boolean;
  updatingMatchRowId?: number | null;
  onSaveRows: (rows: PreprocessingReviewRowUpdate[]) => Promise<void>;
  onPersistSuccess?: (rows: PreprocessingReviewRowUpdate[]) => void;
  onDirtyCountChange?: (count: number) => void;
  onSetMatch: (rowId: number, finalMatchedProduct: number | null, decision?: 'unset') => Promise<void>;
}

function money(value: string | null | undefined) {
  return value ? formatCurrency(value) : '-';
}

function pctDelta(price: string | null | undefined, ideal: string | null | undefined): number | null {
  const p = Number.parseFloat(price ?? '');
  const i = Number.parseFloat(ideal ?? '');
  if (!Number.isFinite(p) || !Number.isFinite(i) || i <= 0) return null;
  return ((p - i) / i) * 100;
}

function idealLineColor(delta: number | null, theme: Theme): string {
  if (delta != null && delta < -5) return theme.palette.warning.dark;
  return theme.palette.success.dark;
}

/** Live $x,xxx.xx input mask: digits + one decimal (2dp), thousands-grouped. */
function formatMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [intPart = '', ...rest] = cleaned.split('.');
  const dec = rest.join('').slice(0, 2);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length > 0 ? `${grouped}.${dec}` : grouped;
}

function layerTooltipText(parts: Array<[label: string, value: string | null | undefined]>): string {
  return parts
    .filter(([, v]) => String(v ?? '').trim() !== '')
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join('\n');
}

const STATIC_CATEGORY_ITEMS = [
  <MenuItem key="__empty" value="" dense>
    <em>—</em>
  </MenuItem>,
  ...TAXONOMY_V1_CATEGORY_NAMES.map((name) => (
    <MenuItem key={name} value={name} dense>
      {name}
    </MenuItem>
  )),
];

function categoryMenuItems(currentRaw: string) {
  const current = currentRaw.trim();
  if (current && !isTaxonomyV1CategoryName(current)) {
    return [
      ...STATIC_CATEGORY_ITEMS,
      <MenuItem key={`__legacy:${current}`} value={current} dense>
        {current}
      </MenuItem>,
    ];
  }
  return STATIC_CATEGORY_ITEMS;
}

const compactCellSx = { py: 0, px: 0.75, verticalAlign: 'middle', height: REVIEW_ROW_HEIGHT };
const compactHeadSx = { py: 0.5, px: 0.75, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', bgcolor: 'background.paper' };
const compactInputSx = {
  '& .MuiOutlinedInput-root': { fontSize: 12.5 },
  '& .MuiOutlinedInput-input': { py: 0.25, px: 0.75 },
};

/** Final Decisions toolbar — readable height/width (avoid cramped size="small" + tight py). */
const reviewToolbarInputSx = {
  '& .MuiOutlinedInput-root': {
    minHeight: 44,
    fontSize: '0.9375rem',
  },
  '& .MuiOutlinedInput-input': {
    py: 1.25,
    px: 1.25,
  },
  '& .MuiSelect-select': {
    py: 1.25,
    px: 1.25,
    minHeight: '1.25rem',
    display: 'flex',
    alignItems: 'center',
  },
};

const PRODUCT_COLUMN_TOOLTIP =
  "A linked product describes the item itself; this row's text describes what's in this order. Clearing the match makes this row a new product at check-in.";

function fmtMoney0(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pctOf(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null || whole <= 0) return null;
  return ((part - whole) / whole) * 100;
}

/** Rich gradient stat card: accent bar, uppercase kicker, big value line, sub line. */
function RichStatCard({
  label,
  accent,
  tint,
  main,
  sub,
}: {
  label: string;
  accent: string;
  tint: string;
  main: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.25,
        minWidth: 0,
        borderRadius: 1.5,
        borderLeft: `4px solid ${accent}`,
        background: `linear-gradient(135deg, #ffffff 0%, ${tint} 100%)`,
        boxShadow: '0 1px 3px rgba(27,67,50,0.10)',
      }}
    >
      <Typography sx={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.08, color: accent }}>
        {label}
      </Typography>
      <Box sx={{ mt: 0.25, display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>{main}</Box>
      {sub ? <Box sx={{ mt: 0.25 }}>{sub}</Box> : null}
    </Paper>
  );
}

interface ReviewRowProps {
  row: PreprocessingReviewRow;
  zebra: boolean;
  draft: PreprocessingReviewRowPatch | undefined;
  isUpdatingMatch: boolean;
  setField: (id: number, field: keyof PreprocessingReviewRowPatch, value: PreprocessingReviewRowPatch[keyof PreprocessingReviewRowPatch]) => void;
  applyRowPriceStep: (rowId: number, factor: number) => void;
  getRowByNumber: (rowNumber: number) => PreprocessingReviewRow | undefined;
  onSetMatch: (rowId: number, finalMatchedProduct: number | null, decision?: 'unset') => Promise<void>;
}

function rowValue(row: PreprocessingReviewRow, patch: PreprocessingReviewRowPatch | undefined, field: keyof PreprocessingReviewRowPatch) {
  return patch && field in patch ? patch[field] : row[field as keyof PreprocessingReviewRow];
}

const ReviewRow = memo(function ReviewRow({
  row,
  zebra,
  draft,
  isUpdatingMatch,
  setField,
  applyRowPriceStep,
  getRowByNumber,
  onSetMatch,
}: ReviewRowProps) {
  const price = draft && 'final_price' in draft
    ? String(draft.final_price ?? '')
    : String(row.final_price ?? row.proposed_price ?? '');
  const delta = pctDelta(price, row.ideal_price);
  const aiDelta = pctDelta(price, row.proposed_price);
  const categoryStr = String(rowValue(row, draft, 'category') ?? '');
  const titleLayers = layerTooltipText([
    ['AI', row.ai_title],
    ['Title', row.title],
  ]);
  const brandLayers = layerTooltipText([
    ['AI', row.ai_brand],
    ['Std', row.standard_brand],
  ]);
  const modelLayers = layerTooltipText([
    ['AI', row.ai_model],
    ['Std', row.standard_model],
  ]);
  const condLayers = layerTooltipText([
    ['AI', row.ai_condition],
    ['Std', row.standard_condition],
  ]);
  return (
    <TableRow hover sx={{ '& td': compactCellSx, height: REVIEW_ROW_HEIGHT, bgcolor: zebra ? 'action.hover' : undefined }}>
      <TableCell align="center" sx={{ textAlign: 'center' }}>
        <Typography variant="caption" fontWeight={700}>
          {row.row_number}
        </Typography>
      </TableCell>
      <TableCell sx={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
        <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{titleLayers}</span>} disableInteractive enterDelay={400}>
          <TextField
            size="small"
            fullWidth
            variant="outlined"
            value={String(rowValue(row, draft, 'title') ?? '')}
            onChange={(event) => setField(row.id, 'title', event.target.value)}
            sx={compactInputSx}
          />
        </Tooltip>
      </TableCell>
      <TableCell>
        <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{brandLayers}</span>} disableInteractive enterDelay={400}>
          <TextField
            size="small"
            variant="outlined"
            fullWidth
            value={String(rowValue(row, draft, 'brand') ?? '')}
            onChange={(event) => setField(row.id, 'brand', event.target.value)}
            sx={compactInputSx}
          />
        </Tooltip>
      </TableCell>
      <TableCell>
        <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{modelLayers}</span>} disableInteractive enterDelay={400}>
          <TextField
            size="small"
            variant="outlined"
            fullWidth
            value={String(rowValue(row, draft, 'model') ?? '')}
            onChange={(event) => setField(row.id, 'model', event.target.value)}
            sx={compactInputSx}
          />
        </Tooltip>
      </TableCell>
      <TableCell align="center" sx={{ textAlign: 'center' }}>
        <Typography variant="caption">{row.quantity == null ? '—' : Number(row.quantity).toLocaleString()}</Typography>
      </TableCell>
      <TableCell sx={{ overflow: 'hidden' }}>
        <TextField
          select
          size="small"
          variant="outlined"
          fullWidth
          value={categoryStr.trim()}
          onChange={(event) => setField(row.id, 'category', event.target.value)}
          sx={{
            ...compactInputSx,
            minWidth: 0,
            '& .MuiSelect-select': { overflow: 'hidden', textOverflow: 'ellipsis' },
          }}
          slotProps={{
            select: {
              displayEmpty: true,
              MenuProps: { PaperProps: { sx: { maxHeight: 320 } } },
            },
          }}
        >
          {categoryMenuItems(categoryStr)}
        </TextField>
      </TableCell>
      <TableCell>
        <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{condLayers}</span>} disableInteractive enterDelay={400}>
          <TextField
            select
            size="small"
            variant="outlined"
            fullWidth
            value={String(rowValue(row, draft, 'condition') ?? 'unknown')}
            onChange={(event) => setField(row.id, 'condition', event.target.value)}
            sx={compactInputSx}
          >
            {ITEM_CONDITIONS.map((condition) => (
              <MenuItem key={condition} value={condition} dense>
                {formatConditionLabel(condition)}
              </MenuItem>
            ))}
          </TextField>
        </Tooltip>
      </TableCell>
      <TableCell align="center" sx={{ textAlign: 'center' }}>
        <Typography variant="body2" sx={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {money(row.unit_retail)}
        </Typography>
      </TableCell>
      <TableCell sx={{ maxWidth: 150 }}>
        <PreprocessingMatchCell
          row={row}
          isUpdating={isUpdatingMatch}
          getRowByNumber={getRowByNumber}
          onSetMatch={onSetMatch}
        />
      </TableCell>
      <TableCell align="center" sx={{ textAlign: 'center', px: 0.25 }}>
        <Stack direction="row" spacing={0} alignItems="center" justifyContent="center">
          <IconButton size="small" sx={{ p: 0.25 }} aria-label="Decrease price 5%" onClick={() => applyRowPriceStep(row.id, 0.95)}>
            <Remove sx={{ fontSize: 16 }} />
          </IconButton>
          <TextField
            size="small"
            type="number"
            variant="outlined"
            value={price}
            onChange={(event) => setField(row.id, 'final_price', event.target.value)}
            sx={{
              ...compactInputSx,
              width: 84,
              '& .MuiOutlinedInput-input': { py: 0.25, px: 0.5, textAlign: 'center' },
              '& input[type=number]': { MozAppearance: 'textfield' },
              '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                WebkitAppearance: 'none',
                margin: 0,
              },
            }}
            slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
          />
          <IconButton size="small" sx={{ p: 0.25 }} aria-label="Increase price 5%" onClick={() => applyRowPriceStep(row.id, 1.05)}>
            <Add sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>
      </TableCell>
      {/* Reference prices — click to apply to this row. AI = row-specific model estimate;
          Ideal = retail-ratio formula. (Δ%) = current price vs that reference. */}
      <TableCell align="center" sx={{ textAlign: 'center' }}>
        <Tooltip title="AI price estimate for this row — click to use it" disableInteractive enterDelay={300}>
          <Typography
            variant="caption"
            component="button"
            onClick={() => {
              const v = String(row.proposed_price ?? '').trim();
              if (v) setField(row.id, 'final_price', v);
            }}
            sx={{
              fontSize: 11,
              fontWeight: 600,
              color: 'info.dark',
              whiteSpace: 'nowrap',
              cursor: row.proposed_price ? 'pointer' : 'default',
              background: 'none',
              border: 0,
              p: 0,
              textDecoration: row.proposed_price ? 'underline dotted' : 'none',
            }}
          >
            {money(row.proposed_price)}
            {aiDelta == null ? '' : ` (${aiDelta >= 0 ? '+' : ''}${aiDelta.toFixed(0)}%)`}
          </Typography>
        </Tooltip>
      </TableCell>
      <TableCell align="center" sx={{ textAlign: 'center' }}>
        <Tooltip title="Ideal price (retail-ratio formula) — click to use it" disableInteractive enterDelay={300}>
          <Typography
            variant="caption"
            component="button"
            onClick={() => {
              const v = String(row.ideal_price ?? '').trim();
              if (v) setField(row.id, 'final_price', v);
            }}
            sx={(theme) => ({
              fontSize: 11,
              fontWeight: 600,
              color: idealLineColor(delta, theme),
              whiteSpace: 'nowrap',
              cursor: row.ideal_price ? 'pointer' : 'default',
              background: 'none',
              border: 0,
              p: 0,
              textDecoration: row.ideal_price ? 'underline dotted' : 'none',
            })}
          >
            {money(row.ideal_price)}
            {delta == null ? '' : ` (${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%)`}
          </Typography>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
});

export function PreprocessingReviewTable({
  rows,
  summary,
  isLoading = false,
  isSaving,
  updatingMatchRowId = null,
  onSaveRows,
  onPersistSuccess,
  onDirtyCountChange,
  onSetMatch,
}: PreprocessingReviewTableProps) {
  const [draftsById, setDraftsById] = useState<Record<number, PreprocessingReviewRowPatch>>({});
  const [search, setSearch] = useState('');
  const [targetTotal, setTargetTotal] = useState('');
  const [bulkCondition, setBulkCondition] = useState('');
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowById = useMemo(() => {
    const map = new Map<number, PreprocessingReviewRow>();
    for (const r of rows) map.set(r.id, r);
    return map;
  }, [rows]);

  const rowByNumber = useMemo(() => {
    const map = new Map<number, PreprocessingReviewRow>();
    for (const r of rows) map.set(r.row_number, r);
    return map;
  }, [rows]);

  const getRowByNumber = useCallback((n: number) => rowByNumber.get(n), [rowByNumber]);

  // Client-side search over the full set — instant, no server round-trips.
  const haystacks = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) {
      map.set(
        r.id,
        [r.row_number, r.title, r.brand, r.model, r.category, r.notes]
          .map((x) => String(x ?? '').toLowerCase())
          .join(' '),
      );
    }
    return map;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const terms = q.split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      const hay = haystacks.get(r.id) ?? '';
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, search, haystacks]);

  // 3-state column sorting (asc → desc → none), processing-queue style.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const cycleSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }, []);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va == null && vb == null) return a.row_number - b.row_number;
      if (va == null) return 1; // nulls last regardless of direction
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul || a.row_number - b.row_number;
      return String(va).localeCompare(String(vb)) * mul || a.row_number - b.row_number;
    });
  }, [filteredRows, sort]);

  // Live order economics — recomputed from the loaded rows + unsaved drafts.
  const stats = useMemo(() => {
    let retail = 0;
    let ai = 0;
    let ideal = 0;
    for (const r of rows) {
      const q = Number(r.quantity) > 0 ? Number(r.quantity) : 1;
      const ur = Number.parseFloat(r.unit_retail ?? '');
      const ap = Number.parseFloat(r.proposed_price ?? '');
      const ip = Number.parseFloat(r.ideal_price ?? '');
      if (Number.isFinite(ur)) retail += ur * q;
      if (Number.isFinite(ap)) ai += ap * q;
      if (Number.isFinite(ip)) ideal += ip * q;
    }
    const { totalSet } = computeReviewPricingTotals(rows, draftsById);
    const paidRaw = Number.parseFloat(summary?.total_paid ?? '');
    const paid = Number.isFinite(paidRaw) ? paidRaw : null;
    const profit = paid != null ? totalSet - paid : null;
    return {
      retail,
      ai,
      ideal,
      set: totalSet,
      paid,
      profit,
      paidPctOfRetail: paid != null && retail > 0 ? (paid / retail) * 100 : null,
      vsAi: pctOf(totalSet, ai),
      vsIdeal: pctOf(totalSet, ideal),
      roi: paid != null && paid > 0 && profit != null ? (profit / paid) * 100 : null,
    };
  }, [summary, rows, draftsById]);

  const dirtyIds = useMemo(
    () => Object.keys(draftsById).map(Number).filter((id) => Object.keys(draftsById[id] ?? {}).length > 0),
    [draftsById],
  );

  useEffect(() => {
    onDirtyCountChange?.(dirtyIds.length);
  }, [dirtyIds.length, onDirtyCountChange]);

  const draftsRef = useRef(draftsById);
  draftsRef.current = draftsById;

  async function saveIds(ids: number[]) {
    const payload = ids
      .map((id) => {
        const patch = draftsRef.current[id];
        if (!patch || Object.keys(patch).length === 0) return null;
        return { id, patch };
      })
      .filter(Boolean) as PreprocessingReviewRowUpdate[];
    if (!payload.length) return;
    await onSaveRows(payload);
    onPersistSuccess?.(payload);
    setDraftsById((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  }

  useEffect(() => {
    if (!dirtyIds.length) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyIds.length]);

  const setField = useCallback((id: number, field: keyof PreprocessingReviewRowPatch, value: PreprocessingReviewRowPatch[keyof PreprocessingReviewRowPatch]) => {
    setDraftsById((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), [field]: value },
    }));
  }, []);

  const mergeIntoDrafts = (updates: Record<number, PreprocessingReviewRowPatch>) => {
    const entries = Object.entries(updates);
    if (!entries.length) return;
    setDraftsById((prev) => {
      const next = { ...prev };
      for (const [idStr, patch] of entries) {
        const id = Number(idStr);
        next[id] = { ...(next[id] ?? {}), ...patch };
      }
      return next;
    });
  };

  // Bulk ops target the CURRENT FILTER (no filter = whole order) — synchronously,
  // since the full row set is already client-side.
  const runBulkPriceOp = (label: string, priceRow: (row: PreprocessingReviewRow) => string | null, note: string) => {
    if (!filteredRows.length) {
      setApplyMessage('No rows in the current filter.');
      return;
    }
    const updates: Record<number, PreprocessingReviewRowPatch> = {};
    let priced = 0;
    let skipped = 0;
    for (const row of filteredRows) {
      const next = priceRow(row);
      if (next === null) {
        skipped += 1;
        continue;
      }
      updates[row.id] = { ...(draftsRef.current[row.id] ?? {}), final_price: next, pricing_notes: note };
      priced += 1;
    }
    mergeIntoDrafts(updates);
    setApplyMessage(`${label}: priced ${priced} row(s)${skipped ? ` · skipped ${skipped} with no base` : ''} — review then Save Changes`);
  };

  const applyAiPrices = () =>
    runBulkPriceOp('= AI', (row) => {
      const v = String(row.proposed_price ?? '').trim();
      return v === '' ? null : v;
    }, 'Bulk = AI prices');

  const applyIdealPrices = () =>
    runBulkPriceOp('= Ideal', (row) => {
      const v = String(row.ideal_price ?? '').trim();
      return v === '' ? null : v;
    }, 'Bulk = ideal prices');

  const applyPctBulk = (factor: number) =>
    runBulkPriceOp(`${factor < 1 ? '−' : '+'}5%`, (row) => {
      const cur = effectiveReviewSetPrice(row, draftsRef.current[row.id]);
      if (cur === null || cur <= 0) return null;
      return roundReviewPrice(cur * factor);
    }, `Bulk ${factor < 1 ? '−' : '+'}5%`);

  // Target $ deliberately ignores the filter: scales every row's CURRENT price so the
  // ORDER total lands on target, with cent-residual distribution for an exact landing.
  const applyTargetTotalBulk = () => {
    const target = Number.parseFloat(targetTotal.replace(/,/g, ''));
    if (!Number.isFinite(target) || target <= 0) {
      setApplyMessage('Enter a target total $ first.');
      return;
    }
    const result = exactTargetPrices(rows, draftsRef.current, target);
    if (result === null) {
      setApplyMessage('No current prices to scale toward the target total.');
      return;
    }
    const updates: Record<number, PreprocessingReviewRowPatch> = {};
    for (const [idStr, priceStr] of Object.entries(result.prices)) {
      const id = Number(idStr);
      updates[id] = { ...(draftsRef.current[id] ?? {}), final_price: priceStr, pricing_notes: `Bulk target $${target.toFixed(2)}` };
    }
    mergeIntoDrafts(updates);
    const offBy = Math.round((target - result.achieved) * 100);
    setApplyMessage(
      `Target: priced ${result.priced} row(s) → total $${result.achieved.toLocaleString(undefined, { minimumFractionDigits: 2 })}` +
      `${offBy === 0 ? ' (exact)' : ` (${offBy}¢ under — no qty-1 rows left to absorb it)`}` +
      `${result.skipped ? ` · skipped ${result.skipped} with no price` : ''} — review then Save Changes`,
    );
  };

  const applyConditionBulk = (value: string) => {
    if (!filteredRows.length) {
      setApplyMessage('No rows in the current filter.');
      return;
    }
    const updates: Record<number, PreprocessingReviewRowPatch> = {};
    for (const row of filteredRows) {
      const next = value === '__ai' ? String(row.ai_condition ?? '').trim() || 'unknown' : value;
      updates[row.id] = { ...(draftsRef.current[row.id] ?? {}), condition: next as PreprocessingReviewRowPatch['condition'] };
    }
    mergeIntoDrafts(updates);
    setApplyMessage(
      `Condition ${value === '__ai' ? 'reset to AI' : `= ${formatConditionLabel(value)}`} on ${filteredRows.length} row(s) — review then Save Changes`,
    );
  };

  const applyRowPriceStep = useCallback((rowId: number, factor: number) => {
    const row = rowById.get(rowId);
    if (!row) return;
    const cur = effectiveReviewSetPrice(row, draftsRef.current[rowId]);
    if (cur === null || cur <= 0) return;
    setDraftsById((prev) => ({
      ...prev,
      [rowId]: { ...(prev[rowId] ?? {}), final_price: roundReviewPrice(cur * factor), pricing_notes: `Row ${factor < 1 ? '−' : '+'}5%` },
    }));
  }, [rowById]);

  // Virtualization (mimics ProcessingQueueTable: useVirtualizer + spacer rows).
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => REVIEW_ROW_HEIGHT,
    overscan: 8,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
          gap: 1,
          mb: 1,
          flexShrink: 0,
        }}
      >
        <RichStatCard
          label="Investment — Paid / Retail"
          accent="#2D6A4F"
          tint="#EAF4EE"
          main={
            <>
              <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#1B4332', lineHeight: 1.1 }}>
                {fmtMoney0(stats.paid)}
              </Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#74867c' }}>/ {fmtMoney0(stats.retail)}</Typography>
            </>
          }
          sub={
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#52796F' }}>
              {stats.paidPctOfRetail == null ? 'retail basis unknown' : `paid ${stats.paidPctOfRetail.toFixed(1)}% of vendor retail`}
            </Typography>
          }
        />
        <RichStatCard
          label="Set prices vs AI / Ideal"
          accent="#1565C0"
          tint="#EAF1FA"
          main={
            <>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#1565C0', lineHeight: 1.2 }}>
                AI {fmtMoney0(stats.ai)}
                <Box component="span" sx={{ fontWeight: 700, color: stats.vsAi == null ? '#90a4ae' : stats.vsAi >= 0 ? '#2D6A4F' : '#B26A00' }}>
                  {stats.vsAi == null ? '' : ` (${stats.vsAi >= 0 ? '+' : ''}${stats.vsAi.toFixed(1)}%)`}
                </Box>
              </Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#52796F', lineHeight: 1.2 }}>
                · Ideal {fmtMoney0(stats.ideal)}
                <Box component="span" sx={{ fontWeight: 700, color: stats.vsIdeal == null ? '#90a4ae' : stats.vsIdeal >= 0 ? '#2D6A4F' : '#B26A00' }}>
                  {stats.vsIdeal == null ? '' : ` (${stats.vsIdeal >= 0 ? '+' : ''}${stats.vsIdeal.toFixed(1)}%)`}
                </Box>
              </Typography>
            </>
          }
          sub={
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#7a8aa0' }}>
              (Δ%) = set total vs each reference
            </Typography>
          }
        />
        <RichStatCard
          label="Price / Profit"
          accent={stats.profit != null && stats.profit < 0 ? '#C62828' : '#1B4332'}
          tint={stats.profit != null && stats.profit < 0 ? '#FBEDEB' : '#E9F3EC'}
          main={
            <>
              <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#1B4332', lineHeight: 1.1 }}>
                {fmtMoney0(stats.set)}
              </Typography>
              <Typography
                sx={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: stats.profit == null ? '#90a4ae' : stats.profit >= 0 ? '#2D6A4F' : '#C62828',
                }}
              >
                → {stats.profit == null ? '—' : `${stats.profit >= 0 ? '+' : '−'}${fmtMoney0(Math.abs(stats.profit)).slice(0)}`} profit
              </Typography>
            </>
          }
          sub={
            <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: stats.roi == null ? '#90a4ae' : stats.roi >= 0 ? '#2D6A4F' : '#C62828' }}>
              {stats.roi == null ? 'ROI —' : `ROI ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(0)}% on cash in`}
            </Typography>
          }
        />
      </Box>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 1, flexShrink: 0 }}>
        <Stack spacing={1.25}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', md: 'center' }}>
            <TextField
              placeholder="Search rows — title, brand, model, category, #…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{
                flex: '1 1 420px',
                minWidth: { xs: '100%', md: 320 },
                maxWidth: '100%',
                ...reviewToolbarInputSx,
              }}
            />
            <Chip
              size="medium"
              variant={search ? 'filled' : 'outlined'}
              color={search ? 'info' : 'default'}
              label={`${filteredRows.length.toLocaleString()} row(s) targeted`}
              sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', md: 'center' } }}
            />
            <Button disabled={!search} onClick={() => setSearch('')} sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', md: 'center' } }}>
              Clear filters
            </Button>
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
            <Button
              variant="contained"
              disabled={isSaving || dirtyIds.length === 0}
              startIcon={isSaving ? <CircularProgress size={16} /> : undefined}
              onClick={() => void saveIds(dirtyIds)}
              sx={{ whiteSpace: 'nowrap', flexShrink: 0, minHeight: 44, px: 2 }}
            >
              {dirtyIds.length ? `Save Changes (${dirtyIds.length})` : 'Save Changes'}
            </Button>
          </Stack>

          <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center" useFlexGap>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.04 }}>
              Price filtered
            </Typography>
            <ButtonGroup variant="outlined" disabled={isSaving} sx={{ '& .MuiButton-root': { minHeight: 44, px: 1.5 } }}>
              <Button onClick={applyAiPrices}>= AI</Button>
              <Button onClick={applyIdealPrices}>= Ideal</Button>
              <Button onClick={() => applyPctBulk(0.95)}>−5%</Button>
              <Button onClick={() => applyPctBulk(1.05)}>+5%</Button>
            </ButtonGroup>
            <Divider orientation="vertical" flexItem sx={{ height: 44 }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.04 }}>
              Target order total
            </Typography>
            <Tooltip title="Scales every row's current price so the whole-order total lands exactly on this amount (ignores filters; leftover cents distributed automatically).">
              <Stack direction="row" alignItems="stretch" sx={{ flexShrink: 0 }}>
                <TextField
                  placeholder="21,863.33"
                  value={targetTotal}
                  onChange={(e) => setTargetTotal(formatMoneyInput(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyTargetTotalBulk();
                  }}
                  sx={{
                    width: { xs: 200, sm: 220 },
                    ...reviewToolbarInputSx,
                    '& .MuiOutlinedInput-root': {
                      ...reviewToolbarInputSx['& .MuiOutlinedInput-root'],
                      borderTopRightRadius: 0,
                      borderBottomRightRadius: 0,
                    },
                  }}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start" sx={{ mr: 0.25, '& .MuiTypography-root': { fontSize: '0.9375rem', fontWeight: 700 } }}>
                          $
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <Button
                  variant="contained"
                  disableElevation
                  disabled={isSaving || !targetTotal.trim()}
                  onClick={applyTargetTotalBulk}
                  sx={{
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    ml: '-1px',
                    px: 2,
                    minWidth: 56,
                    minHeight: 44,
                    fontWeight: 700,
                  }}
                >
                  Set
                </Button>
              </Stack>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ height: 44 }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.04 }}>
              Cond. filtered
            </Typography>
            <TextField
              select
              value={bulkCondition}
              onChange={(e) => {
                const v = e.target.value;
                setBulkCondition('');
                if (v) applyConditionBulk(v);
              }}
              sx={{ width: { xs: '100%', sm: 220 }, maxWidth: 280, ...reviewToolbarInputSx }}
              slotProps={{ select: { displayEmpty: true } }}
            >
              <MenuItem value="" dense disabled>
                <em>Set condition…</em>
              </MenuItem>
              {ITEM_CONDITIONS.map((condition) => (
                <MenuItem key={condition} value={condition} dense>
                  {formatConditionLabel(condition)}
                </MenuItem>
              ))}
              <MenuItem value="__ai" dense>
                <em>Reset to AI condition</em>
              </MenuItem>
            </TextField>
            {isLoading ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={14} />
                <Typography variant="caption" color="text.secondary">Loading rows…</Typography>
              </Stack>
            ) : null}
          </Stack>
        </Stack>
      </Paper>

      <Snackbar
        open={Boolean(applyMessage)}
        autoHideDuration={4000}
        onClose={() => setApplyMessage(null)}
        message={applyMessage ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      <TableContainer
        ref={scrollRef}
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          scrollbarGutter: 'stable',
        }}
      >
        <Table size="small" stickyHeader padding="none" sx={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col />
            <col style={{ width: 104 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 40 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 132 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 138 }} />
            <col style={{ width: 126 }} />
            <col style={{ width: 86 }} />
            <col style={{ width: 96 }} />
          </colgroup>
          <TableHead>
            <TableRow>
              {([
                ['row', '#', 'center'],
                ['title', 'Title', 'left'],
                ['brand', 'Brand', 'left'],
                ['model', 'Model', 'left'],
                ['qty', 'Qty', 'center'],
                ['category', 'Category', 'left'],
                ['condition', 'Condition', 'left'],
                ['retail', 'Retail', 'center'],
              ] as Array<[SortKey, string, 'left' | 'right' | 'center']>).map(([key, label, align]) => (
                <TableCell
                  key={key}
                  sx={{
                    ...compactHeadSx,
                    textAlign: align,
                    // TableSortLabel is inline-flex; without this the label hugs left even
                    // in center-aligned cells. Icon width offset keeps the TEXT centered.
                    ...(align === 'center'
                      ? { '& .MuiTableSortLabel-root': { width: '100%', justifyContent: 'center', ml: '9px' } }
                      : {}),
                  }}
                  align={align}
                >
                  <TableSortLabel
                    active={sort?.key === key}
                    direction={sort?.key === key ? sort.dir : 'asc'}
                    onClick={() => cycleSort(key)}
                  >
                    {label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell sx={compactHeadSx}>
                <Tooltip title={PRODUCT_COLUMN_TOOLTIP}>
                  <span>Product</span>
                </Tooltip>
              </TableCell>
              {([
                ['price', '− Price +'],
                ['ai', 'AI'],
                ['ideal', 'Ideal'],
              ] as Array<[SortKey, string]>).map(([key, label]) => (
                <TableCell
                  key={key}
                  align="center"
                  sx={{
                    ...compactHeadSx,
                    textAlign: 'center',
                    '& .MuiTableSortLabel-root': { width: '100%', justifyContent: 'center', ml: '9px' },
                  }}
                >
                  <TableSortLabel active={sort?.key === key} direction={sort?.key === key ? sort.dir : 'asc'} onClick={() => cycleSort(key)}>
                    {label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {!filteredRows.length && !isLoading ? (
              <TableRow>
                <TableCell colSpan={REVIEW_COLUMN_COUNT} sx={{ py: 6, textAlign: 'center', border: 0 }}>
                  <Typography color="text.secondary" sx={{ mb: 1 }}>
                    No staged rows match the current filters.
                  </Typography>
                  {search ? (
                    <Button size="small" variant="outlined" onClick={() => setSearch('')}>
                      Clear filters
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ) : null}
            {paddingTop > 0 ? (
              <TableRow aria-hidden sx={{ height: paddingTop, pointerEvents: 'none', visibility: 'hidden' }}>
                <TableCell colSpan={REVIEW_COLUMN_COUNT} sx={{ p: 0, border: 0, height: paddingTop }} />
              </TableRow>
            ) : null}
            {virtualItems.map((vi) => {
              const row = sortedRows[vi.index];
              if (!row) return null;
              return (
                <ReviewRow
                  key={row.id}
                  zebra={vi.index % 2 === 1}
                  row={row}
                  draft={draftsById[row.id]}
                  isUpdatingMatch={updatingMatchRowId === row.id}
                  setField={setField}
                  applyRowPriceStep={applyRowPriceStep}
                  getRowByNumber={getRowByNumber}
                  onSetMatch={onSetMatch}
                />
              );
            })}
            {paddingBottom > 0 ? (
              <TableRow aria-hidden sx={{ height: paddingBottom, pointerEvents: 'none', visibility: 'hidden' }}>
                <TableCell colSpan={REVIEW_COLUMN_COUNT} sx={{ p: 0, border: 0, height: paddingBottom }} />
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
