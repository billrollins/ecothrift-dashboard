import { useEffect, useState } from 'react';
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
import type { ManifestRow } from '../../types/inventory.types';
import type { ManualReviewSummary, ManualReviewRowUpdate } from '../../api/inventory.api';
import { formatConditionLabel, ITEM_CONDITIONS } from '../../constants/inventory.constants';
import { formatCurrency } from '../../utils/format';

interface ManualReviewPanelProps {
  rows: ManifestRow[];
  summary: ManualReviewSummary | null;
  orderStatus: string;
  onSaveRows: (rows: ManualReviewRowUpdate[]) => Promise<void>;
  onNavigateToProcessing: () => void | Promise<void>;
  isSaving: boolean;
  /** When true, show manifest pricing audit only (no edits or saves). */
  readOnly?: boolean;
  isCreatingItems?: boolean;
  /** When true/false, overrides delivery-status gate for opening Processing (e.g. staging finalize). */
  allowNavigateToProcessing?: boolean;
  count?: number;
  page?: number;
  pageSize?: number;
  isLoading?: boolean;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSearchChange?: (search: string) => void;
  onMissingPriceChange?: (missingOnly: boolean) => void;
}

interface RowState {
  title: string;
  brand: string;
  model: string;
  category: string;
  condition: string;
  price: string;
  notes: string;
}

function pctDelta(price: string, ideal: string | null | undefined): number | null {
  const p = Number.parseFloat(price);
  const i = Number.parseFloat(ideal ?? '');
  if (!Number.isFinite(p) || !Number.isFinite(i) || i <= 0) return null;
  return ((p - i) / i) * 100;
}

function money(value: string | null | undefined) {
  return value ? formatCurrency(value) : '—';
}

