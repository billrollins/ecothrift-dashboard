import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import PlayArrow from '@mui/icons-material/PlayArrow';
import type { ManifestRow } from '../../types/inventory.types';
import { formatCurrency } from '../../utils/format';

interface FinalizeRowState {
  id: number;
  title: string;
  brand: string;
  model: string;
  category: string;
  condition: string;
  search_tags: string;
  batch_flag: boolean;
  price: string;
}

interface FinalizePanelProps {
  rows: ManifestRow[];
  onSavePricing: (prices: Record<number, string>) => Promise<void>;
  onNavigateToProcessing: () => void | Promise<void>;
  onClearPricing: () => void;
  isSavingPrices: boolean;
  isCreatingItems?: boolean;
  isClearingPricing: boolean;
  completedStep: number;
  orderStatus: string;
}

const BATCH_QTY_THRESHOLD = 3;
const BATCH_PRICE_THRESHOLD = 25;
const ROWS_PER_PAGE = 50;

function autoBatchFlag(qty: number, price: string | null): boolean {
  const priceNum = price ? Number.parseFloat(price) : 0;
  return qty >= BATCH_QTY_THRESHOLD && priceNum < BATCH_PRICE_THRESHOLD;
}

function DetailField({ label, value, changed }: { label: string; value: string; changed?: boolean }) {
  const display = value || '—';
  return (
    <Box sx={{ mb: 0.75 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: changed ? 700 : 400, color: changed ? 'warning.dark' : 'text.primary' }}>
        {display}
      </Typography>
    </Box>
  );
}

const MATCH_STATUS_LABELS: Record<string, string> = { pending: 'Pending', matched: 'Matched', new: 'New Product' };
const AI_MATCH_DECISION_LABELS: Record<string, string> = {
  pending_review: 'Pending Review', confirmed: 'Confirmed', rejected: 'Rejected',
  uncertain: 'Uncertain', new_product: 'New Product',
};
const PRICING_STAGE_LABELS: Record<string, string> = { unpriced: 'Unpriced', draft: 'Draft', final: 'Final' };

