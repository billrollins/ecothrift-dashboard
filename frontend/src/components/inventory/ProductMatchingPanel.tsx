import { Fragment, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Typography,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Cancel from '@mui/icons-material/Cancel';
import SystemUpdateAlt from '@mui/icons-material/SystemUpdateAlt';
import DoneAll from '@mui/icons-material/DoneAll';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import type { ManifestRow } from '../../types/inventory.types';
import type { ReviewMatchDecision } from '../../api/inventory.api';

interface MatchSummary {
  total: number;
  matched: number;
  pending_review: number;
  confirmed: number;
  uncertain: number;
  new_product: number;
}

interface ProductMatchingPanelProps {
  orderId: number;
  rows: ManifestRow[];
  matchSummary: MatchSummary;
  onRunMatching: () => void;
  onConfirmProducts: (decisions: ReviewMatchDecision[]) => void;
  onClearMatching: () => void;
  isMatching: boolean;
  isSubmitting: boolean;
  isClearingMatching: boolean;
  completedStep: number;
}

function FieldComparison({
  label,
  existing,
  manifest,
}: {
  label: string;
  existing: string;
  manifest: string;
}) {
  const changed = !!manifest && !!existing && manifest !== existing;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 1, py: 0.5, alignItems: 'baseline' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: changed ? 'text.disabled' : 'text.primary' }}>
        {existing || '—'}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: changed ? 700 : 400, color: changed ? 'warning.dark' : 'text.primary' }}
      >
        {manifest || '—'}
      </Typography>
    </Box>
  );
}