export function ManualReviewPanel({
  rows,
  summary,
  orderStatus,
  onSaveRows,
  onNavigateToProcessing,
  isSaving,
  readOnly = false,
  isCreatingItems = false,
  allowNavigateToProcessing,
  count = rows.length,
  page = 1,
  pageSize = 50,
  isLoading = false,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  onMissingPriceChange,
}: ManualReviewPanelProps) {
  const [state, setState] = useState<Record<number, RowState>>({});
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showMissingPrice, setShowMissingPrice] = useState(false);

  const rowKey = `${rows.length}-${rows[0]?.id ?? ''}-${rows[rows.length - 1]?.id ?? ''}`;
  useEffect(() => {
    const next: Record<number, RowState> = {};
    for (const row of rows) {
      next[row.id] = {
        title: row.title || row.description || '',
        brand: row.brand || '',
        model: row.model || '',
        category: row.category || '',
        condition: row.condition || 'unknown',
        price: row.final_price || row.proposed_price || row.set_price || '',
        notes: row.notes || '',
      };
    }
    setState(next);
    setSelected(new Set());
  }, [rowKey]);

  const setField = (id: number, field: keyof RowState, value: string) => {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const saveIds = async (ids: number[]) => {
    const payload = ids
      .map((id) => {
        const s = state[id];
        if (!s) return null;
        return {
          id,
          title: s.title,
          brand: s.brand,
          model: s.model,
          category: s.category,
          condition: s.condition,
          final_price: s.price || null,
          proposed_price: s.price || null,
          notes: s.notes,
          pricing_notes: s.price ? 'Manual review set price' : '',
        };
      })
      .filter(Boolean) as ManualReviewRowUpdate[];
    if (payload.length) await onSaveRows(payload);
  };

  const applyIdealPct = async (ids: number[], multiplier: number, note: string) => {
    const idSet = new Set(ids);
    const updates: ManualReviewRowUpdate[] = [];
    const pricesById: Record<number, string> = {};
    for (const row of rows) {
      if (!idSet.has(row.id)) continue;
      const ideal = Number.parseFloat(row.ideal_price ?? '');
      if (!Number.isFinite(ideal) || ideal <= 0) continue;
      pricesById[row.id] = (ideal * multiplier).toFixed(2);
      const current = state[row.id];
      if (!current) continue;
      updates.push({
        id: row.id,
        title: current.title,
        brand: current.brand,
        model: current.model,
        category: current.category,
        condition: current.condition,
        final_price: pricesById[row.id],
        proposed_price: pricesById[row.id],
        notes: current.notes,
        pricing_notes: note,
      });
    }
    setState((prev) => {
      const next = { ...prev };
      for (const [id, price] of Object.entries(pricesById)) {
        const rowId = Number(id);
        if (next[rowId]) next[rowId] = { ...next[rowId], price };
      }
      return next;
    });
    if (updates.length) await onSaveRows(updates);
  };

  const selectedIds = [...selected];
  const visibleIds = rows.map((r) => r.id);
  const canGoToProcessing =
    typeof allowNavigateToProcessing === 'boolean'
      ? allowNavigateToProcessing
      : ['delivered', 'processing', 'complete'].includes(orderStatus);

  const displayRetail = (row: ManifestRow) => row.unit_retail ?? row.retail_value ?? null;

  if (!rows.length && !isLoading) {
    return <Typography color="text.secondary">No standardized rows yet.</Typography>;
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
        {readOnly ? (
          <Typography variant="body2" color="text.secondary" sx={{ width: '100%', mb: 0.5 }}>
            Read-only reference: manifest row MSRP, allocated base cost, 2× ideal target, and finalized shelf prices.
          </Typography>
        ) : null}
        <Chip label={`Paid ${money(summary?.total_paid)}`} />
        <Chip label={`Ideal ${money(summary?.total_ideal_price)}`} />
        <Chip label={`Set ${money(summary?.total_set_prices)}`} color="primary" />
        <Chip
          label={`${summary?.ideal_delta_pct == null ? '—' : `${summary.ideal_delta_pct.toFixed(1)}%`} vs ideal`}
          color={(summary?.ideal_delta_pct ?? 0) >= 0 ? 'success' : 'warning'}
        />
        <Chip label={`${summary?.total_units ?? 0} units`} />
        <Chip label={`${summary?.missing_price ?? 0} missing price`} color={(summary?.missing_price ?? 0) ? 'warning' : 'success'} />
      </Stack>

      {!readOnly ? (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
            <TextField
              size="small"
              label="Search review"
              value={query}
              onChange={(e) => {
                const value = e.target.value;
                setQuery(value);
                onSearchChange?.(value);
              }}
              sx={{ minWidth: 280 }}
            />
            <Button
              size="small"
              variant={showMissingPrice ? 'contained' : 'outlined'}
              color="warning"
              onClick={() => {
                const next = !showMissingPrice;
                setShowMissingPrice(next);
                onMissingPriceChange?.(next);
              }}
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
              disabled={isSaving}
              startIcon={isSaving ? <CircularProgress size={14} /> : undefined}
              onClick={() => void saveIds(rows.map((r) => r.id))}
            >
              Save All
            </Button>
          </Stack>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
            <TextField
              size="small"
              label="Search (read-only)"
              value={query}
              onChange={(e) => {
                const value = e.target.value;
                setQuery(value);
                onSearchChange?.(value);
              }}
              sx={{ minWidth: 280 }}
            />
            <Button
              size="small"
              variant={showMissingPrice ? 'contained' : 'outlined'}
              color="warning"
              onClick={() => {
                const next = !showMissingPrice;
                setShowMissingPrice(next);
                onMissingPriceChange?.(next);
              }}
            >
              Missing Price
            </Button>
          </Stack>
        </Paper>
      )}

      {isLoading && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">Loading review rows...</Typography>
        </Stack>
      )}

      <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 620 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {!readOnly ? <TableCell padding="checkbox" /> : null}
              <TableCell>#</TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>Title / Product</TableCell>
              <TableCell>Brand</TableCell>
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
              const s = state[row.id];
              if (!s) return null;
              const delta = readOnly
                ? row.ideal_delta_pct ?? pctDelta(s.price, row.ideal_price)
                : pctDelta(s.price, row.ideal_price);
              return (
                <TableRow key={row.id} hover selected={!readOnly && selected.has(row.id)}>
                    {!readOnly ? (
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(row.id);
                              else next.delete(row.id);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>{row.row_number}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">{row.first_item_sku || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.item_count ?? 0} item(s)</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      {readOnly ? (
                        <Typography variant="body2">{s.title || row.description || '—'}</Typography>
                      ) : (
                        <TextField size="small" fullWidth value={s.title} onChange={(e) => setField(row.id, 'title', e.target.value)} />
                      )}
                      <Typography variant="caption" color="text.secondary" display="block" noWrap title={row.description}>
                        {row.description}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {readOnly ? (
                        <Typography variant="body2">{s.brand || '—'}</Typography>
                      ) : (
                        <TextField size="small" value={s.brand} onChange={(e) => setField(row.id, 'brand', e.target.value)} sx={{ width: 120 }} />
                      )}
                    </TableCell>
                    <TableCell>
                      {readOnly ? (
                        <Typography variant="body2" noWrap sx={{ maxWidth: 160 }} title={s.category}>
                          {s.category || '—'}
                        </Typography>
                      ) : (
                        <TextField size="small" value={s.category} onChange={(e) => setField(row.id, 'category', e.target.value)} sx={{ width: 180 }} />
                      )}
                    </TableCell>
                    <TableCell>
                      {readOnly ? (
                        <Typography variant="body2">{formatConditionLabel(s.condition)}</Typography>
                      ) : (
                        <TextField select size="small" value={s.condition} onChange={(e) => setField(row.id, 'condition', e.target.value)} sx={{ width: 120 }}>
                          {ITEM_CONDITIONS.map((c) => <MenuItem key={c} value={c}>{formatConditionLabel(c)}</MenuItem>)}
                        </TextField>
                      )}
                    </TableCell>
                    <TableCell align="right">{money(displayRetail(row))}</TableCell>
                    <TableCell align="right">{money(row.base_cost)}</TableCell>
                    <TableCell align="right">{money(row.ideal_price)}</TableCell>
                    <TableCell align="right">
                      {readOnly ? (
                        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {money(s.price)}
                        </Typography>
                      ) : (
                        <>
                          <TextField
                            size="small"
                            type="number"
                            value={s.price}
                            onChange={(e) => setField(row.id, 'price', e.target.value)}
                            onBlur={() => void saveIds([row.id])}
                            sx={{ width: 100 }}
                            slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
                          />
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end" sx={{ mt: 0.5 }}>
                            <Button size="small" onClick={() => void applyIdealPct([row.id], 0.9, 'Manual -10% from ideal')}>-10%</Button>
                            <Button size="small" onClick={() => void applyIdealPct([row.id], 1.1, 'Manual +10% from ideal')}>+10%</Button>
                          </Stack>
                        </>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        size="small"
                        label={delta == null ? '—' : `${delta.toFixed(1)}%`}
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

      {!readOnly ? (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2 }}>
          {canGoToProcessing ? (
            <Button
              variant="contained"
              startIcon={isCreatingItems ? <CircularProgress size={16} /> : <PlayArrow />}
              disabled={isCreatingItems}
              onClick={() => void onNavigateToProcessing()}
            >
              {isCreatingItems ? 'Opening Processing...' : 'Go to Processing'}
            </Button>
          ) : (
            <Alert severity="info" sx={{ flex: 1 }}>
              Items are prepared now. Deliver the order before opening Processing.
            </Alert>
          )}
        </Stack>
      ) : null}
    </Box>
  );
}
