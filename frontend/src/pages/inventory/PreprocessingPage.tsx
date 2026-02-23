import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Lock from '@mui/icons-material/Lock';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useClearManifestRows,
  useCreateItems,
  useFinalizeRows,
  useManifestRows,
  useMatchProducts,
  useMatchResults,
  usePreviewStandardize,
  useProcessManifest,
  usePurchaseOrder,
  useReviewMatches,
  useSuggestFormulas,
  useUpdateManifestPricing,
  useCancelAICleanup,
  useUndoProductMatching,
  useClearPricing,
} from '../../hooks/useInventory';
import { useStandardManifest } from '../../hooks/useStandardManifest';
import { StandardManifestBuilder } from '../../components/inventory/StandardManifestBuilder';
import { StandardManifestPreview } from '../../components/inventory/StandardManifestPreview';
import { RowProcessingPanel } from '../../components/inventory/RowProcessingPanel';
import { ProductMatchingPanel } from '../../components/inventory/ProductMatchingPanel';
import { FinalizePanel } from '../../components/inventory/FinalizePanel';
import type { ManifestColumnMapping, ReviewMatchDecision, FinalizeRowData } from '../../api/inventory.api';
import type { ManifestRow } from '../../types/inventory.types';

const STEPS = ['Standardize Manifest', 'AI Cleanup', 'Product Matching', 'Pricing'];

type StepState = 'selected' | 'done' | 'ready' | 'notReady';

/**
 * Derives the highest fully-completed step (0-indexed).
 * -1  = nothing done (no manifest rows)
 *  0  = standardized (rows exist)
 *  1  = AI cleanup complete (all rows have ai_reasoning)
 *  2  = product matching confirmed
 *  3  = pricing complete (all rows pricing_stage === 'final')
 *
 * This is the single source of truth. Undo operations clear data and
 * cause this function to return a lower value, which re-gates the UI.
 */
function deriveCompletedStep(manifestRows: ManifestRow[]): number {
  if (manifestRows.length === 0) return -1;

  const allCleaned = manifestRows.every((r) => r.ai_reasoning);
  if (!allCleaned) return 0;

  const hasMatchDecisions = manifestRows.some(
    (r) =>
      r.matched_product ||
      (r.match_candidates?.length ?? 0) > 0 ||
      (r.ai_match_decision && r.ai_match_decision !== 'pending_review'),
  );
  if (!hasMatchDecisions) return 1;

  const allPriced = manifestRows.every((r) => r.pricing_stage === 'final');
  if (!allPriced) return 2;

  return 3;
}

function getStepState(index: number, activeStep: number, completedStep: number): StepState {
  if (index === activeStep) return 'selected';
  if (index <= completedStep) return 'done';
  if (index === completedStep + 1) return 'ready';
  return 'notReady';
}

