import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Cancel from '@mui/icons-material/Cancel';
import Edit from '@mui/icons-material/Edit';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import DoneAll from '@mui/icons-material/DoneAll';
import type { ManifestRow, MatchCandidate, AIMatchDecision } from '../../types/inventory.types';
import type { ReviewMatchDecision } from '../../api/inventory.api';

const DECISION_COLORS: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  confirmed: 'success',
  rejected: 'error',
  uncertain: 'warning',
  new_product: 'info',
  pending_review: 'default',
};

const DECISION_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  uncertain: 'Uncertain',
  new_product: 'New Product',
  pending_review: 'Pending Review',
};

interface MatchReviewPanelProps {
  rows: ManifestRow[];
  summary: {
    total: number;
    matched: number;
    pending_review: number;
    confirmed: number;
    uncertain: number;
    new_product: number;
  };
  onRunMatching: () => void;
  onSubmitReviews: (decisions: ReviewMatchDecision[]) => void;
  isRunning: boolean;
  isSubmitting: boolean;
}

export function MatchReviewPanel({
  rows,
  summary,
  onRunMatching,
  onSubmitReviews,
  isRunning,
  isSubmitting,
}: MatchReviewPanelProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [localDecisions, setLocalDecisions] = useState<Record<number, ReviewMatchDecision>>({});
  const [modifyDialog, setModifyDialog] = useState<{ row: ManifestRow } | null>(null);
  const [modifyFields, setModifyFields] = useState({ title: '', brand: '', model: '' });

  const hasResults = rows.some((r) => r.match_candidates?.length > 0 || r.ai_match_decision);

  const pendingCount = rows.filter(
    (r) => !localDecisions[r.id] && r.ai_match_decision !== 'confirmed' && r.match_status !== 'matched',
  ).length;

  const handleAccept = (row: ManifestRow, productId?: number) => {
    setLocalDecisions((prev) => ({
      ...prev,
      [row.id]: {
        row_id: row.id,
        decision: 'accept',
        product_id: productId || row.matched_product || row.match_candidates?.[0]?.product_id,
      },
    }));
  };

  const handleReject = (row: ManifestRow) => {
    setLocalDecisions((prev) => ({
      ...prev,
      [row.id]: { row_id: row.id, decision: 'reject' },
    }));
  };

  const openModifyDialog = (row: ManifestRow) => {
    setModifyFields({
      title: row.ai_suggested_title || row.title || row.description,
      brand: row.ai_suggested_brand || row.brand,
      model: row.ai_suggested_model || row.model,
    });
    setModifyDialog({ row });
  };

  const handleModifyConfirm = () => {
    if (!modifyDialog) return;
    setLocalDecisions((prev) => ({
      ...prev,
      [modifyDialog.row.id]: {
        row_id: modifyDialog.row.id,
        decision: 'modify',
        modifications: { ...modifyFields },
      },
    }));
    setModifyDialog(null);
  };

  const handleAcceptAllConfirmed = () => {
    const newDecisions: Record<number, ReviewMatchDecision> = { ...localDecisions };
    for (const row of rows) {
      if (row.ai_match_decision === 'confirmed' && !newDecisions[row.id] && row.matched_product) {
        newDecisions[row.id] = {
          row_id: row.id,
          decision: 'accept',
          product_id: row.matched_product,
        };
      }
    }
    setLocalDecisions(newDecisions);
  };

  const handleSubmit = () => {
    const allDecisions: ReviewMatchDecision[] = [];

    for (const row of rows) {
      if (localDecisions[row.id]) {
        allDecisions.push(localDecisions[row.id]);
      } else if (row.ai_match_decision === 'new_product' || (row.ai_match_decision !== 'confirmed' && !row.matched_product)) {
        allDecisions.push({ row_id: row.id, decision: 'reject' });
      }
    }

    onSubmitReviews(allDecisions);
  };

  if (!hasResults) {
    return (
      <Box>
        <Alert severity="info" sx={{ mb: 2 }}>
          Run product matching to find existing products in the catalog that match your manifest rows.
          AI will help identify matches and suggest new product data for unmatched rows.
        </Alert>
        <Button
          variant="contained"
          onClick={onRunMatching}
          disabled={isRunning}
          startIcon={isRunning ? <CircularProgress size={16} /> : undefined}
        >
          {isRunning ? 'Matching in progress...' : 'Run Matching'}
        </Button>
        {isRunning && <LinearProgress sx={{ mt: 2 }} />}
      </Box>
    );
  }

  return (
    <Box>
      {/* Summary bar */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip label={`${summary.confirmed} Confirmed`} color="success" size="small" />
        <Chip label={`${summary.uncertain} Uncertain`} color="warning" size="small" />
        <Chip label={`${summary.pending_review} Pending`} size="small" />
        <Chip label={`${summary.new_product} New Products`} color="info" size="small" />
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" variant="outlined" startIcon={<DoneAll />} onClick={handleAcceptAllConfirmed}>
          Accept All Confirmed
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={onRunMatching}
          disabled={isRunning}
        >
          Re-run Matching
        </Button>
      </Box>

      {/* Results table */}
      <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 500 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 40 }} />
              <TableCell sx={{ width: 60 }}>Row</TableCell>
              <TableCell>Title / Description</TableCell>
              <TableCell>Brand</TableCell>
              <TableCell sx={{ width: 130 }}>AI Decision</TableCell>
              <TableCell>Matched Product</TableCell>
              <TableCell sx={{ width: 160 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const decision = localDecisions[row.id];
              const isExpanded = expandedRow === row.id;

              return (
                <TableRow
                  key={row.id}
                  sx={{
                    bgcolor: decision
                      ? decision.decision === 'accept'
                        ? 'success.50'
                        : decision.decision === 'reject'
                          ? 'error.50'
                          : 'info.50'
                      : undefined,
                  }}
                >
                  <TableCell>
                    <IconButton size="small" onClick={() => setExpandedRow(isExpanded ? null : row.id)}>
                      {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                    </IconButton>
                  </TableCell>
                  <TableCell>{row.row_number}</TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 250 }}>
                      {row.title || row.description}
                    </Typography>
                    {isExpanded && row.ai_reasoning && (
                      <Collapse in={isExpanded}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          AI: {row.ai_reasoning}
                        </Typography>
                        {row.match_candidates?.map((c, i) => (
                          <Typography key={i} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Candidate {i + 1}: {c.product_title} (score: {c.score}, {c.match_type})
                          </Typography>
                        ))}
                      </Collapse>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>{row.brand}</Typography>
                  </TableCell>
                  <TableCell>
                    {decision ? (
                      <Chip
                        label={decision.decision === 'accept' ? 'Accepted' : decision.decision === 'reject' ? 'Rejected' : 'Modified'}
                        color={decision.decision === 'accept' ? 'success' : decision.decision === 'reject' ? 'error' : 'info'}
                        size="small"
                      />
                    ) : (
                      <Chip
                        label={DECISION_LABELS[row.ai_match_decision] || row.ai_match_decision || 'N/A'}
                        color={DECISION_COLORS[row.ai_match_decision] || 'default'}
                        size="small"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {row.matched_product_title || row.ai_suggested_title || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {!decision && (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Accept match">
                          <IconButton size="small" color="success" onClick={() => handleAccept(row)}>
                            <CheckCircle fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reject (create new product)">
                          <IconButton size="small" color="error" onClick={() => handleReject(row)}>
                            <Cancel fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Modify">
                          <IconButton size="small" color="info" onClick={() => openModifyDialog(row)}>
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                    {decision && (
                      <Button size="small" variant="text" onClick={() => {
                        setLocalDecisions((prev) => {
                          const next = { ...prev };
                          delete next[row.id];
                          return next;
                        });
                      }}>
                        Undo
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Submit button */}
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
          {Object.keys(localDecisions).length} decision(s) made, {pendingCount} pending
        </Typography>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={16} /> : undefined}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Reviews'}
        </Button>
      </Box>

      {/* Modify dialog */}
      <Dialog open={!!modifyDialog} onClose={() => setModifyDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Modify Product Data</DialogTitle>
        <DialogContent>
          <TextField
            label="Title"
            fullWidth
            size="small"
            value={modifyFields.title}
            onChange={(e) => setModifyFields((prev) => ({ ...prev, title: e.target.value }))}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label="Brand"
            fullWidth
            size="small"
            value={modifyFields.brand}
            onChange={(e) => setModifyFields((prev) => ({ ...prev, brand: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Model"
            fullWidth
            size="small"
            value={modifyFields.model}
            onChange={(e) => setModifyFields((prev) => ({ ...prev, model: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModifyDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleModifyConfirm}>Save as New Product</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