export function ProductMatchingPanel({
  orderId,
  rows,
  matchSummary,
  onRunMatching,
  onConfirmProducts,
  onClearMatching,
  isMatching,
  isSubmitting,
  isClearingMatching,
  completedStep,
}: ProductMatchingPanelProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<Record<number, ReviewMatchDecision>>({});

  const matchingDone = rows.some((r) => r.match_candidates?.length > 0 || r.ai_match_decision);

  const matchedRows = rows.filter(
    (r) => r.ai_match_decision === 'confirmed' || r.ai_match_decision === 'uncertain' || r.ai_match_decision === 'pending_review',
  ).filter((r) => r.matched_product || (r.match_candidates?.length ?? 0) > 0);

  const newProductRows = rows.filter(
    (r) => r.ai_match_decision === 'new_product' || (!r.matched_product && !(r.match_candidates?.length)),
  );

  const setDecision = (rowId: number, d: ReviewMatchDecision) => {
    setDecisions((prev) => ({ ...prev, [rowId]: d }));
  };

  const clearDecision = (rowId: number) => {
    setDecisions((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  };

  const handleAcceptAll = () => {
    const next: Record<number, ReviewMatchDecision> = { ...decisions };
    for (const row of matchedRows) {
      if (!next[row.id]) {
        const productId = row.matched_product || row.match_candidates?.[0]?.product_id;
        if (productId) {
          next[row.id] = { row_id: row.id, decision: 'accept', product_id: productId };
        }
      }
    }
    setDecisions(next);

    const allDecisions: ReviewMatchDecision[] = [];
    for (const row of rows) {
      const d = next[row.id];
      if (d) {
        allDecisions.push(d);
      } else if (row.matched_product || (row.match_candidates?.length ?? 0) > 0) {
        const productId = row.matched_product || row.match_candidates?.[0]?.product_id;
        allDecisions.push({ row_id: row.id, decision: 'accept', product_id: productId });
      } else {
        allDecisions.push({ row_id: row.id, decision: 'reject' });
      }
    }
    onConfirmProducts(allDecisions);
  };

  const decisionCount = Object.keys(decisions).length;
  const undecidedMatchedRows = matchedRows.filter((r) => !decisions[r.id]);

  return (
    <Box>
      {/* ── Top action bar ── */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button
          variant="contained"
          size="small"
          startIcon={isMatching ? <CircularProgress size={14} /> : <Search />}
          onClick={onRunMatching}
          disabled={isMatching}
        >
          {isMatching ? 'Matching...' : matchingDone ? 'Re-run' : 'Run Matching'}
        </Button>
        {matchingDone && undecidedMatchedRows.length > 0 && (
          <Button size="small" variant="outlined" startIcon={<DoneAll />} onClick={handleAcceptAll} disabled={isSubmitting}>
            {isSubmitting ? 'Confirming...' : `Accept All (${undecidedMatchedRows.length})`}
          </Button>
        )}
        {/* Undo Step 3 — clear all matching */}
        {completedStep >= 2 && (
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={isClearingMatching ? <CircularProgress size={14} /> : <DeleteOutline />}
            onClick={onClearMatching}
            disabled={isClearingMatching}
          >
            {isClearingMatching ? 'Clearing...' : 'Clear Matching'}
          </Button>
        )}
      </Box>

      {isMatching && <LinearProgress sx={{ mb: 2 }} />}

      <Divider sx={{ my: 1.5 }} />

      {/* Summary */}
      {matchingDone && (
        <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
          <Chip label={`${matchSummary.confirmed} Confirmed`} color="success" size="small" />
          <Chip label={`${matchSummary.uncertain} Uncertain`} color="warning" size="small" />
          <Chip label={`${matchSummary.pending_review} Pending Review`} size="small" />
          <Chip label={`${matchSummary.new_product} New Products`} color="info" size="small" />
        </Box>
      )}

      {matchingDone && <Divider sx={{ my: 1.5 }} />}

      {/* ── Matched Rows ── */}
      {matchingDone && matchedRows.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Matched Products ({matchedRows.length})
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These rows matched existing products. Review each match and decide whether to keep existing
            product details or update them with the AI-cleaned data.
          </Typography>

          {matchedRows.map((row) => {
            const isOpen = expandedRow === row.id;
            const d = decisions[row.id];
            const productId = row.matched_product || row.match_candidates?.[0]?.product_id;
            const productTitle = row.matched_product_title || row.match_candidates?.[0]?.product_title || '—';
            const score = row.match_candidates?.[0]?.score;
            const matchType = row.match_candidates?.[0]?.match_type;
            const aiTitle = row.ai_suggested_title || row.title || row.description;
            const aiBrand = row.ai_suggested_brand || row.brand;
            const aiModel = row.ai_suggested_model || row.model;

            return (
              <Paper key={row.id} variant="outlined" sx={{ mb: 1, overflow: 'hidden' }}>
                <Box
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, cursor: 'pointer',
                    bgcolor: d ? (d.decision === 'reject' ? 'error.50' : d.update_product ? 'info.50' : 'success.50') : undefined,
                  }}
                  onClick={() => setExpandedRow(isOpen ? null : row.id)}
                >
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); setExpandedRow(isOpen ? null : row.id); }}>
                    {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                  </IconButton>
                  <Chip label={`#${row.row_number}`} size="small" variant="outlined" />
                  <Typography variant="body2" fontWeight={500} noWrap sx={{ flex: 1, minWidth: 0 }}>
                    {aiTitle}
                  </Typography>
                  {score != null && (
                    <Chip
                      label={`${Math.round(score * 100)}% ${matchType || ''}`}
                      size="small"
                      color={score >= 0.95 ? 'success' : score >= 0.5 ? 'warning' : 'default'}
                      variant="outlined"
                    />
                  )}
                  {d ? (
                    <Chip
                      label={d.decision === 'reject' ? 'New Product' : d.update_product ? 'Update Product' : 'Accepted'}
                      size="small"
                      color={d.decision === 'reject' ? 'error' : d.update_product ? 'info' : 'success'}
                    />
                  ) : (
                    <Typography variant="caption" color="text.disabled">No decision</Typography>
                  )}
                </Box>

                <Collapse in={isOpen}>
                  <Box sx={{ px: 2, pb: 2 }}>
                    {/* Comparison header */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 1, mb: 1, mt: 1 }}>
                      <Box />
                      <Typography variant="caption" fontWeight={600} color="text.secondary">Existing Product</Typography>
                      <Typography variant="caption" fontWeight={600} color="text.secondary">Manifest / AI Data</Typography>
                    </Box>

                    <FieldComparison label="Title" existing={productTitle} manifest={aiTitle} />
                    <FieldComparison label="Brand" existing={row.matched_product_number ? aiBrand : ''} manifest={aiBrand} />
                    <FieldComparison label="Model" existing="" manifest={aiModel} />
                    <FieldComparison label="UPC" existing="" manifest={row.upc} />
                    <FieldComparison label="Category" existing="" manifest={row.category} />

                    {row.ai_reasoning && (
                      <Box sx={{ mt: 1, p: 1.5, borderLeft: 3, borderColor: 'info.main', bgcolor: 'action.hover', borderRadius: '0 4px 4px 0' }}>
                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>AI Reasoning</Typography>
                        <Typography variant="body2">{row.ai_reasoning}</Typography>
                      </Box>
                    )}

                    {/* Action buttons */}
                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                      <Button
                        size="small"
                        variant={d?.decision === 'accept' && !d.update_product ? 'contained' : 'outlined'}
                        color="success"
                        startIcon={<CheckCircle />}
                        onClick={() => setDecision(row.id, { row_id: row.id, decision: 'accept', product_id: productId })}
                      >
                        Accept Match
                      </Button>
                      <Button
                        size="small"
                        variant={d?.decision === 'accept' && d.update_product ? 'contained' : 'outlined'}
                        color="info"
                        startIcon={<SystemUpdateAlt />}
                        onClick={() => setDecision(row.id, { row_id: row.id, decision: 'accept', product_id: productId, update_product: true })}
                      >
                        Accept & Update Product
                      </Button>
                      <Button
                        size="small"
                        variant={d?.decision === 'reject' ? 'contained' : 'outlined'}
                        color="error"
                        startIcon={<Cancel />}
                        onClick={() => setDecision(row.id, { row_id: row.id, decision: 'reject' })}
                      >
                        Create New Product
                      </Button>
                      {d && (
                        <Button size="small" variant="text" onClick={() => clearDecision(row.id)}>Undo</Button>
                      )}
                    </Box>
                  </Box>
                </Collapse>
              </Paper>
            );
          })}
        </Box>
      )}

      {/* ── New Products ── */}
      {matchingDone && newProductRows.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            New Products ({newProductRows.length})
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No existing product match was found for these rows. New products will be created from the AI-cleaned data.
          </Typography>

          {newProductRows.map((row) => {
            const aiTitle = row.ai_suggested_title || row.title || row.description;
            const aiBrand = row.ai_suggested_brand || row.brand;
            const aiModel = row.ai_suggested_model || row.model;

            return (
              <Paper key={row.id} variant="outlined" sx={{ mb: 1, px: 2, py: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Chip label={`#${row.row_number}`} size="small" variant="outlined" />
                  <Typography variant="body2" fontWeight={500} sx={{ flex: 1, minWidth: 0 }} noWrap>
                    {aiTitle}
                  </Typography>
                  {aiBrand && <Chip label={aiBrand} size="small" variant="outlined" />}
                  {aiModel && <Chip label={aiModel} size="small" variant="outlined" />}
                  <Chip label="New Product" size="small" color="info" />
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      {!matchingDone && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Run product matching to find existing products that match your manifest rows.
        </Alert>
      )}

      {matchingDone && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          {decisionCount} manual decision(s) · {matchedRows.length} matched · {newProductRows.length} new
        </Typography>
      )}
    </Box>
  );
}