export function FinalizePanel({
  rows,
  onSavePricing,
  onNavigateToProcessing,
  onClearPricing,
  isSavingPrices,
  isCreatingItems = false,
  isClearingPricing,
  completedStep,
  orderStatus,
}: FinalizePanelProps) {
  const [editState, setEditState] = useState<Record<number, FinalizeRowState>>({});
  const [retailPercent, setRetailPercent] = useState('50');
  const [page, setPage] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Filter + selection state
  const [filterText, setFilterText] = useState('');
  const [showUnpricedOnly, setShowUnpricedOnly] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const toggleExpanded = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Stable key so we only re-init editState when the row set changes
  const rowsStableKey = `${rows.length}-${rows[0]?.id ?? ''}-${rows[rows.length - 1]?.id ?? ''}`;

  useEffect(() => { setPage(0); }, [rowsStableKey]);

  useEffect(() => {
    const state: Record<number, FinalizeRowState> = {};
    for (const row of rows) {
      const effectivePrice = row.final_price || row.proposed_price || '';
      state[row.id] = {
        id: row.id,
        title: row.title || row.ai_suggested_title || row.description,
        brand: row.brand || row.ai_suggested_brand || '',
        model: row.model || row.ai_suggested_model || '',
        category: row.category || '',
        condition: row.condition || '',
        search_tags: row.search_tags || '',
        batch_flag: row.batch_flag ?? autoBatchFlag(row.quantity, row.retail_value),
        price: effectivePrice ? String(effectivePrice) : '',
      };
    }
    setEditState(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsStableKey]);

  const updateField = (id: number, field: keyof FinalizeRowState, value: string | boolean) => {
    setEditState((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  // Derived filter + visible rows
  const filteredRows = useMemo(() => {
    let result = rows;
    if (showUnpricedOnly) {
      result = result.filter((r) => !editState[r.id]?.price);
    }
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      result = result.filter((r) => {
        const s = editState[r.id];
        return (
          r.description?.toLowerCase().includes(q) ||
          s?.title?.toLowerCase().includes(q) ||
          s?.brand?.toLowerCase().includes(q) ||
          r.category?.toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [rows, editState, filterText, showUnpricedOnly]);

  const visiblePageRows = filteredRows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);
  const visibleIds = useMemo(() => new Set(filteredRows.map((r) => r.id)), [filteredRows]);

  const unpricedCount = useMemo(
    () => rows.filter((r) => !editState[r.id]?.price).length,
    [rows, editState],
  );

  // Pricing save debounce
  const savePricingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePriceBlur = useCallback(() => {
    if (savePricingDebounceRef.current) clearTimeout(savePricingDebounceRef.current);
    savePricingDebounceRef.current = setTimeout(() => {
      savePricingDebounceRef.current = null;
      const prices: Record<number, string> = {};
      for (const row of rows) prices[row.id] = editState[row.id]?.price ?? '';
      void onSavePricing(prices);
    }, 300);
  }, [rows, editState, onSavePricing]);

  useEffect(() => () => {
    if (savePricingDebounceRef.current) clearTimeout(savePricingDebounceRef.current);
  }, []);

  // ── Pricing actions ────────────────────────────────────────────────────────

  const applyPercentToIds = useCallback(async (ids: number[]) => {
    const pct = Number.parseFloat(retailPercent);
    if (Number.isNaN(pct) || pct <= 0 || ids.length === 0) return;
    const prices: Record<number, string> = {};
    for (const row of rows) prices[row.id] = editState[row.id]?.price ?? '';
    for (const row of rows) {
      if (!ids.includes(row.id)) continue;
      const retail = Number.parseFloat(row.retail_value ?? '');
      prices[row.id] = !Number.isNaN(retail) ? (retail * (pct / 100)).toFixed(2) : (prices[row.id] ?? '');
    }
    setEditState((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (ids.includes(row.id) && prices[row.id] !== undefined) {
          next[row.id] = { ...next[row.id], price: prices[row.id] };
        }
      }
      return next;
    });
    await onSavePricing(prices);
  }, [retailPercent, rows, editState, onSavePricing]);

  const clearPriceForIds = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    const prices: Record<number, string> = {};
    for (const row of rows) prices[row.id] = editState[row.id]?.price ?? '';
    for (const id of ids) prices[id] = '';
    setEditState((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (next[id]) next[id] = { ...next[id], price: '' };
      }
      return next;
    });
    await onSavePricing(prices);
  }, [rows, editState, onSavePricing]);

  const emptyIds = useMemo(() => rows.filter((r) => !editState[r.id]?.price).map((r) => r.id), [rows, editState]);
  const visibleEmptyIds = useMemo(() => rows.filter((r) => visibleIds.has(r.id) && !editState[r.id]?.price).map((r) => r.id), [rows, visibleIds, editState]);

  if (!rows.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No manifest rows to price. Complete previous steps first.
      </Typography>
    );
  }

  const canGoToProcessing = completedStep >= 3 && ['delivered', 'processing', 'complete'].includes(orderStatus);
  const hasPricingData = rows.some((r) => editState[r.id]?.price);

  return (
    <Box>
      {/* ── Top action bar ── */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Unpriced metric */}
        <Chip
          label={unpricedCount === 0 ? 'All rows priced' : `${unpricedCount} unpriced`}
          color={unpricedCount === 0 ? 'success' : 'warning'}
          size="small"
          icon={unpricedCount === 0 ? <CheckCircleOutline /> : undefined}
        />

        {/* Apply % controls */}
        <TextField
          label="% of Retail"
          type="number"
          size="small"
          value={retailPercent}
          onChange={(e) => setRetailPercent(e.target.value)}
          slotProps={{ input: { inputProps: { min: 1, max: 999, step: 1 } } }}
          sx={{ width: 100 }}
        />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>Apply %</Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Apply to all rows">
              <Button variant="outlined" size="small" onClick={() => void applyPercentToIds(rows.map((r) => r.id))}>All</Button>
            </Tooltip>
            <Tooltip title="Apply to selected rows">
              <span>
                <Button variant="outlined" size="small" disabled={selectedRows.size === 0} onClick={() => void applyPercentToIds([...selectedRows])}>Sel</Button>
              </span>
            </Tooltip>
            <Tooltip title="Apply to visible (filtered) rows">
              <Button variant="outlined" size="small" onClick={() => void applyPercentToIds([...visibleIds])}>Visible</Button>
            </Tooltip>
            <Tooltip title="Apply only to unpriced rows">
              <Button variant="outlined" size="small" onClick={() => void applyPercentToIds(emptyIds)}>Empty</Button>
            </Tooltip>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>Clear Prices</Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Clear all prices">
              <Button variant="outlined" size="small" color="warning" onClick={() => void clearPriceForIds(rows.map((r) => r.id))}>All</Button>
            </Tooltip>
            <Tooltip title="Clear selected row prices">
              <span>
                <Button variant="outlined" size="small" color="warning" disabled={selectedRows.size === 0} onClick={() => void clearPriceForIds([...selectedRows])}>Sel</Button>
              </span>
            </Tooltip>
            <Tooltip title="Clear visible row prices">
              <Button variant="outlined" size="small" color="warning" onClick={() => void clearPriceForIds([...visibleIds])}>Visible</Button>
            </Tooltip>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>Select</Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button variant="text" size="small" onClick={() => setSelectedRows(new Set(rows.map((r) => r.id)))}>All</Button>
            <Button variant="text" size="small" onClick={() => setSelectedRows(new Set([...visibleIds]))}>Visible</Button>
            <Button variant="text" size="small" onClick={() => setSelectedRows(new Set(visibleEmptyIds))}>Empty</Button>
            <Button variant="text" size="small" onClick={() => setSelectedRows(new Set())}>Reset</Button>
          </Box>
        </Box>

        {/* Undo Step 4: Clear all pricing */}
        {hasPricingData && (
          <Tooltip title="Clear all prices and reset pricing status (undo Step 4)">
            <span>
              <Button
                variant="outlined" size="small" color="warning"
                startIcon={isClearingPricing ? <CircularProgress size={14} /> : <DeleteOutline />}
                onClick={onClearPricing}
                disabled={isClearingPricing || isSavingPrices}
              >
                {isClearingPricing ? 'Clearing...' : 'Clear Pricing'}
              </Button>
            </span>
          </Tooltip>
        )}

        {isSavingPrices && <CircularProgress size={16} />}
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* ── Filter bar ── */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          sx={{ minWidth: 240 }}
          label="Filter rows"
          placeholder="Search description, title, brand..."
          value={filterText}
          onChange={(e) => { setFilterText(e.target.value); setPage(0); }}
        />
        <Button
          variant={showUnpricedOnly ? 'contained' : 'outlined'}
          size="small"
          color={showUnpricedOnly ? 'warning' : 'inherit'}
          onClick={() => { setShowUnpricedOnly(!showUnpricedOnly); setPage(0); }}
        >
          Unpriced Only
        </Button>
        {(filterText || showUnpricedOnly) && (
          <Button variant="text" size="small" onClick={() => { setFilterText(''); setShowUnpricedOnly(false); setPage(0); }}>
            Clear Filter
          </Button>
        )}
        {(filterText || showUnpricedOnly) && (
          <Typography variant="caption" color="text.secondary">
            {filteredRows.length} of {rows.length} rows
          </Typography>
        )}
        {selectedRows.size > 0 && (
          <Chip label={`${selectedRows.size} selected`} size="small" color="primary" variant="outlined" onDelete={() => setSelectedRows(new Set())} />
        )}
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* ── Table ── */}
      <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 480 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ width: 40 }}>
                <Checkbox
                  size="small"
                  indeterminate={selectedRows.size > 0 && selectedRows.size < filteredRows.length}
                  checked={filteredRows.length > 0 && filteredRows.every((r) => selectedRows.has(r.id))}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedRows(new Set(filteredRows.map((r) => r.id)));
                    else setSelectedRows(new Set());
                  }}
                />
              </TableCell>
              <TableCell sx={{ width: 40 }} />
              <TableCell sx={{ width: 45 }}>#</TableCell>
              <TableCell sx={{ minWidth: 110 }}>Product</TableCell>
              <TableCell sx={{ minWidth: 150 }}>Title</TableCell>
              <TableCell sx={{ minWidth: 90 }}>Brand</TableCell>
              <TableCell sx={{ minWidth: 80 }}>Model</TableCell>
              <TableCell sx={{ width: 55 }}>Qty</TableCell>
              <TableCell sx={{ width: 80 }}>Retail</TableCell>
              <TableCell sx={{ width: 100 }}>Price</TableCell>
              <TableCell sx={{ width: 80 }}>Tier</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visiblePageRows.map((row) => {
              const state = editState[row.id];
              if (!state) return null;
              const isOpen = expandedRows.has(row.id);
              const specs = row.specifications ?? {};
              const hasSpecs = Object.keys(specs).length > 0;
              const topCandidate = row.match_candidates?.[0];
              const isCleaned = Boolean(row.ai_reasoning);
              const isSelected = selectedRows.has(row.id);

              return (
                <Fragment key={row.id}>
                  <TableRow
                    hover
                    selected={isSelected}
                    sx={{ cursor: 'pointer', '& > *': { borderBottom: isOpen ? 'unset' : undefined } }}
                    onClick={() => toggleExpanded(row.id)}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        size="small"
                        checked={isSelected}
                        onChange={(e) => {
                          setSelectedRows((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleExpanded(row.id); }}>
                        {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell>{row.row_number}</TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 130 }}>
                        {row.matched_product_title || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <TextField fullWidth size="small" value={state.title} onChange={(e) => updateField(row.id, 'title', e.target.value)} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <TextField fullWidth size="small" value={state.brand} onChange={(e) => updateField(row.id, 'brand', e.target.value)} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <TextField fullWidth size="small" value={state.model} onChange={(e) => updateField(row.id, 'model', e.target.value)} />
                    </TableCell>
                    <TableCell>{row.quantity}</TableCell>
                    <TableCell>{formatCurrency(row.retail_value)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <TextField
                        fullWidth size="small" type="number"
                        value={state.price}
                        onChange={(e) => updateField(row.id, 'price', e.target.value)}
                        onBlur={handlePriceBlur}
                        slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
                      />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <TextField
                        select fullWidth size="small"
                        value={state.batch_flag ? 'batch' : 'individual'}
                        onChange={(e) => updateField(row.id, 'batch_flag', e.target.value === 'batch')}
                      >
                        <MenuItem value="individual">Indv</MenuItem>
                        <MenuItem value="batch">Batch</MenuItem>
                      </TextField>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell sx={{ py: 0, px: 0 }} colSpan={11}>
                      <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 1.5 }}>
                          <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
                            <Chip size="small" label={MATCH_STATUS_LABELS[row.match_status] ?? row.match_status} color={row.match_status === 'matched' ? 'success' : 'default'} variant="outlined" />
                            {row.ai_match_decision && (
                              <Chip size="small" label={AI_MATCH_DECISION_LABELS[row.ai_match_decision] ?? row.ai_match_decision}
                                color={row.ai_match_decision === 'confirmed' ? 'success' : row.ai_match_decision === 'rejected' || row.ai_match_decision === 'new_product' ? 'error' : row.ai_match_decision === 'uncertain' ? 'warning' : 'default'}
                                variant="outlined"
                              />
                            )}
                            <Chip size="small" label={PRICING_STAGE_LABELS[row.pricing_stage] ?? row.pricing_stage} color={row.pricing_stage === 'final' ? 'success' : row.pricing_stage === 'draft' ? 'warning' : 'default'} variant="outlined" />
                            <Chip size="small" label={state.batch_flag ? 'Batch' : 'Individual'} variant="outlined" />
                          </Box>
                          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 1.5 }}>
                            <Paper variant="outlined" sx={{ p: 1.5 }}>
                              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Manifest Source</Typography>
                              <DetailField label="Description" value={row.description} />
                              <DetailField label="Brand" value={row.brand} />
                              <DetailField label="Model" value={row.model} />
                              <DetailField label="Category" value={row.category} />
                              <DetailField label="Condition" value={row.condition} />
                              <DetailField label="Retail Value" value={row.retail_value ?? ''} />
                              <DetailField label="UPC" value={row.upc} />
                              <DetailField label="Qty" value={String(row.quantity)} />
                              {hasSpecs && (
                                <Box sx={{ mb: 0.75 }}>
                                  <Typography variant="caption" color="text.secondary">Specifications</Typography>
                                  <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', m: 0, mt: 0.5, '& dt': { fontWeight: 600, fontSize: '0.7rem', color: 'text.secondary' }, '& dd': { m: 0, fontSize: '0.7rem' } }}>
                                    {Object.entries(specs).map(([k, v]) => (
                                      <Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></Fragment>
                                    ))}
                                  </Box>
                                </Box>
                              )}
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 1.5 }}>
                              <Typography variant="subtitle2" color="text.secondary" gutterBottom>AI Suggestions</Typography>
                              {isCleaned ? (
                                <>
                                  <DetailField label="AI Title" value={row.ai_suggested_title} changed={!!row.ai_suggested_title && row.description !== row.ai_suggested_title} />
                                  <DetailField label="AI Brand" value={row.ai_suggested_brand} changed={!!row.ai_suggested_brand && row.brand !== row.ai_suggested_brand} />
                                  <DetailField label="AI Model" value={row.ai_suggested_model} changed={!!row.ai_suggested_model && row.model !== row.ai_suggested_model} />
                                  <DetailField label="Search Tags" value={row.search_tags} />
                                  {row.ai_reasoning && (
                                    <Box sx={{ mt: 0.75, p: 1, borderLeft: 3, borderColor: 'info.main', bgcolor: 'action.hover', borderRadius: '0 4px 4px 0' }}>
                                      <Typography variant="caption" color="text.secondary" display="block">AI Reasoning</Typography>
                                      <Typography variant="body2">{row.ai_reasoning}</Typography>
                                    </Box>
                                  )}
                                  {topCandidate && (
                                    <Box sx={{ mt: 0.75 }}>
                                      <Typography variant="caption" color="text.secondary">Matched Product</Typography>
                                      <Typography variant="body2">{row.matched_product_title || topCandidate.product_title}</Typography>
                                      <Typography variant="caption" color="text.secondary">{Math.round((topCandidate.score ?? 0) * 100)}% {topCandidate.match_type || ''}</Typography>
                                    </Box>
                                  )}
                                </>
                              ) : (
                                <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>No AI cleanup data.</Typography>
                              )}
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 1.5 }}>
                              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Finalized Fields</Typography>
                              <DetailField label="Title" value={state.title} />
                              <DetailField label="Brand" value={state.brand} />
                              <DetailField label="Model" value={state.model} />
                              <DetailField label="Search Tags" value={state.search_tags} />
                              <DetailField label="Tier" value={state.batch_flag ? 'Batch' : 'Individual'} />
                              <DetailField label="Price" value={state.price ? formatCurrency(state.price) : ''} />
                            </Paper>
                          </Box>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filteredRows.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={ROWS_PER_PAGE}
          rowsPerPageOptions={[ROWS_PER_PAGE]}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} of ${count}`}
        />
      </TableContainer>

      {/* ── Bottom bar: status + Go to Processing ── */}
      <Box sx={{ mt: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        {completedStep >= 3 && (
          <Alert severity="success" icon={<CheckCircleOutline />} sx={{ py: 0.5, px: 1.5, flex: 1 }}>
            Preprocessing complete.
          </Alert>
        )}
        {canGoToProcessing && (
          <Button
            variant="contained"
            startIcon={isCreatingItems ? <CircularProgress size={16} /> : <PlayArrow />}
            onClick={() => void onNavigateToProcessing()}
            disabled={isCreatingItems}
          >
            {isCreatingItems ? 'Building queue...' : 'Go to Processing'}
          </Button>
        )}
        {completedStep >= 3 && !canGoToProcessing && (
          <Typography variant="caption" color="text.secondary">
            Order must be delivered before you can go to Processing.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
