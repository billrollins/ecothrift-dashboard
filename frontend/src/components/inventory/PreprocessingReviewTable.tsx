import { useEffect, useMemo, useState } from 'react';
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
import PlayArrow from '@mui/icons-material/PlayArrow';
import type {
  PreprocessingReviewRow,
  PreprocessingReviewRowPatch,
  PreprocessingReviewRowUpdate,
  PreprocessingReviewSummary,
} from '../../api/inventory.api';
import { formatConditionLabel, ITEM_CONDITIONS } from '../../constants/inventory.constants';
import { formatCurrency } from '../../utils/format';

interface PreprocessingReviewTableProps {
  rows: PreprocessingReviewRow[];
  summary: PreprocessingReviewSummary | null;
  count?: number;
  page?: number;
  pageSize?: number;
  isLoading?: boolean;
  isSaving: boolean;
  isFinalizing?: boolean;
  searchValue: string;
  missingPriceOnly: boolean;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSearchChange?: (search: string) => void;
  onMissingPriceChange?: (missingOnly: boolean) => void;
  onSaveRows: (rows: PreprocessingReviewRowUpdate[]) => Promise<void>;
  onFinalize: () => void | Promise<void>;
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

export function PreprocessingReviewTable({
  rows,
  summary,
  count = rows.length,
  page = 1,
  pageSize = 50,
  isLoading = false,
  isSaving,
  isFinalizing = false,
  searchValue,
  missingPriceOnly,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  onMissingPriceChange,
  onSaveRows,
  onFinalize,
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
        const patch = draftsById[id];
        if (!patch || Object.keys(patch).length === 0) return null;
        return { id, patch };
      })
      .filter(Boolean) as PreprocessingReviewRowUpdate[];
    if (!payload.length) return;
    await onSaveRows(payload);
    setDraftsById((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  };

  const applyIdealPct = async (ids: number[], multiplier: number, note: string) => {
    const updates: Record<number, PreprocessingReviewRowPatch> = {};
    for (const row of rows) {
      if (!ids.includes(row.id)) continue;
      const ideal = Number.parseFloat(row.ideal_price ?? '');
      if (!Number.isFinite(ideal) || ideal <= 0) continue;
      updates[row.id] = {
        ...(draftsById[row.id] ?? {}),
        final_price: (ideal * multiplier).toFixed(2),
        pricing_notes: note,
      };
    }
    if (!Object.keys(updates).length) return;
    setDraftsById((prev) => ({ ...prev, ...updates }));
    await onSaveRows(Object.entries(updates).map(([id, patch]) => ({ id: Number(id), patch })));
    setDraftsById((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(updates)) delete next[Number(id)];
      return next;
    });
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

  const selectedIds = [...selected];

  if (!rows.length && !isLoading) {
    return <Typography color="text.secondary">No staged rows are ready for review.</Typography>;
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
            disabled={!selectedIds.length || isSaving}
            onClick={() => void applyIdealPct(selectedIds, 0.9, 'Manual bulk -10% from ideal')}
          >
            Selected -10%
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!selectedIds.length || isSaving}
            onClick={() => void applyIdealPct(selectedIds, 1.1, 'Manual bulk +10% from ideal')}
          >
            Selected +10%
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={isSaving}
            onClick={() => void applyIdealPct(visibleIds, 1, 'Manual visible set to ideal')}
          >
            Visible = Ideal
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
                      <Button size="small" onClick={() => void applyIdealPct([row.id], 0.9, 'Manual -10% from ideal')}>-10%</Button>
                      <Button size="small" onClick={() => void applyIdealPct([row.id], 1.1, 'Manual +10% from ideal')}>+10%</Button>
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
        count={count}
        page={Math.max(0, page - 1)}
        rowsPerPage={pageSize}
        rowsPerPageOptions={[25, 50, 100]}
        onPageChange={(_event, nextPage) => onPageChange?.(nextPage + 1)}
        onRowsPerPageChange={(event) => onPageSizeChange?.(Number(event.target.value))}
      />

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2 }}>
        {dirtyIds.length > 0 && (
          <Alert severity="warning" sx={{ flex: 1 }}>
            Save pending edits before finalizing.
          </Alert>
        )}
        <Button
          variant="contained"
          startIcon={isFinalizing ? <CircularProgress size={16} /> : <PlayArrow />}
          disabled={isFinalizing || isSaving || dirtyIds.length > 0}
          onClick={() => void onFinalize()}
        >
          {isFinalizing ? 'Finalizing...' : 'Finalize and Open Processing'}
        </Button>
      </Stack>
    </Box>
  );
}
