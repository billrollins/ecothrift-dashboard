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
  useFinalizePreprocessing,
  useManifestRows,
  usePreprocessingReview,
  useProcessManifest,
  usePreprocessingStatus,
  useSuggestFormulas,
  useCancelAICleanup,
  useUpdatePreprocessingReview,
} from '../../hooks/useInventory';
import { useStandardManifest } from '../../hooks/useStandardManifest';
import { StandardManifestBuilder } from '../../components/inventory/StandardManifestBuilder';
import { StandardManifestPreview } from '../../components/inventory/StandardManifestPreview';
import { RowProcessingPanel } from '../../components/inventory/RowProcessingPanel';
import { PreprocessingReviewTable } from '../../components/inventory/PreprocessingReviewTable';
import { getPreprocessingReview } from '../../api/inventory.api';
import type {
  ManifestColumnMapping,
  ManifestRawRow,
  PreprocessingReviewRow,
  PreprocessingReviewRowUpdate,
  StandardColumnDefinition,
} from '../../api/inventory.api';

/** Stable fallbacks — avoid `?? []` literals that allocate new refs each render (breaks useStandardManifest deps). */
const EMPTY_HEADERS: string[] = [];
const EMPTY_STANDARD_COLUMNS: StandardColumnDefinition[] = [];
const EMPTY_TEMPLATE_MAPPINGS: ManifestColumnMapping[] = [];
const EMPTY_RAW_ROWS: ManifestRawRow[] = [];

const STEPS = ['Standardize Manifest', 'AI Cleanup', 'Manual Review'];

