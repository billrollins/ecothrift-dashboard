import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
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
import type {
  PreprocessingReviewRow,
  PreprocessingReviewRowPatch,
  PreprocessingReviewRowUpdate,
  PreprocessingReviewSummary,
} from '../../api/inventory.api';
import { formatConditionLabel, ITEM_CONDITIONS } from '../../constants/inventory.constants';
import { formatCurrency } from '../../utils/format';
import type { PreprocessingAiBaselinePatch } from './preprocessing/aiBaseline';
import { baselineToRowPatch } from './preprocessing/aiBaseline';

interface PreprocessingReviewTableProps {
  /** Current page slice only (client-side pagination). */
  rows: PreprocessingReviewRow[];
  /** Lookup full row by id (bulk actions use filtered ids across pages). */
  getStagedRow: (id: number) => PreprocessingReviewRow | undefined;
  /** Bulk toolbar applies to this id list (full filtered set). */
  filteredRowIds: number[];
  baselineByRowId: Record<number, PreprocessingAiBaselinePatch>;
  summary: PreprocessingReviewSummary | null;
  totalFilteredCount: number;
  page: number;
  pageSize: number;
  isLoading?: boolean;
  isSaving: boolean;
  searchValue: string;
  missingPriceOnly: boolean;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSearchChange?: (search: string) => void;
  onMissingPriceChange?: (missingOnly: boolean) => void;
  onSaveRows: (rows: PreprocessingReviewRowUpdate[]) => Promise<void>;
  /** Persist succeeded — parent merges into full-row snapshot. */
  onPersistSuccess?: (rows: PreprocessingReviewRowUpdate[]) => void;
  /** Dirty rows count for parent chrome (e.g. stepper finalize). */
  onDirtyCountChange?: (count: number) => void;
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

function baselinePatchFromRow(b: PreprocessingAiBaselinePatch): PreprocessingReviewRowPatch {
  return baselineToRowPatch(b);
}

export function PreprocessingReviewTable({
  rows,
  getStagedRow,
  filteredRowIds,
  baselineByRowId,
  summary,
  totalFilteredCount,
  page,
  pageSize,
  isLoading = false,
  isSaving,
  searchValue,
  missingPriceOnly,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  onMissingPriceChange,
  onSaveRows,
  onPersistSuccess,
  onDirtyCountChange,
}: PreprocessingReviewTableProps) {
  const [draftsById, setDraftsById] = useState<Record<number, PreprocessingReviewRowPatch>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const dirtyIds = useMemo(
    () => Object.keys(draftsById).map(Number).filter((id) => Object.keys(draftsById[id] ?? {}).length > 0),
    [draftsById],
  );

  const rowIdKey = useMemo(() => rows.map((row) => row.id).join(','), [rows]);
  useEffect(() => {
    setSelected(new Set());
  }, [rowIdKey]);

  useEffect(() => {
    onDirtyCountChange?.(dirtyIds.length);
  }, [dirtyIds.length, onDirtyCountChange]);

  const draftsRef = useRef(draftsById);
  draftsRef.current = draftsById;

  useEffect(() => {
    if (!dirtyIds.length) return;
    const t = window.setTimeout(() => {
      const ids = Object.keys(draftsRef.current).map(Number).filter((id) => Object.keys(draftsRef.current[id] ?? {}).length > 0);
      if (!ids.length) return;
      void saveIds(ids);
    }, 30000);
    return () => window.clearTimeout(t);
  }, [draftsById, dirtyIds.length]);

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

  const saveIds = async (ids: number[]) => {
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
  };

  const mergeBulkDrafts = async (updates: Record<number, PreprocessingReviewRowPatch>) => {
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
    const payload = entries.map(([idStr, patch]) => ({ id: Number(idStr), patch })) as PreprocessingReviewRowUpdate[];
    await onSaveRows(payload);
    onPersistSuccess?.(payload);
    setDraftsById((prev) => {
      const next = { ...prev };
      for (const [idStr] of entries) delete next[Number(idStr)];
      return next;
    });
  };

  const applyPctCompound = async (ids: number[], factor: number, note: string) => {
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
    await mergeBulkDrafts(updates);
  };

  const applyVisibleIdeal = async () => {
    const updates: Record<number, PreprocessingReviewRowPatch> = {};
    for (const id of filteredRowIds) {
      const row = getStagedRow(id);
      if (!row || row.proposed_price == null || String(row.proposed_price).trim() === '') continue;
      updates[id] = {
        ...(draftsRef.current[id] ?? {}),
        final_price: row.proposed_price,
        pricing_notes: 'Visible = Ideal',
      };
    }
    await mergeBulkDrafts(updates);
  };

  const applyResetToAi = async () => {
    const updates: Record<number, PreprocessingReviewRowPatch> = {};
    for (const id of filteredRowIds) {
      const baseline = baselineByRowId[id];
      if (!baseline) continue;
      updates[id] = baselinePatchFromRow(baseline);
    }
    await mergeBulkDrafts(updates);
  };

  const applySuggestion = (row: PreprocessingReviewRow) => {
    const patch: PreprocessingReviewRowPatch = {};
    if (row.ai_suggested_title) patch.title = row.ai_suggested_title;
    if (row.ai_suggested_brand) patch.brand = row.ai_suggested_brand;
    if (row.ai_suggested_model) patch.model = row.ai_suggested_model;
    if (Object.keys(patch).length) {
      setDraftsById((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] ?? {}), ...patch } }));
    }
  };

  const buildDirtyUpdates = (): PreprocessingReviewRowUpdate[] =>
    dirtyIds
      .map((id) => {
        const patch = draftsById[id];
        if (!patch || Object.keys(patch).length === 0) return null;
        return { id, patch };
      })
      .filter(Boolean) as PreprocessingReviewRowUpdate[];

  if (!rows.length && !isLoading) {
    return <Typography color="text.secondary">No staged rows match the current filters.</Typography>;
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Chip label={`Paid ${money(summary?.total_paid)}`} />
        <Chip label={`Ideal ${money(summary?.total_ideal_price)}`} />
        <Chip label={`Set ${money(summary?.total_set_prices)}`} color="primary" />
        <Chip
          label={`${summary?.ideal_delta_pct == null ? '-' : `${summary.ideal_delta_pct.toFixed(1)}%`} vs ideal`}
          color={(summary?.ideal_delta_pct ?? 0) >= 0 ? 'success' : 'warning'}
        />
        <Chip label={`${summary?.total_units ?? 0} units`} />
        <Chip label={`${summary?.missing_price ?? 0} missing price`} color={(summary?.missing_price ?? 0) ? 'warning' : 'success'} />
        {dirtyIds.length > 0 && <Chip label={`${dirtyIds.length} unsaved row(s)`} color="warning" />}
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          <TextField
            size="small"
            label="Search staged rows"
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            sx={{ minWidth: 280 }}
          />
          <Button
            size="small"
            variant={missingPriceOnly ? 'contained' : 'outlined'}
            color="warning"
            onClick={() => onMissingPriceChange?.(!missingPriceOnly)}
          >
            Missing Price
          </Button>
          <Button size="small" onClick={() => setSelected(new Set(visibleIds))}>Select Visible</Button>
          <Button size="small" onClick={() => setSelected(new Set())}>Clear Select</Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!filteredRowIds.length || isSaving}
            onClick={() => void applyPctCompound(filteredRowIds, 0.9, 'Bulk -10% (compound on final_price)')}
          >
            -10%
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!filteredRowIds.length || isSaving}
            onClick={() => void applyPctCompound(filteredRowIds, 1.1, 'Bulk +10% (compound on final_price)')}
          >
            +10%
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!filteredRowIds.length || isSaving}
            onClick={() => void applyVisibleIdeal()}
          >
            Visible = Ideal
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!filteredRowIds.length || isSaving}
            onClick={() => void applyResetToAi()}
          >
            Reset to AI
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={isSaving || dirtyIds.length === 0}
            startIcon={isSaving ? <CircularProgress size={14} /> : undefined}
            onClick={() => void saveIds(dirtyIds)}
          >
            Save Changes
          </Button>
        </Stack>
      </Paper>

      {isLoading && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">Loading staged rows...</Typography>
        </Stack>
      )}

      <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 620 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>#</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Title / AI</TableCell>
              <TableCell>Brand</TableCell>
              <TableCell>Model</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Cond.</TableCell>
              <TableCell align="right">Retail</TableCell>
              <TableCell align="right">Base</TableCell>
              <TableCell align="right">Ideal</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell align="right">Vs Ideal</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const draft = draftsById[row.id];
              const price = String(rowValue(row, draft, 'final_price') ?? row.proposed_price ?? '');
              const delta = pctDelta(price, row.ideal_price);
              const hasSuggestion = Boolean(row.ai_suggested_title || row.ai_suggested_brand || row.ai_suggested_model);
              return (
                <TableRow key={row.id} hover selected={selected.has(row.id)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.has(row.id)}
                      onChange={(event) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (event.target.checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell>{row.row_number}</TableCell>
                  <TableCell sx={{ minWidth: 220 }}>
                    <Typography variant="body2">{row.description}</Typography>
                    {(row.upc || row.vendor_item_number) && (
                      <Typography variant="caption" color="text.secondary">
                        {[row.upc && `UPC ${row.upc}`, row.vendor_item_number && `Vendor # ${row.vendor_item_number}`].filter(Boolean).join(' | ')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ minWidth: 240 }}>
                    <TextField
                      size="small"
                      fullWidth
                      value={String(rowValue(row, draft, 'title') ?? '')}
                      onChange={(event) => setField(row.id, 'title', event.target.value)}
                    />
                    {hasSuggestion && (
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          AI: {row.ai_suggested_title || row.ai_suggested_brand || row.ai_suggested_model}
                        </Typography>
                        <Button size="small" onClick={() => applySuggestion(row)}>Apply</Button>
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      value={String(rowValue(row, draft, 'brand') ?? '')}
                      onChange={(event) => setField(row.id, 'brand', event.target.value)}
                      sx={{ width: 120 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      value={String(rowValue(row, draft, 'model') ?? '')}
                      onChange={(event) => setField(row.id, 'model', event.target.value)}
                      sx={{ width: 120 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      value={String(rowValue(row, draft, 'category') ?? '')}
                      onChange={(event) => setField(row.id, 'category', event.target.value)}
                      sx={{ width: 180 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      value={String(rowValue(row, draft, 'condition') ?? 'unknown')}
                      onChange={(event) => setField(row.id, 'condition', event.target.value)}
                      sx={{ width: 120 }}
                    >
                      {ITEM_CONDITIONS.map((condition) => (
                        <MenuItem key={condition} value={condition}>{formatConditionLabel(condition)}</MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell align="right">{money(row.retail_value)}</TableCell>
                  <TableCell align="right">{money(row.base_cost)}</TableCell>
                  <TableCell align="right">{money(row.ideal_price)}</TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      value={price}
                      onChange={(event) => setField(row.id, 'final_price', event.target.value)}
                      onBlur={() => void saveIds([row.id])}
                      sx={{ width: 100 }}
                      slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
                    />
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end" sx={{ mt: 0.5 }}>
                      <Button
                        size="small"
                        onClick={() => void applyPctCompound([row.id], 0.9, 'Row -10% (compound on final_price)')}
                      >
                        -10%
                      </Button>
                      <Button
                        size="small"
                        onClick={() => void applyPctCompound([row.id], 1.1, 'Row +10% (compound on final_price)')}
                      >
                        +10%
                      </Button>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={delta == null ? '-' : `${delta.toFixed(1)}%`}
                      color={delta == null ? 'default' : delta >= 0 ? 'success' : 'warning'}
                      variant="outlined"
                    />
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
