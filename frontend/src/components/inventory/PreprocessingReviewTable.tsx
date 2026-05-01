import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import Add from '@mui/icons-material/Add';
import Remove from '@mui/icons-material/Remove';
import type {
  PreprocessingReviewRow,
  PreprocessingReviewRowPatch,
  PreprocessingReviewRowUpdate,
  PreprocessingReviewSummary,
} from '../../api/inventory.api';
import { formatConditionLabel, ITEM_CONDITIONS } from '../../constants/inventory.constants';
import { isTaxonomyV1CategoryName, TAXONOMY_V1_CATEGORY_NAMES } from '../../constants/taxonomyV1';
import { formatCurrency } from '../../utils/format';
import { computeReviewPricingTotals } from '../../utils/preprocessingReviewTotals';

interface PreprocessingReviewTableProps {
  rows: PreprocessingReviewRow[];
  getStagedRow: (id: number) => PreprocessingReviewRow | undefined;
  /** Load every row matching current server-side filters; returns ids for bulk toolbar actions. */
  ensureBulkTargetsLoaded: () => Promise<number[]>;
  summary: PreprocessingReviewSummary | null;
  /** All rows for current server-side filters (paginated load); used to recompute totals from drafts. */
  pricingTotalsRows: PreprocessingReviewRow[];
  pricingTotalsComplete: boolean;
  totalFilteredCount: number;
  page: number;
  pageSize: number;
  isLoading?: boolean;
  isSaving: boolean;
  isResettingFinal?: boolean;
  searchValue: string;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSearchChange?: (search: string) => void;
  onSaveRows: (rows: PreprocessingReviewRowUpdate[]) => Promise<void>;
  onPersistSuccess?: (rows: PreprocessingReviewRowUpdate[]) => void;
  onDirtyCountChange?: (count: number) => void;
  onResetFinalClick?: () => void;
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

function rowValue(row: PreprocessingReviewRow, patch: PreprocessingReviewRowPatch | undefined, field: keyof PreprocessingReviewRowPatch) {
  return patch && field in patch ? patch[field] : row[field as keyof PreprocessingReviewRow];
}

/** Compound ±10% uses stored/edited final_price only (not proposed_price). */
function currentFinalNumeric(row: PreprocessingReviewRow, draft?: PreprocessingReviewRowPatch): number {
  const d = draft?.final_price;
  if (d !== undefined && d !== null && String(d).trim() !== '') {
    const n = Number.parseFloat(String(d));
    return Number.isFinite(n) ? n : 0;
  }
  const fp = row.final_price;
  if (fp != null && String(fp).trim() !== '') {
    const n = Number.parseFloat(String(fp));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function idealLineColor(delta: number | null, theme: Theme): string {
  if (delta != null && delta < -5) return theme.palette.warning.dark;
  return theme.palette.success.dark;
}

/** Canonical list + blank + one legacy row value when AI/vendor text is not taxonomy v1. */
function categoryMenuItems(currentRaw: string) {
  const current = currentRaw.trim();
  const items = [
    <MenuItem key="__empty" value="" dense>
      <em>—</em>
    </MenuItem>,
    ...TAXONOMY_V1_CATEGORY_NAMES.map((name) => (
      <MenuItem key={name} value={name} dense>
        {name}
      </MenuItem>
    )),
  ];
  if (current && !isTaxonomyV1CategoryName(current)) {
    items.push(
      <MenuItem key={`__legacy:${current}`} value={current} dense>
        {current}
      </MenuItem>,
    );
  }
  return items;
}

/** Dense single-line inputs + tight vertical rhythm for review grid rows. */
const compactTableCellSx = { py: 0.5, px: 1 };
const compactHeadSx = { py: 0.75, px: 1, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
const compactInputSx = {
  '& .MuiOutlinedInput-root': { fontSize: 13 },
  '& .MuiOutlinedInput-input': { py: 0.5, px: 1 },
};

function StatCard({
  label,
  value,
  borderAccent,
}: {
  label: string;
  value: string;
  borderAccent?: 'success' | 'warning';
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        minWidth: 0,
        borderRadius: 1,
        borderWidth: borderAccent ? 2 : 1,
        borderColor: borderAccent === 'warning' ? 'warning.main' : borderAccent === 'success' ? 'success.main' : 'divider',
      }}
    >
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.04 }}>
        {label}
      </Typography>
      <Typography variant="body1" fontWeight={700} sx={{ mt: 0.25 }}>
        {value}
      </Typography>
    </Paper>
  );
}