type StepState = 'selected' | 'done' | 'ready' | 'notReady';

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

  const { data: preprocessingStatus, isLoading } = usePreprocessingStatus(orderId);
  const order = preprocessingStatus?.order ?? null;
  const processManifest = useProcessManifest();
  const suggestFormulasMutation = useSuggestFormulas();
  const clearManifestRowsMutation = useClearManifestRows();
  const cancelAICleanupMutation = useCancelAICleanup();
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [stepDerived, setStepDerived] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPageSize, setReviewPageSize] = useState(50);
  const [reviewSearchInput, setReviewSearchInput] = useState('');
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewMissingOnly, setReviewMissingOnly] = useState(false);
  const reviewParams = useMemo(() => ({
    page: reviewPage,
    page_size: reviewPageSize,
    search: reviewSearch.trim() || undefined,
    missing_price: reviewMissingOnly || undefined,
  }), [reviewMissingOnly, reviewPage, reviewPageSize, reviewSearch]);
  const hasActivePreprocessingSession = Boolean(
    preprocessingStatus?.preprocessing?.row_count && !preprocessingStatus.preprocessing.finalized_at,
  );
  const { data: preprocessingReviewData, isFetching: preprocessingReviewLoading } = usePreprocessingReview(
    orderId,
    reviewParams,
    activeStep === 2 && hasActivePreprocessingSession,
  );
  const updatePreprocessingReview = useUpdatePreprocessingReview();
  const finalizePreprocessingMutation = useFinalizePreprocessing();

  // Step 1 (Standardize) state
  const [aiReasonings, setAiReasonings] = useState<Record<string, string>>({});
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewMeta, setPreviewMeta] = useState<{ rowCountInFile?: number; rowsSelected?: number }>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rawReferenceOpen, setRawReferenceOpen] = useState(false);
  const [processResult, setProcessResult] = useState<{ rows_created: number } | null>(null);
  const [isLoadingSavedPreview, setIsLoadingSavedPreview] = useState(false);
  const reviewSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const standardizedFormulasRef = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    if (orderId) localStorage.setItem('lastPreprocessOrderId', String(orderId));
  }, [orderId]);

  const standardizedRowCount = preprocessingStatus?.counts.standardized_rows ?? 0;
  const cleanedRowCount = preprocessingStatus?.counts.cleaned_rows ?? 0;
  const missingPriceCount = preprocessingStatus?.counts.missing_price ?? 0;
  const completedStep = preprocessingStatus?.completed_step ?? -1;
  const hasCanonicalProcessingQueue = !hasActivePreprocessingSession && standardizedRowCount > 0;

  const stepDerivedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!orderId || !order || stepDerivedRef.current === orderId) return;
    stepDerivedRef.current = orderId;
    setActiveStep(Math.min(completedStep + 1, STEPS.length - 1));
    setStepDerived(true);
  }, [orderId, order?.id, completedStep]);

  const hasManifestFileForParams = !!order?.has_manifest_file && activeStep === 0;
  const rawManifestParams = useMemo(() => {
    if (!hasManifestFileForParams) return undefined;
    return { limit: 100 };
  }, [hasManifestFileForParams]);

  const {
    data: manifestRowsRawData,
    isLoading: manifestRowsRawLoading,
  } = useManifestRows(orderId, rawManifestParams, hasManifestFileForParams);

  const headers = manifestRowsRawData?.headers ?? EMPTY_HEADERS;
  const headerSignature = manifestRowsRawData?.signature ?? '';
  const standardColumns = manifestRowsRawData?.standard_columns ?? EMPTY_STANDARD_COLUMNS;
  const templateMappings = (
    manifestRowsRawData?.template_mappings ?? EMPTY_TEMPLATE_MAPPINGS
  ) as ManifestColumnMapping[];
  const templateId = manifestRowsRawData?.template_id ?? undefined;
  const templateName = manifestRowsRawData?.template_name ?? '';
  const rawManifestRows = manifestRowsRawData?.rows ?? EMPTY_RAW_ROWS;
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

  const loadSavedPreview = useCallback(async () => {
    if (!orderId) return;
    setIsLoadingSavedPreview(true);
    try {
      const { data } = await getPreprocessingReview(orderId, { page: 1, page_size: 100 });
      setPreviewRows((data.rows || []).map((row: PreprocessingReviewRow) => ({ ...row })));
      setPreviewMeta({ rowCountInFile: data.summary.total_rows, rowsSelected: data.rows.length });
      setPreviewOpen(true);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(detail || 'Failed to load saved preview rows', { variant: 'error' });
    } finally {
      setIsLoadingSavedPreview(false);
    }
  }, [enqueueSnackbar, orderId]);

  useEffect(() => {
    if (reviewSearchDebounceRef.current) clearTimeout(reviewSearchDebounceRef.current);
    reviewSearchDebounceRef.current = setTimeout(() => {
      setReviewSearch(reviewSearchInput);
      setReviewPage(1);
    }, 300);
    return () => {
      if (reviewSearchDebounceRef.current) clearTimeout(reviewSearchDebounceRef.current);
    };
  }, [reviewSearchInput]);

  useEffect(() => () => {
    if (reviewSearchDebounceRef.current) clearTimeout(reviewSearchDebounceRef.current);
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
    if (!orderId || !order?.has_manifest_file) return;
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
        'Re-standardizing will rebuild manifest rows plus any non-terminal generated Products/Items. Continue?',
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
      enqueueSnackbar(
        `Standardized ${result.rows_created} staged row(s)`,
        { variant: 'success' },
      );
      await loadSavedPreview();
      setActiveStep(1);
    } catch {
      enqueueSnackbar('Failed to standardize manifest', { variant: 'error' });
    }
  };

  const handleClearStandardization = async () => {
    if (!orderId) return;
    const parts: string[] = ['standardized rows'];
    if (completedStep >= 1) parts.push('AI cleanup data');
    if (completedStep >= 2) parts.push('manual review/pricing');
    parts.push('non-terminal generated items');
    const ok = window.confirm(`This will permanently delete all ${parts.join(', ')}. Continue?`);
    if (!ok) return;
    try {
      const result = await clearManifestRowsMutation.mutateAsync(orderId);
      enqueueSnackbar(`Cleared ${result.rows_deleted} manifest rows and ${result.items_deleted ?? 0} item(s)`, { variant: 'info' });
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
    const msg = 'This will clear all AI cleanup suggestions. Product/Item links and pricing are preserved. Continue?';
    const ok = window.confirm(msg);
    if (!ok) return;
    try {
      await cancelAICleanupMutation.mutateAsync(orderId);
      enqueueSnackbar('AI cleanup data cleared', { variant: 'info' });
      setActiveStep(1);
    } catch {
      enqueueSnackbar('Failed to clear AI cleanup', { variant: 'error' });
    }
  };

  const handlePreprocessingReviewSave = async (rows: PreprocessingReviewRowUpdate[]) => {
    if (!orderId) return;
    try {
      const result = await updatePreprocessingReview.mutateAsync({ orderId, rows });
      enqueueSnackbar(`Saved ${result.rows_updated} staged row(s)`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to save preprocessing review', { variant: 'error' });
    }
  };

  const handleFinalizeAndOpenProcessing = async () => {
    if (!orderId || !order) return;
    try {
      const result = await finalizePreprocessingMutation.mutateAsync(orderId);
      enqueueSnackbar(
        `Finalized ${result.manifest_rows} row(s); ${result.items_created ?? 0} item(s), ${result.batch_groups_created} batch(es).`,
        { variant: 'success' },
      );
      navigate(`/inventory/processing?order=${order.id}`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      const msg = axiosErr?.response?.data?.detail;
      enqueueSnackbar(msg || 'Failed to finalize preprocessing', { variant: 'error' });
    }
  };

  const handleOpenProcessing = () => {
    if (!order) return;
    navigate(`/inventory/processing?order=${order.id}`);
  };

  const canStandardize = Boolean(order?.has_manifest_file) && !processManifest.isPending;
  const hasManifestFile = Boolean(order?.has_manifest_file);
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
          No manifest uploaded for this order. On the{' '}
          <Button
            variant="text" size="small"
            sx={{ textTransform: 'none', p: 0, minWidth: 'auto', verticalAlign: 'baseline' }}
            onClick={() => navigate(`/inventory/orders/${order.id}`)}
          >
            Order detail page
          </Button>
          , use <strong>Raw Manifest</strong> to upload or replace the CSV, then return here.
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

            {activeStep === 2 && hasActivePreprocessingSession && missingPriceCount === 0 && completedStep < 2 && standardizedRowCount > 0 && (
              <Chip icon={<Lock />} label="All rows priced" color="success" />
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
                  Standardization complete — {standardizedRowCount} row(s) created.
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
                    {isLoadingSavedPreview && <CircularProgress size={12} sx={{ ml: 1 }} />}
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Preview loads once after Standardize saves staged rows.
                  </Typography>
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
                  AI Cleanup complete — all {standardizedRowCount} row(s) cleaned.
                </Alert>
              )}
              <RowProcessingPanel
                orderId={orderId!}
                rowCount={standardizedRowCount}
                cleanedRows={cleanedRowCount}
                completedStep={completedStep}
                onClearCleanup={() => void handleClearAICleanup()}
                isClearingCleanup={cancelAICleanupMutation.isPending}
              />
            </Box>
          )}

          {/* ════════════════════════════════════════════════════════
              STEP 3: Manual Review
          ════════════════════════════════════════════════════════ */}
          {activeStep === 2 && (
            <Box>
              {completedStep >= 2 && hasActivePreprocessingSession && (
                <Alert severity="success" icon={<CheckCircleOutline />} sx={{ mb: 1.5 }}>
                  Manual review complete — all staged rows are priced.
                </Alert>
              )}
              {hasActivePreprocessingSession ? (
                <PreprocessingReviewTable
                  rows={preprocessingReviewData?.rows ?? []}
                  summary={preprocessingReviewData?.summary ?? null}
                  count={preprocessingReviewData?.count ?? 0}
                  page={preprocessingReviewData?.page ?? reviewPage}
                  pageSize={preprocessingReviewData?.page_size ?? reviewPageSize}
                  isLoading={preprocessingReviewLoading}
                  searchValue={reviewSearchInput}
                  missingPriceOnly={reviewMissingOnly}
                  onPageChange={setReviewPage}
                  onPageSizeChange={(size) => {
                    setReviewPageSize(size);
                    setReviewPage(1);
                  }}
                  onSearchChange={(search) => {
                    setReviewSearchInput(search);
                  }}
                  onMissingPriceChange={(missingOnly) => {
                    setReviewMissingOnly(missingOnly);
                    setReviewPage(1);
                  }}
                  onSaveRows={handlePreprocessingReviewSave}
                  onFinalize={handleFinalizeAndOpenProcessing}
                  isSaving={updatePreprocessingReview.isPending}
                  isFinalizing={finalizePreprocessingMutation.isPending}
                />
              ) : hasCanonicalProcessingQueue ? (
                <Box>
                  <Alert severity="info" sx={{ mb: 1.5 }}>
                    This order already has a canonical processing queue with {standardizedRowCount} row(s). There is no active staged preprocessing session to review.
                  </Alert>
                  <Button variant="contained" onClick={handleOpenProcessing}>
                    Open Processing
                  </Button>
                </Box>
              ) : (
                <Alert severity="info">
                  Standardize the manifest first to create staged rows for review.
                </Alert>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