export default function PreprocessingPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id ? Number.parseInt(id, 10) : null;
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { data: order, isLoading } = usePurchaseOrder(orderId);
  const previewStandardize = usePreviewStandardize();
  const processManifest = useProcessManifest();
  const updateManifestPricing = useUpdateManifestPricing();
  const suggestFormulasMutation = useSuggestFormulas();
  const matchProductsMutation = useMatchProducts();
  const reviewMatchesMutation = useReviewMatches();
  const clearManifestRowsMutation = useClearManifestRows();
  const cancelAICleanupMutation = useCancelAICleanup();
  const undoProductMatchingMutation = useUndoProductMatching();
  const clearPricingMutation = useClearPricing();
  const { data: matchResultsData } = useMatchResults(orderId);
  const finalizeRowsMutation = useFinalizeRows();
  const createItemsMutation = useCreateItems();

  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [stepDerived, setStepDerived] = useState(false);

  // Step 1 (Standardize) state
  const [aiReasonings, setAiReasonings] = useState<Record<string, string>>({});
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewMeta, setPreviewMeta] = useState<{ rowCountInFile?: number; rowsSelected?: number }>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rawReferenceOpen, setRawReferenceOpen] = useState(false);
  const [processResult, setProcessResult] = useState<{ rows_created: number } | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const standardizedFormulasRef = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    if (orderId) localStorage.setItem('lastPreprocessOrderId', String(orderId));
  }, [orderId]);

  const manifestRows = useMemo(
    () => (order as { manifest_rows?: ManifestRow[] } | null)?.manifest_rows ?? [],
    [order],
  );

  const completedStep = useMemo(() => deriveCompletedStep(manifestRows), [manifestRows]);

  const stepDerivedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!orderId || !order || stepDerivedRef.current === orderId) return;
    stepDerivedRef.current = orderId;
    setActiveStep(Math.min(completedStep + 1, STEPS.length - 1));
    setStepDerived(true);
  }, [orderId, order?.id, completedStep]);

  const hasManifestFileForParams = !!order?.manifest_file;
  const rawManifestParams = useMemo(() => {
    if (!hasManifestFileForParams) return undefined;
    return { limit: 100 };
  }, [hasManifestFileForParams]);

  const {
    data: manifestRowsRawData,
    isLoading: manifestRowsRawLoading,
  } = useManifestRows(orderId, rawManifestParams);

  const headers = manifestRowsRawData?.headers ?? order?.manifest_preview?.headers ?? [];
  const headerSignature = manifestRowsRawData?.signature ?? order?.manifest_preview?.signature ?? '';
  const standardColumns = manifestRowsRawData?.standard_columns ?? [];
  const templateMappings = (
    manifestRowsRawData?.template_mappings
    ?? order?.manifest_preview?.template_mappings
    ?? []
  ) as ManifestColumnMapping[];
  const templateId = manifestRowsRawData?.template_id ?? order?.manifest_preview?.template_id ?? undefined;
  const templateName = manifestRowsRawData?.template_name ?? order?.manifest_preview?.template_name ?? '';
  const rawManifestRows = manifestRowsRawData?.rows ?? order?.manifest_preview?.rows ?? [];
  const rawSampleRows = rawManifestRows.slice(0, 5);
  const rawHeaders = headers.length ? headers : Object.keys(rawSampleRows[0]?.raw ?? {});

  const {
    columns,
    formulas,
    setFormula,
    setAllFormulas,
    formulaMappings,
    hasMapping,
  } = useStandardManifest({
    signature: headerSignature,
    headers,
    standardColumns,
    initialMappings: templateMappings,
  });

  // Auto-preview when search input changes (debounced)
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      if (!orderId || !order?.manifest_file) return;
      void previewStandardize.mutateAsync({
        orderId,
        data: {
          template_id: templateId,
          column_mappings: formulaMappings,
          preview_limit: 100,
          search_term: value.trim() || undefined,
        },
      }).then((result) => {
        setPreviewRows(result.normalized_preview || []);
        setPreviewMeta({ rowCountInFile: result.row_count_in_file, rowsSelected: result.rows_selected });
        setPreviewOpen(true);
      }).catch(() => {
        enqueueSnackbar('Preview failed', { variant: 'error' });
      });
    }, 500);
  }, [orderId, order?.manifest_file, templateId, formulaMappings, previewStandardize, enqueueSnackbar]);

  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSuggestFormulas = async () => {
    if (!orderId) return;
    try {
      const result = await suggestFormulasMutation.mutateAsync({
        orderId,
        data: { template_id: templateId },
      });
      const newFormulas: Record<string, string> = {};
      const newReasonings: Record<string, string> = {};
      for (const s of result.suggestions) {
        if (s.target && s.formula) {
          newFormulas[s.target] = s.formula;
          if (s.reasoning) newReasonings[s.target] = s.reasoning;
        }
      }
      setAllFormulas(newFormulas);
      setAiReasonings(newReasonings);
      enqueueSnackbar(`AI suggested formulas for ${result.suggestions.length} field(s)`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to get AI suggestions', { variant: 'error' });
    }
  };

  const handleStandardizeManifest = async () => {
    if (!orderId || !order?.manifest_file) return;
    if (!hasMapping('description')) {
      enqueueSnackbar('Set a formula for Description before standardizing', { variant: 'warning' });
      return;
    }
    if (!hasMapping('retail_value')) {
      enqueueSnackbar('Set a formula for Retail Cost before standardizing — required for pricing', { variant: 'warning' });
      return;
    }
    if (completedStep >= 1) {
      const ok = window.confirm(
        'Re-standardizing will clear all AI Cleanup, Product Matching, and Pricing data. Continue?',
      );
      if (!ok) return;
    }
    try {
      const result = await processManifest.mutateAsync({
        orderId,
        data: {
          template_id: templateId,
          column_mappings: formulaMappings,
          save_template: true,
          template_name: templateName || undefined,
        },
      });
      setProcessResult({ rows_created: result.rows_created });
      standardizedFormulasRef.current = { ...formulas };
      enqueueSnackbar(`Standardized ${result.rows_created} row(s)`, { variant: 'success' });
      setActiveStep(1);
    } catch {
      enqueueSnackbar('Failed to standardize manifest', { variant: 'error' });
    }
  };

  const handleClearStandardization = async () => {
    if (!orderId) return;
    // Block if items already exist
    if (order && order.item_count > 0) {
      enqueueSnackbar('Cannot clear manifest — items have already been created. Undo the check-in queue first.', { variant: 'error' });
      return;
    }
    const parts: string[] = ['standardized rows'];
    if (completedStep >= 1) parts.push('AI cleanup data');
    if (completedStep >= 2) parts.push('product matching');
    if (completedStep >= 3) parts.push('pricing');
    const ok = window.confirm(`This will permanently delete all ${parts.join(', ')}. Continue?`);
    if (!ok) return;
    try {
      const result = await clearManifestRowsMutation.mutateAsync(orderId);
      enqueueSnackbar(`Cleared ${result.rows_deleted} manifest rows`, { variant: 'info' });
      setProcessResult(null);
      standardizedFormulasRef.current = null;
      setActiveStep(0);
      setStepDerived(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      enqueueSnackbar(axiosErr?.response?.data?.detail || 'Failed to clear standardization', { variant: 'error' });
    }
  };

  const handleClearAICleanup = async () => {
    if (!orderId) return;
    // cascade warning: also clears matching
    const msg = completedStep >= 2
      ? 'Clearing AI Cleanup will also reset Product Matching data. Pricing will be preserved. Continue?'
      : 'This will clear all AI cleanup data. Continue?';
    const ok = window.confirm(msg);
    if (!ok) return;
    try {
      await cancelAICleanupMutation.mutateAsync(orderId);
      enqueueSnackbar('AI cleanup and product matching data cleared', { variant: 'info' });
      setActiveStep(1);
    } catch {
      enqueueSnackbar('Failed to clear AI cleanup', { variant: 'error' });
    }
  };

  const handleClearMatching = async () => {
    if (!orderId) return;
    const ok = window.confirm('This will clear all product matching decisions. Pricing will be preserved. Continue?');
    if (!ok) return;
    try {
      await undoProductMatchingMutation.mutateAsync(orderId);
      enqueueSnackbar('Product matching cleared', { variant: 'info' });
      setActiveStep(2);
    } catch {
      enqueueSnackbar('Failed to clear product matching', { variant: 'error' });
    }
  };

  const handleClearPricing = async () => {
    if (!orderId) return;
    const ok = window.confirm('This will clear all prices and reset pricing status to unpriced. Continue?');
    if (!ok) return;
    try {
      await clearPricingMutation.mutateAsync(orderId);
      enqueueSnackbar('Pricing cleared', { variant: 'info' });
      setActiveStep(3);
    } catch {
      enqueueSnackbar('Failed to clear pricing', { variant: 'error' });
    }
  };

  const handleRunMatching = async () => {
    if (!orderId) return;
    try {
      const result = await matchProductsMutation.mutateAsync({ orderId, data: { use_ai: true } });
      enqueueSnackbar(
        `Matching complete: ${result.confirmed} confirmed, ${result.uncertain} uncertain, ${result.new_products} new`,
        { variant: 'success' },
      );
    } catch {
      enqueueSnackbar('Product matching failed', { variant: 'error' });
    }
  };

  const handleConfirmProducts = async (decisions: ReviewMatchDecision[]) => {
    if (!orderId) return;
    try {
      const result = await reviewMatchesMutation.mutateAsync({ orderId, data: { decisions } });
      enqueueSnackbar(
        `Products confirmed: ${result.accepted} accepted, ${result.rejected} rejected, ${result.new_products} new`,
        { variant: 'success' },
      );
      setActiveStep(3);
    } catch {
      enqueueSnackbar('Failed to confirm products', { variant: 'error' });
    }
  };

  const handleFinalizeRows = async (rows: FinalizeRowData[]) => {
    if (!orderId) return;
    try {
      const result = await finalizeRowsMutation.mutateAsync({ orderId, data: { rows } });
      enqueueSnackbar(`Preprocessing complete — ${result.rows_updated} row(s) finalized`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to finalize rows', { variant: 'error' });
    }
  };

  const handleSavePricing = async (prices: Record<number, string>) => {
    if (!orderId || !manifestRows.length) return;
    const rows = manifestRows.map((row) => {
      const priceVal = (prices[row.id] ?? '').trim();
      return {
        id: row.id,
        proposed_price: priceVal === '' ? null : priceVal,
        pricing_stage: 'draft' as const,
        pricing_notes: '',
      };
    });
    await updateManifestPricing.mutateAsync({ orderId, data: { rows } });
    enqueueSnackbar('Pricing saved', { variant: 'success' });
  };

  const handleNavigateToProcessing = async () => {
    if (!orderId || !order) return;
    try {
      const canCreateItems = ['delivered', 'processing', 'complete'].includes(order.status);
      if (order.item_count === 0 && canCreateItems) {
        const result = await createItemsMutation.mutateAsync(orderId);
        enqueueSnackbar(`Created ${result.items_created} item(s), ${result.batch_groups_created} batch(es)`, {
          variant: 'success',
        });
      }
      navigate(`/inventory/processing?order=${order.id}`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      const msg = axiosErr?.response?.data?.detail;
      enqueueSnackbar(msg || 'Failed to build check-in queue', { variant: 'error' });
    }
  };

  const canStandardize = Boolean(order?.manifest_file) && !processManifest.isPending;
  const hasManifestFile = Boolean(order?.manifest_file);
  const hasMandatoryMappings = hasMapping('description') && hasMapping('retail_value');

  type Step1State = 'clear' | 'partial' | 'ready' | 'done' | 'edited' | 'edited_partial';
  const step1State: Step1State = useMemo(() => {
    const isStandardized = completedStep >= 0;
    const anyFormulaFilled = Object.values(formulas).some((f) => f.trim() !== '');

    if (!isStandardized) {
      if (!anyFormulaFilled) return 'clear';
      return hasMandatoryMappings ? 'ready' : 'partial';
    }
    const snap = standardizedFormulasRef.current;
    if (snap) {
      const formulasChanged = Object.keys({ ...formulas, ...snap }).some(
        (k) => (formulas[k] ?? '').trim() !== (snap[k] ?? '').trim(),
      );
      if (formulasChanged) {
        return hasMandatoryMappings ? 'edited' : 'edited_partial';
      }
    }
    return 'done';
  }, [completedStep, formulas, hasMandatoryMappings]);

  const handleCancelFormulaEdits = useCallback(() => {
    if (standardizedFormulasRef.current) {
      setAllFormulas({ ...standardizedFormulasRef.current });
    }
  }, [setAllFormulas]);

  const handleClearFormulas = useCallback(() => {
    const empty: Record<string, string> = {};
    for (const key of Object.keys(formulas)) {
      empty[key] = '';
    }
    setAllFormulas(empty);
  }, [formulas, setAllFormulas]);

  const rowPanelRows = matchResultsData?.rows ?? manifestRows;
  const rowPanelMatchSummary = useMemo(() =>
    matchResultsData?.summary ?? {
      total: manifestRows.length,
      matched: 0,
      pending_review: 0,
      confirmed: 0,
      uncertain: 0,
      new_product: 0,
    },
    [matchResultsData?.summary, manifestRows.length],
  );
  const finalizePanelRows = useMemo(
    () => matchResultsData?.rows ?? manifestRows,
    [matchResultsData?.rows, manifestRows],
  );
  const unpricedCount = useMemo(
    () => manifestRows.filter((r) => r.pricing_stage !== 'final').length,
    [manifestRows],
  );

  if (isLoading && !order) return <LoadingScreen />;
  if (!order) return <Typography>Order not found.</Typography>;
  if (activeStep === null) return <LoadingScreen />;

  return (
    <Box>
      <PageHeader
        title="Preprocess Manifest"
        subtitle={`Order #${order.order_number} — ${order.vendor_name}`}
        action={
          <Button
            variant="outlined"
            size="small"
            startIcon={<ArrowBack />}
            onClick={() => navigate(`/inventory/orders/${order.id}`)}
          >
            Back to Order
          </Button>
        }
      />

      {!hasManifestFile && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No manifest uploaded for this order. Upload a manifest from the{' '}
          <Button
            variant="text" size="small"
            sx={{ textTransform: 'none', p: 0, minWidth: 'auto', verticalAlign: 'baseline' }}
            onClick={() => navigate(`/inventory/orders/${order.id}`)}
          >
            Order page
          </Button>.
        </Alert>
      )}

      {hasManifestFile && (
        <>
          {/* ── Step breadcrumbs ────────────────────────────────────── */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
            {STEPS.map((label, index) => {
              const state = getStepState(index, activeStep, completedStep);
              const isReachable = index <= completedStep + 1;
              const isLast = index === STEPS.length - 1;
              return (
                <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Chip
                    label={`${index + 1}. ${label}`}
                    color={
                      state === 'selected' ? 'primary'
                      : state === 'done' ? 'success'
                      : state === 'ready' ? 'info'
                      : 'default'
                    }
                    variant={state === 'notReady' ? 'outlined' : 'filled'}
                    icon={state === 'done' ? <CheckCircleOutline /> : undefined}
                    onClick={isReachable ? () => setActiveStep(index) : undefined}
                    sx={{
                      cursor: isReachable ? 'pointer' : 'default',
                      fontWeight: state === 'selected' ? 700 : 400,
                      opacity: state === 'notReady' ? 0.45 : 1,
                      // Pulse animation for "ready" chips
                      ...(state === 'ready' && {
                        '@keyframes pulse': {
                          '0%, 100%': { boxShadow: '0 0 0 0 rgba(2, 136, 209, 0.4)' },
                          '50%': { boxShadow: '0 0 0 5px rgba(2, 136, 209, 0)' },
                        },
                        animation: 'pulse 2s ease-in-out infinite',
                      }),
                    }}
                  />
                  {!isLast && (
                    <Typography color="text.disabled" sx={{ fontSize: '0.75rem' }}>—</Typography>
                  )}
                </Box>
              );
            })}

            {activeStep === 3 && unpricedCount === 0 && completedStep < 3 && (
              <Button
                variant="contained"
                color="success"
                size="small"
                startIcon={finalizeRowsMutation.isPending ? <CircularProgress size={14} /> : <Lock />}
                onClick={() => {
                  const finalizedRows: FinalizeRowData[] = manifestRows.map((row) => ({
                    id: row.id,
                    title: row.title || row.ai_suggested_title || row.description,
                    brand: row.brand || row.ai_suggested_brand || '',
                    model: row.model || row.ai_suggested_model || '',
                    category: row.category || '',
                    condition: row.condition || '',
                    search_tags: row.search_tags || '',
                    batch_flag: row.batch_flag ?? false,
                    final_price: row.final_price || row.proposed_price || null,
                    proposed_price: row.final_price || row.proposed_price || null,
                  }));
                  void handleFinalizeRows(finalizedRows);
                }}
                disabled={finalizeRowsMutation.isPending}
              >
                {finalizeRowsMutation.isPending ? 'Completing...' : 'Complete Preprocessing'}
              </Button>
            )}
          </Box>

          {/* ════════════════════════════════════════════════════════
              STEP 1: Standardize Manifest
          ════════════════════════════════════════════════════════ */}
          {activeStep === 0 && (
            <Box>
              {/* Primary action bar: Standardize / Re-standardize / Undo */}
              <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                {step1State === 'ready' && (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => void handleStandardizeManifest()}
                    disabled={!canStandardize || manifestRowsRawLoading}
                  >
                    {processManifest.isPending ? 'Standardizing...' : 'Standardize'}
                  </Button>
                )}
                {step1State === 'edited' && (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => void handleStandardizeManifest()}
                    disabled={!canStandardize || manifestRowsRawLoading}
                  >
                    {processManifest.isPending ? 'Re-standardizing...' : 'Re-standardize'}
                  </Button>
                )}
                {(step1State === 'done' || step1State === 'edited' || step1State === 'edited_partial') && (
                  <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    startIcon={clearManifestRowsMutation.isPending ? <CircularProgress size={14} /> : <DeleteOutline />}
                    onClick={() => void handleClearStandardization()}
                    disabled={clearManifestRowsMutation.isPending}
                  >
                    {clearManifestRowsMutation.isPending ? 'Clearing...' : 'Undo'}
                  </Button>
                )}
              </Box>

              {completedStep >= 0 && (
                <Alert severity="success" icon={<CheckCircleOutline />} sx={{ mb: 1.5 }}>
                  Standardization complete — {manifestRows.length} row(s) created.
                </Alert>
              )}

              {/* Read-only template info */}
              {(templateName || headerSignature) && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {templateName ? `Template: ${templateName}` : ''}{headerSignature ? ` · Header key: ${headerSignature}` : ''}
                </Typography>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Collapsible: Raw Column Reference */}
              {rawSampleRows.length > 0 && (
                <Box sx={{ mb: 1.5 }}>
                  <Button
                    variant="text" size="small"
                    onClick={() => setRawReferenceOpen(!rawReferenceOpen)}
                    startIcon={rawReferenceOpen ? <ExpandLess /> : <ExpandMore />}
                    sx={{ px: 0 }}
                  >
                    {rawReferenceOpen ? 'Hide' : 'Show'} Raw Column Reference ({rawHeaders.length} columns)
                  </Button>
                  <Collapse in={rawReferenceOpen}>
                    <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 200, mt: 0.5 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ width: 50 }}>Row</TableCell>
                            {rawHeaders.map((header, idx) => (
                              <TableCell key={`${header}-${idx}`} sx={{ whiteSpace: 'nowrap' }}>{header}</TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rawSampleRows.map((row) => (
                            <TableRow key={row.row_number}>
                              <TableCell>{row.row_number}</TableCell>
                              {rawHeaders.map((header, idx) => (
                                <TableCell key={`${row.row_number}-${header}-${idx}`}>{row.raw[header] || ''}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Collapse>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Formula section actions: Clear / Cancel / AI Suggest */}
              <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {step1State !== 'clear' && (
                  <Button variant="text" size="small" onClick={handleClearFormulas}>
                    Clear Formulas
                  </Button>
                )}
                {(step1State === 'edited' || step1State === 'edited_partial') && (
                  <Button variant="text" size="small" onClick={handleCancelFormulaEdits}>
                    Cancel Edits
                  </Button>
                )}
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={suggestFormulasMutation.isPending ? <CircularProgress size={14} /> : <AutoAwesome />}
                  onClick={() => void handleSuggestFormulas()}
                  disabled={suggestFormulasMutation.isPending || !headers.length}
                >
                  {suggestFormulasMutation.isPending ? 'AI analyzing...' : 'Use AI'}
                </Button>
              </Box>

              {/* Formula form */}
              <StandardManifestBuilder
                headers={headers}
                columns={columns}
                formulas={formulas}
                onFormulaChange={setFormula}
                aiReasonings={aiReasonings}
              />

              <Divider sx={{ my: 2 }} />

              {/* Collapsible: Standardization Preview with auto-search */}
              <Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 0.5 }}>
                  <Button
                    variant="text" size="small"
                    onClick={() => setPreviewOpen(!previewOpen)}
                    startIcon={previewOpen ? <ExpandLess /> : <ExpandMore />}
                    sx={{ px: 0 }}
                  >
                    {previewOpen ? 'Hide' : 'Show'} Standardization Preview
                    {previewStandardize.isPending && <CircularProgress size={12} sx={{ ml: 1 }} />}
                  </Button>
                  <TextField
                    size="small"
                    sx={{ minWidth: 240 }}
                    label="Search preview"
                    placeholder="Auto-searches as you type"
                    value={searchInput}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    disabled={!order.manifest_file || manifestRowsRawLoading}
                  />
                </Box>
                <Collapse in={previewOpen}>
                  <StandardManifestPreview
                    columns={columns}
                    rows={previewRows}
                    rowCountInFile={previewMeta.rowCountInFile}
                    rowsSelected={previewMeta.rowsSelected}
                    maxHeight={400}
                  />
                </Collapse>
              </Box>
            </Box>
          )}

          {/* ════════════════════════════════════════════════════════
              STEP 2: AI Cleanup
          ════════════════════════════════════════════════════════ */}
          {activeStep === 1 && (
            <Box>
              {completedStep >= 1 && (
                <Alert severity="success" icon={<CheckCircleOutline />} sx={{ mb: 1.5 }}>
                  AI Cleanup complete — all {manifestRows.length} row(s) cleaned.
                </Alert>
              )}
              <RowProcessingPanel
                orderId={orderId!}
                rows={manifestRows}
                completedStep={completedStep}
                onClearCleanup={() => void handleClearAICleanup()}
                isClearingCleanup={cancelAICleanupMutation.isPending}
              />
            </Box>
          )}

          {/* ════════════════════════════════════════════════════════
              STEP 3: Product Matching
          ════════════════════════════════════════════════════════ */}
          {activeStep === 2 && (
            <Box>
              {completedStep >= 2 && (
                <Alert severity="success" icon={<CheckCircleOutline />} sx={{ mb: 1.5 }}>
                  Product matching confirmed — products are linked.
                </Alert>
              )}
              <ProductMatchingPanel
                orderId={orderId!}
                rows={rowPanelRows}
                matchSummary={rowPanelMatchSummary}
                onRunMatching={handleRunMatching}
                onConfirmProducts={handleConfirmProducts}
                onClearMatching={() => void handleClearMatching()}
                isMatching={matchProductsMutation.isPending}
                isSubmitting={reviewMatchesMutation.isPending}
                isClearingMatching={undoProductMatchingMutation.isPending}
                completedStep={completedStep}
              />
            </Box>
          )}

          {/* ════════════════════════════════════════════════════════
              STEP 4: Pricing
          ════════════════════════════════════════════════════════ */}
          {activeStep === 3 && (
            <Box>
              {completedStep >= 3 && (
                <Alert severity="success" icon={<CheckCircleOutline />} sx={{ mb: 1.5 }}>
                  Preprocessing complete — all rows priced and finalized.
                </Alert>
              )}
              <FinalizePanel
                rows={finalizePanelRows}
                onSavePricing={handleSavePricing}
                onNavigateToProcessing={handleNavigateToProcessing}
                onClearPricing={() => void handleClearPricing()}
                isSavingPrices={updateManifestPricing.isPending}
                isCreatingItems={createItemsMutation.isPending}
                isClearingPricing={clearPricingMutation.isPending}
                completedStep={completedStep}
                orderStatus={order.status}
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