export function PreprocessingReviewTable({
  rows,
  getStagedRow,
  ensureBulkTargetsLoaded,
  summary,
  pricingTotalsRows,
  pricingTotalsComplete,
  totalFilteredCount,
  page,
  pageSize,
  isLoading = false,
  isSaving,
  isResettingFinal = false,
  searchValue,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  onSaveRows,
  onPersistSuccess,
  onDirtyCountChange,
  onResetFinalClick,
}: PreprocessingReviewTableProps) {
  const [draftsById, setDraftsById] = useState<Record<number, PreprocessingReviewRowPatch>>({});

  const displaySummary = useMemo(() => {
    if (!summary) return null;
    if (
      !pricingTotalsComplete ||
      pricingTotalsRows.length === 0 ||
      totalFilteredCount === 0
    ) {
      return summary;
    }
    const { totalSet, deltaPct } = computeReviewPricingTotals(pricingTotalsRows, draftsById);
    return {
      ...summary,
      total_set_prices: totalSet.toFixed(2),
      ideal_delta_pct: deltaPct,
    };
  }, [summary, pricingTotalsComplete, pricingTotalsRows, draftsById, totalFilteredCount]);

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

  const setField = (id: number, field: keyof PreprocessingReviewRowPatch, value: PreprocessingReviewRowPatch[keyof PreprocessingReviewRowPatch]) => {
    setDraftsById((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? {}),
        [field]: value,
      },
    }));
  };

  /** Merge bulk edits into local drafts only; server PATCH runs when user clicks Save. */
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

  const applyPctCompound = (ids: number[], factor: number, note: string) => {
    const updates: Record<number, PreprocessingReviewRowPatch> = {};
    for (const id of ids) {
      const row = getStagedRow(id);
      if (!row) continue;
      const draft = draftsRef.current[id];
      const cur = currentFinalNumeric(row, draft);
      const next = (Math.round(cur * factor * 100) / 100).toFixed(2);
      updates[id] = {
        ...(draft ?? {}),
        final_price: next,
        pricing_notes: note,
      };
    }
    mergeIntoDrafts(updates);
  };

  const applyVisibleIdeal = (ids: number[]) => {
    const updates: Record<number, PreprocessingReviewRowPatch> = {};
    for (const id of ids) {
      const row = getStagedRow(id);
      if (!row || row.proposed_price == null || String(row.proposed_price).trim() === '') continue;
      updates[id] = {
        ...(draftsRef.current[id] ?? {}),
        final_price: row.proposed_price,
        pricing_notes: 'Bulk = Ideal',
      };
    }
    mergeIntoDrafts(updates);
  };

  const runBulk = async (fn: (ids: number[]) => void | Promise<void>) => {
    const ids = await ensureBulkTargetsLoaded();
    if (!ids.length) return;
    await Promise.resolve(fn(ids));
  };

  if (!rows.length && !isLoading) {
    return <Typography color="text.secondary">No staged rows match the current filters.</Typography>;
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' },
          gap: 1,
          mb: 1.5,
        }}
      >
        <StatCard label="Paid (plan)" value={money(displaySummary?.total_paid)} />
        <StatCard label="Ideal total" value={money(displaySummary?.total_ideal_price)} />
        <StatCard label="Set prices" value={money(displaySummary?.total_set_prices)} />
        <StatCard
          label="% vs ideal"
          value={displaySummary?.ideal_delta_pct == null ? '—' : `${displaySummary.ideal_delta_pct.toFixed(1)}%`}
          borderAccent={
            displaySummary?.ideal_delta_pct == null
              ? undefined
              : displaySummary.ideal_delta_pct >= 0
                ? 'success'
                : 'warning'
          }
        />
        <StatCard label="Units" value={`${displaySummary?.total_units ?? 0}`} />
      </Box>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', md: 'center' }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" useFlexGap>
            <TextField
              size="small"
              label="Search staged rows"
              value={searchValue}
              onChange={(event) => onSearchChange?.(event.target.value)}
              sx={{ minWidth: 260 }}
            />
            <Button
              size="small"
              variant="outlined"
              disabled={isSaving || isResettingFinal}
              onClick={() => void runBulk((ids) => {
                applyPctCompound(ids, 0.9, 'Bulk -10% (compound on final_price)');
              })}
            >
              −10%
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={isSaving || isResettingFinal}
              onClick={() => void runBulk((ids) => {
                applyPctCompound(ids, 1.1, 'Bulk +10% (compound on final_price)');
              })}
            >
              +10%
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={isSaving || isResettingFinal}
              onClick={() => void runBulk((ids) => applyVisibleIdeal(ids))}
            >
              All filtered = Ideal
            </Button>
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ alignSelf: { xs: 'flex-start', md: 'center' } }}
          >
            {onResetFinalClick ? (
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                disabled={isSaving || isResettingFinal || totalFilteredCount === 0}
                startIcon={isResettingFinal ? <CircularProgress size={14} /> : undefined}
                onClick={onResetFinalClick}
              >
                Reset to AI
              </Button>
            ) : null}
            <Button
              size="small"
              variant="contained"
              disabled={isSaving || isResettingFinal || dirtyIds.length === 0}
              startIcon={isSaving ? <CircularProgress size={14} /> : undefined}
              onClick={() => void saveIds(dirtyIds)}
            >
              {dirtyIds.length ? `Save Changes (${dirtyIds.length})` : 'Save Changes'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {isLoading && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">Loading staged rows...</Typography>
        </Stack>
      )}

      <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, flex: 1, minHeight: 0, maxHeight: 'calc(100vh - 320px)' }}>
        <Table size="small" stickyHeader padding="none" sx={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col />
            <col style={{ width: 108 }} />
            <col style={{ width: 108 }} />
            <col style={{ width: 36 }} />
            <col style={{ width: 176 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 64 }} />
            <col style={{ width: 148 }} />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...compactHeadSx, textAlign: 'center' }}>#</TableCell>
              <TableCell sx={compactHeadSx}>Title</TableCell>
              <TableCell sx={compactHeadSx}>Brand</TableCell>
              <TableCell sx={compactHeadSx}>Model</TableCell>
              <TableCell sx={compactHeadSx} align="right">
                Qty
              </TableCell>
              <TableCell sx={compactHeadSx}>Category</TableCell>
              <TableCell sx={compactHeadSx}>Cond.</TableCell>
              <TableCell sx={compactHeadSx} align="right">
                Retail
              </TableCell>
              <TableCell sx={{ ...compactHeadSx, textAlign: 'center' }} align="center">
                − Price + / Ideal (%)
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const draft = draftsById[row.id];
              const price = String(rowValue(row, draft, 'final_price') ?? '');
              const delta = pctDelta(price, row.ideal_price);
              const descOneLine = (row.description ?? '').trim();
              const categoryStr = String(rowValue(row, draft, 'category') ?? '');
              return (
                <TableRow key={row.id} hover sx={{ '& td': compactTableCellSx }}>
                  <TableCell align="center" sx={{ verticalAlign: 'top', textAlign: 'center' }}>
                    <Typography variant="caption" fontWeight={700} sx={{ display: 'block', pt: 0.25 }}>
                      {row.row_number}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top', width: '100%', minWidth: 0, overflow: 'hidden' }}>
                    <TextField
                      size="small"
                      fullWidth
                      variant="outlined"
                      value={String(rowValue(row, draft, 'title') ?? '')}
                      onChange={(event) => setField(row.id, 'title', event.target.value)}
                      sx={compactInputSx}
                    />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="div"
                      title={descOneLine || undefined}
                      sx={{
                        mt: 0.25,
                        display: 'block',
                        lineHeight: 1.25,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {descOneLine || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      fullWidth
                      value={String(rowValue(row, draft, 'brand') ?? '')}
                      onChange={(event) => setField(row.id, 'brand', event.target.value)}
                      sx={compactInputSx}
                    />
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      fullWidth
                      value={String(rowValue(row, draft, 'model') ?? '')}
                      onChange={(event) => setField(row.id, 'model', event.target.value)}
                      sx={compactInputSx}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ verticalAlign: 'top' }}>
                    <Typography variant="caption" sx={{ display: 'block', pt: 0.75 }}>
                      {row.quantity ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top', overflow: 'hidden' }}>
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
                          MenuProps: {
                            PaperProps: {
                              sx: { maxHeight: 320 },
                            },
                          },
                        },
                      }}
                    >
                      {categoryMenuItems(categoryStr)}
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top' }}>
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
                  </TableCell>
                  <TableCell align="right" sx={{ verticalAlign: 'top' }}>
                    <Typography variant="body2" sx={{ fontSize: 13, fontWeight: 500, pt: 0.75, whiteSpace: 'nowrap' }}>
                      {money(row.unit_retail)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ verticalAlign: 'top', textAlign: 'center' }}>
                    <Stack spacing={0.25} alignItems="center" sx={{ width: '100%' }}>
                      <Stack direction="row" spacing={0.25} alignItems="center" justifyContent="center">
                        <IconButton
                          size="small"
                          sx={{ p: 0.35 }}
                          aria-label="Decrease price 10%"
                          onClick={() => applyPctCompound([row.id], 0.9, 'Row −10% (compound on final_price)')}
                        >
                          <Remove sx={{ fontSize: 18 }} />
                        </IconButton>
                        <TextField
                          size="small"
                          type="number"
                          variant="outlined"
                          value={price}
                          onChange={(event) => setField(row.id, 'final_price', event.target.value)}
                          sx={{ ...compactInputSx, width: 76 }}
                          slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
                        />
                        <IconButton
                          size="small"
                          sx={{ p: 0.35 }}
                          aria-label="Increase price 10%"
                          onClick={() => applyPctCompound([row.id], 1.1, 'Row +10% (compound on final_price)')}
                        >
                          <Add sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Stack>
                      <Typography
                        variant="caption"
                        component="div"
                        sx={(theme) => ({
                          fontSize: '0.625rem',
                          fontWeight: 500,
                          lineHeight: 1.15,
                          letterSpacing: 0.02,
                          color: idealLineColor(delta, theme),
                          whiteSpace: 'nowrap',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          textAlign: 'center',
                          width: '100%',
                        })}
                      >
                        Ideal {money(row.ideal_price)}
                        {delta == null ? '' : ` · ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={totalFilteredCount}
        page={Math.max(0, page - 1)}
        rowsPerPage={pageSize}
        rowsPerPageOptions={[25, 50, 100]}
        onPageChange={(_event, nextPage) => onPageChange?.(nextPage + 1)}
        onRowsPerPageChange={(event) => onPageSizeChange?.(Number(event.target.value))}
      />
    </Box>
  );
}
