import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { useSnackbar } from 'notistack';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useClearManifestRows,
  useFinalizePreprocessing,
  useManifestFields,
  useProcessManifest,
  usePreprocessingStatus,
  usePreprocessingQueue,
  useSuggestFormulas,
  useUpdatePreprocessingReview,
  useUploadCleanupCsvRows,
} from '../../hooks/useInventory';
import { prepS1 } from '../../utils/preprocessingStep1Diag';
import { useStandardManifest, buildFormulas } from '../../hooks/useStandardManifest';
import { StandardManifestBuilder } from '../../components/inventory/StandardManifestBuilder';
import { PreprocessingReviewTable } from '../../components/inventory/PreprocessingReviewTable';
import { getPreprocessingReview, getTemplate } from '../../api/inventory.api';
import type {
  CleanupCsvApplyRowPayload,
  CleanupCsvSoftWarning,
  ManifestColumnMapping,
  ManifestRawRow,
  PreprocessingReviewRow,
  PreprocessingReviewRowPatch,
  PreprocessingReviewRowUpdate,
  StandardColumnDefinition,
} from '../../api/inventory.api';
import type { PreprocessingQueueOrder } from '../../types/inventory.types';
import { preprocessingFonts, preprocessingRootSx, preprocessingStep1 } from '../../components/inventory/preprocessing/preprocessingTokens';
import { PreprocessingStepper, PREPROCESSING_STEP_LABELS } from '../../components/inventory/preprocessing/PreprocessingStepper';
import { TemplateSelector } from '../../components/inventory/preprocessing/TemplateSelector';
import { CleanupStep } from '../../components/inventory/preprocessing/CleanupStep';
import { summarizePreprocessingReviewRows } from '../../components/inventory/preprocessing/reviewSummary';
import { PreprocessingPageHeader } from '../../components/inventory/preprocessing/PreprocessingPageHeader';
import { ConfirmModal } from '../../components/inventory/preprocessing/ConfirmModal';
import { FormulaPreview } from '../../components/inventory/preprocessing/FormulaPreview';
import {
  computeFormulaPreviewGrid,
  computeSampleFormulaSnapshot,
  MANIFEST_BUCKET_ORDER,
} from '../../components/inventory/preprocessing/formulaPreviewSnapshot';
import { buildAiBaselinePatch, type PreprocessingAiBaselinePatch } from '../../components/inventory/preprocessing/aiBaseline';
import { formatCurrency } from '../../utils/format';
import { stableFormulasFingerprint } from '../../utils/stableFormulasFingerprint';

/** Stable fallbacks — avoid `?? []` literals that allocate new refs each render (breaks useStandardManifest deps). */
const EMPTY_HEADERS: string[] = [];
const EMPTY_STANDARD_COLUMNS: StandardColumnDefinition[] = [];
const EMPTY_TEMPLATE_MAPPINGS: ManifestColumnMapping[] = [];
const EMPTY_EXPECTED_ROW_IDS = new Set<number>();

export default function PreprocessingPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const orderId =
    idParam && /^\d+$/.test(idParam) ? Number.parseInt(idParam, 10) : null;

  const { data: queueData, isLoading: queueLoading } = usePreprocessingQueue();
  const queueOrders = queueData?.results ?? [];

  useEffect(() => {
    if (orderId != null) return;
    if (queueLoading) return;
    const rows = queueData?.results ?? [];
    if (!rows.length) return;
    const lastRaw = localStorage.getItem('lastPreprocessOrderId');
    const lastId = lastRaw ? Number.parseInt(lastRaw, 10) : NaN;
    const pick =
      Number.isFinite(lastId) && rows.some((o) => o.id === lastId) ? lastId : rows[0].id;
    navigate(`/inventory/preprocessing/${pick}`, { replace: true });
  }, [orderId, queueLoading, queueData?.results, navigate]);

  const showResolveSpinner = queueLoading || (orderId === null && queueOrders.length > 0);

  const { data: preprocessingStatus, isLoading } = usePreprocessingStatus(orderId);
  const manifestFieldsQuery = useManifestFields();
  const order = preprocessingStatus?.order ?? null;
  const processManifest = useProcessManifest();
  const suggestFormulasMutation = useSuggestFormulas();
  const clearManifestRowsMutation = useClearManifestRows();
  const uploadCleanupRowsMutation = useUploadCleanupCsvRows();
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [stepDerived, setStepDerived] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPageSize, setReviewPageSize] = useState(50);
  const [reviewSearchInput, setReviewSearchInput] = useState('');
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewMissingOnly, setReviewMissingOnly] = useState(false);
  const [reviewRowsFull, setReviewRowsFull] = useState<PreprocessingReviewRow[] | null>(null);
  const [reviewFullLoading, setReviewFullLoading] = useState(false);
  const [reviewBaselineByRowId, setReviewBaselineByRowId] = useState<Record<number, PreprocessingAiBaselinePatch>>({});
  const hasActivePreprocessingSession = Boolean(
    preprocessingStatus?.preprocessing?.row_count && !preprocessingStatus.preprocessing.finalized_at,
  );
  const updatePreprocessingReview = useUpdatePreprocessingReview();
  const finalizePreprocessingMutation = useFinalizePreprocessing();

  const [selectedManifestTemplateId, setSelectedManifestTemplateId] = useState<number | null>(null);

  const [cleanupValidatedPayload, setCleanupValidatedPayload] = useState<CleanupCsvApplyRowPayload[] | null>(null);
  const [cleanupApplySoftWarnings, setCleanupApplySoftWarnings] = useState<CleanupCsvSoftWarning[] | null>(null);
  const [cleanupExpectedRowIds, setCleanupExpectedRowIds] = useState<Set<number> | null>(null);
  const [cleanupRowNumberById, setCleanupRowNumberById] = useState<Record<number, number>>({});
  const [reviewDirtyCount, setReviewDirtyCount] = useState(0);
  const [confirmDialog, setConfirmDialog] = useState<null | 'undo_std' | 'restandardize' | 'finalize'>(null);
  const [newTemplateName, setNewTemplateName] = useState('');

  // Step 1 (Standardize) state
  const [aiReasonings, setAiReasonings] = useState<Record<string, string>>({});
  const [formulaPreviewOpen, setFormulaPreviewOpen] = useState(false);
  const [rawReferenceOpen, setRawReferenceOpen] = useState(false);
  const [processResult, setProcessResult] = useState<{ rows_created: number } | null>(null);
  const reviewSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const standardizedFormulasRef = useRef<Record<string, string> | null>(null);

  const templateBaselineFingerprintRef = useRef<string | null>(null);
  const baselineSeedKeySeenRef = useRef('');
  const baselineOrderAnchorRef = useRef<number | null>(null);

  useEffect(() => {
    if (order?.id) localStorage.setItem('lastPreprocessOrderId', String(order.id));
  }, [order?.id]);

  useEffect(() => {
    setNewTemplateName('');
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
    setActiveStep(Math.min(completedStep + 1, PREPROCESSING_STEP_LABELS.length - 1));
    setStepDerived(true);
  }, [orderId, order?.id, completedStep]);

  const manifestFieldMeta = manifestFieldsQuery.data;
  const manifestFieldsReady = Boolean(manifestFieldMeta?.flat?.length);
  const manifestFieldsGateLoading = manifestFieldsQuery.isPending && manifestFieldMeta == null;

  const flatColumnsFromMeta = useMemo((): StandardColumnDefinition[] => {
    const flat = manifestFieldMeta?.flat;
    if (!flat?.length) return EMPTY_STANDARD_COLUMNS;
    return flat.map((c) => ({
      key: c.key,
      label: c.label,
      required: c.required,
      ai_locked: c.ai_locked,
    }));
  }, [manifestFieldMeta]);

  const bucketOrderUi = useMemo(() => {
    const b = manifestFieldMeta?.buckets;
    if (!b) return [] as string[];
    return MANIFEST_BUCKET_ORDER.filter((id) => id in b);
  }, [manifestFieldMeta]);

  const manifestPreview = order?.manifest_sample ?? null;

  const headers = manifestPreview?.headers ?? EMPTY_HEADERS;
  const headerSignature = manifestPreview?.signature ?? '';
  const templateMappings = (
    manifestPreview?.template_mappings ?? EMPTY_TEMPLATE_MAPPINGS
  ) as ManifestColumnMapping[];
  const templateMappingsKey = useMemo(() => JSON.stringify(templateMappings), [templateMappings]);
  const templateId = manifestPreview?.template_id ?? undefined;
  const templateName = manifestPreview?.template_name ?? '';

  const manifestSampleRowsForUi = useMemo((): ManifestRawRow[] => {
    const rows = manifestPreview?.rows;
    if (!rows?.length) return [];
    return rows.map(
      (r: { row_number: number; raw?: Record<string, string | undefined> | null }): ManifestRawRow => ({
      row_number: r.row_number,
      raw: Object.fromEntries(
        Object.entries(r.raw ?? {}).map(([k, v]) => [k, String(v ?? '')]),
      ),
    }));
  }, [manifestPreview?.rows]);

  const rawHeaders: string[] = headers.length
    ? [...headers]
    : (Object.keys(manifestSampleRowsForUi[0]?.raw ?? {}) as string[]);
  const matchingTemplates = manifestPreview?.matching_templates ?? [];

  const step1AwaitingStatus = activeStep === 0 && isLoading;
  const step1PreviewMissing =
    activeStep === 0 && !isLoading && Boolean(order?.has_manifest_file) && headers.length === 0;
  const step1ActionsLocked =
    step1AwaitingStatus ||
    step1PreviewMissing ||
    (activeStep === 0 &&
      (manifestFieldsQuery.isError || manifestFieldsGateLoading || !manifestFieldsReady));

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const ms = order?.manifest_sample;
    const r0 = ms?.rows?.[0];
    prepS1('API-derived manifest_sample + gates', {
      orderId,
      queryLoading: isLoading,
      activeStep,
      has_order: Boolean(order),
      order_has_manifest_file: Boolean(order?.has_manifest_file),
      manifest_sample_is_null: ms == null,
      headers_len: ms?.headers?.length ?? 0,
      preview_rows_len: ms?.rows?.length ?? 0,
      row0_raw_is_object: r0 != null && typeof r0.raw === 'object' && !Array.isArray(r0.raw),
      row0_raw_key_sample: r0?.raw && typeof r0.raw === 'object' ? Object.keys(r0.raw).slice(0, 10) : [],
      signature_len: (ms?.signature ?? '').length,
      standard_columns_len: ms?.standard_columns?.length ?? 0,
      template_mappings_len: ms?.template_mappings?.length ?? 0,
      matching_templates_len: ms?.matching_templates?.length ?? 0,
      branch_step1AwaitingStatus: step1AwaitingStatus,
      branch_step1PreviewMissing: step1PreviewMissing,
      branch_step1ActionsLocked: step1ActionsLocked,
    });
  }, [
    orderId,
    isLoading,
    activeStep,
    order,
    step1AwaitingStatus,
    step1PreviewMissing,
    step1ActionsLocked,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const r0 = manifestSampleRowsForUi[0];
    prepS1('manifestSampleRowsForUi (normalized for formula engine)', {
      ui_rows_len: manifestSampleRowsForUi.length,
      row1_number: r0?.row_number,
      row1_raw_keys: r0 ? Object.keys(r0.raw ?? {}).slice(0, 15) : [],
    });
    if (order?.has_manifest_file && manifestSampleRowsForUi.length === 0) {
      prepS1('DECISION: manifest file exists but UI sample rows length is 0 → Sample column stays blank unless formulas need no row context', {
        hint: 'Check DB manifest_preview.rows or preprocessing-status payload',
      });
    }
  }, [order?.has_manifest_file, manifestSampleRowsForUi]);

  useEffect(() => {
    if (!import.meta.env.DEV || activeStep !== 0) return;
    prepS1('Formula / column wiring (before snapshots)', {
      headerSignature_len: headerSignature.length,
      headers_len_for_builder: headers.length,
      flat_columns_from_manifest_fields_len: flatColumnsFromMeta.length,
      manifest_fields_bucket_order_len: bucketOrderUi.length,
      templateMappings_len: templateMappings.length,
      matching_templates_len: matchingTemplates.length,
    });
  }, [
    activeStep,
    headerSignature,
    headers.length,
    flatColumnsFromMeta.length,
    bucketOrderUi.length,
    templateMappings.length,
    matchingTemplates.length,
  ]);

  useEffect(() => {
    if (!orderId || !hasActivePreprocessingSession || standardizedRowCount <= 0) {
      setCleanupExpectedRowIds(null);
      setCleanupRowNumberById({});
      return;
    }
    let cancelled = false;
    void getPreprocessingReview(orderId, { full: true })
      .then(({ data }) => {
        if (cancelled) return;
        setCleanupExpectedRowIds(new Set(data.rows.map((r) => r.id)));
        const rn: Record<number, number> = {};
        for (const r of data.rows) rn[r.id] = r.row_number;
        setCleanupRowNumberById(rn);
      })
      .catch(() => {
        if (!cancelled) {
          setCleanupExpectedRowIds(null);
          setCleanupRowNumberById({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, hasActivePreprocessingSession, standardizedRowCount]);

  useEffect(() => {
    setReviewRowsFull(null);
    setReviewBaselineByRowId({});
    setCleanupValidatedPayload(null);
    setCleanupExpectedRowIds(null);
    setCleanupRowNumberById({});
  }, [orderId]);

  useEffect(() => {
    setSelectedManifestTemplateId(templateId ?? null);
  }, [templateId]);

  useEffect(() => {
    if (!hasActivePreprocessingSession) {
      setReviewRowsFull(null);
      setReviewBaselineByRowId({});
    }
  }, [hasActivePreprocessingSession]);

  useEffect(() => {
    if (!orderId || activeStep !== 2 || !hasActivePreprocessingSession) return;
    let cancelled = false;
    setReviewFullLoading(true);
    void getPreprocessingReview(orderId, { full: true })
      .then(({ data }) => {
        if (cancelled) return;
        setReviewRowsFull(data.rows);
        const snap: Record<number, PreprocessingAiBaselinePatch> = {};
        for (const r of data.rows) snap[r.id] = buildAiBaselinePatch(r);
        setReviewBaselineByRowId(snap);
      })
      .catch((err: unknown) => {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        enqueueSnackbar(detail || 'Failed to load review rows', { variant: 'error' });
      })
      .finally(() => {
        if (!cancelled) setReviewFullLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, activeStep, hasActivePreprocessingSession, enqueueSnackbar, preprocessingStatus?.preprocessing?.row_count]);

  const filteredReviewRows = useMemo(() => {
    if (!reviewRowsFull) return [];
    const term = reviewSearch.trim().toLowerCase();
    let out = reviewRowsFull;
    if (term) {
      out = out.filter((row) => {
        const hay = [
          row.ai_title,
          row.title,
          row.description,
          row.brand,
          row.ai_brand,
        ]
          .map((f) => String(f || '').toLowerCase())
          .join(' ');
        return hay.includes(term);
      });
    }
    if (reviewMissingOnly) {
      out = out.filter((row) => {
        const has = (v: unknown) => v != null && String(v).trim() !== '';
        return !has(row.final_price) && !has(row.proposed_price);
      });
    }
    return out;
  }, [reviewRowsFull, reviewSearch, reviewMissingOnly]);

  const reviewPageSlice = useMemo(() => {
    const start = (reviewPage - 1) * reviewPageSize;
    return filteredReviewRows.slice(start, start + reviewPageSize);
  }, [filteredReviewRows, reviewPage, reviewPageSize]);

  const clientReviewSummary = useMemo(
    () =>
      summarizePreprocessingReviewRows(
        preprocessingStatus?.summary?.total_paid ?? '0',
        filteredReviewRows,
      ),
    [preprocessingStatus?.summary?.total_paid, filteredReviewRows],
  );

  const stagedRowById = useMemo(() => {
    const m = new Map<number, PreprocessingReviewRow>();
    if (reviewRowsFull) for (const r of reviewRowsFull) m.set(r.id, r);
    return m;
  }, [reviewRowsFull]);

  const getStagedRow = useCallback((id: number) => stagedRowById.get(id), [stagedRowById]);

  const mergeReviewPatches = useCallback((updates: PreprocessingReviewRowUpdate[]) => {
    const patchKeysClearingAiStatus: (keyof PreprocessingReviewRowPatch)[] = [
      'title',
      'brand',
      'model',
      'category',
      'condition',
      'description',
      'notes',
      'search_tags',
      'specifications',
      'proposed_price',
      'final_price',
    ];
    setReviewRowsFull((prev) => {
      if (!prev) return prev;
      return prev.map((row) => {
        const u = updates.find((x) => x.id === row.id);
        if (!u) return row;
        const patch = u.patch;
        if (!patch || typeof patch !== 'object') return row;
        const clearsAiStatus = patchKeysClearingAiStatus.some((k) => patch[k] !== undefined);
        const merged = { ...row } as Record<string, unknown>;
        (Object.keys(patch) as (keyof PreprocessingReviewRowPatch)[]).forEach((k) => {
          const val = patch[k];
          if (val !== undefined) merged[k as string] = val as unknown;
        });
        if (clearsAiStatus) merged.ai_status = {};
        return merged as unknown as PreprocessingReviewRow;
      });
    });
  }, []);

  const {
    columns,
    formulas,
    setFormula,
    setAllFormulas,
    replaceBucketFormulas,
    formulaMappings,
    hasMapping,
  } = useStandardManifest({
    manifestSessionKey: orderId ?? -1,
    signature: headerSignature,
    headers,
    flatColumns: flatColumnsFromMeta,
    initialMappings: templateMappings,
  });

  const formulasFingerprint = useMemo(() => stableFormulasFingerprint(formulas), [formulas]);

  const [bucketDraftByTarget, setBucketDraftByTarget] = useState<Record<string, string>>({});

  const bucketDraftFingerprint = useMemo(
    () => stableFormulasFingerprint(bucketDraftByTarget),
    [bucketDraftByTarget],
  );

  const formulasForEval = useMemo(
    () => ({ ...formulas, ...bucketDraftByTarget }),
    [formulas, bucketDraftByTarget],
  );

  useEffect(() => {
    setBucketDraftByTarget({});
  }, [orderId, headerSignature]);

  const applyBucketDraftChange = useCallback(
    (bucketId: string, pairs: Array<{ target: string; formula: string }>) => {
      setBucketDraftByTarget((prev) => {
        const next = { ...prev };
        const pref = `${bucketId}.`;
        for (const k of Object.keys(next)) {
          if (k.startsWith(pref)) delete next[k];
        }
        for (const pr of pairs) {
          const f = (pr.formula ?? '').trim();
          if (f) next[pr.target] = pr.formula;
        }
        return next;
      });
    },
    [],
  );

  const dismissBucketDraft = useCallback((bucketId: string) => {
    setBucketDraftByTarget((prev) => {
      const next = { ...prev };
      const pref = `${bucketId}.`;
      let changed = false;
      for (const k of Object.keys(next)) {
        if (k.startsWith(pref)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const bucketLabelsForPreview = useMemo(() => {
    const b = manifestFieldMeta?.buckets;
    if (!b) return null;
    const out: Record<string, string> = {};
    for (const id of MANIFEST_BUCKET_ORDER) {
      if (b[id]) out[id] = b[id]?.label ?? id;
    }
    return out;
  }, [manifestFieldMeta?.buckets]);

  const baselineSeedKey = useMemo(
    () =>
      orderId != null && headerSignature && headers.length
        ? `${orderId}|${headerSignature}|${templateMappingsKey}`
        : '',
    [orderId, headerSignature, templateMappingsKey, headers.length],
  );

  if (baselineOrderAnchorRef.current !== orderId) {
    baselineOrderAnchorRef.current = orderId;
    baselineSeedKeySeenRef.current = '';
    templateBaselineFingerprintRef.current = null;
  }

  if (baselineSeedKey && baselineSeedKeySeenRef.current !== baselineSeedKey) {
    baselineSeedKeySeenRef.current = baselineSeedKey;
    templateBaselineFingerprintRef.current = formulasFingerprint;
  }

  const needsSaveAsNew =
    matchingTemplates.length === 0 ||
    (templateBaselineFingerprintRef.current !== null &&
      formulasFingerprint !== templateBaselineFingerprintRef.current);

  const standardizeBlockedByName = needsSaveAsNew && !newTemplateName.trim();

  const formulasForEvalRef = useRef(formulasForEval);
  formulasForEvalRef.current = formulasForEval;

  const bucketOrderUiRef = useRef(bucketOrderUi);
  bucketOrderUiRef.current = bucketOrderUi;

  const columnsRef = useRef(columns);
  columnsRef.current = columns;


  const [formulaPreviewGridSnapshot, setFormulaPreviewGridSnapshot] = useState<{
    previewTargets: string[];
    previewRows: Array<{ row_number: number; cells: Record<string, string> }>;
  }>(() => ({ previewTargets: [], previewRows: [] }));

  const formulaSampleSnapshot = useMemo(() => {
    const snap = computeSampleFormulaSnapshot(formulasForEval, columns, manifestSampleRowsForUi, bucketOrderUi);
    prepS1('sample snapshot computed (useMemo)', {
      manifestSampleRowsCount: manifestSampleRowsForUi.length,
      columnsCount: columns.length,
      formulasNonEmptyCount: Object.values(formulas).filter((v) => (v ?? '').trim()).length,
      sampleEvalOkCount: Object.keys(snap.samples).length,
      sampleNonEmptyDisplayCount: Object.values(snap.samples).filter((v) => String(v ?? '').trim() !== '').length,
      sampleErrorFields: Object.keys(snap.sampleErrors),
      fieldsWithNoFormulaExpr: columns.filter((c) => !(formulas[c.key] ?? '').trim()).map((c) => c.key),
      row1RawKeyCount: manifestSampleRowsForUi[0] ? Object.keys(manifestSampleRowsForUi[0].raw ?? {}).length : 0,
    });
    return snap;
  }, [formulasForEval, columns, manifestSampleRowsForUi, bucketOrderUi]);

  const PREVIEW_DEBOUNCE_MS = 280;

  const runFormulaPreviewSnapshot = useCallback(() => {
    const grid = computeFormulaPreviewGrid(
      formulasForEvalRef.current,
      columnsRef.current,
      manifestSampleRowsForUi,
      bucketOrderUiRef.current,
    );
    prepS1('Formula Preview grid computed', {
      previewTargetsCount: grid.previewTargets.length,
      previewTargets: grid.previewTargets,
      previewRowsCount: grid.previewRows.length,
      manifestRowsUsed: manifestSampleRowsForUi.length,
    });
    setFormulaPreviewGridSnapshot(grid);
  }, [manifestSampleRowsForUi]);

  const formulaPreviewOpenRef = useRef(formulaPreviewOpen);
  formulaPreviewOpenRef.current = formulaPreviewOpen;

  const formulaPreviewWasExpandedRef = useRef(false);
  useEffect(() => {
    if (formulaPreviewOpen && !formulaPreviewWasExpandedRef.current) {
      prepS1('DECISION: Formula Preview opened (collapsed→expanded) → run grid snapshot');
      runFormulaPreviewSnapshot();
    }
    if (!formulaPreviewOpen && formulaPreviewWasExpandedRef.current) {
      prepS1('Formula Preview collapsed');
    }
    formulaPreviewWasExpandedRef.current = formulaPreviewOpen;
  }, [formulaPreviewOpen, runFormulaPreviewSnapshot]);

  const columnPreviewSig = useMemo(() => columns.map((c) => c.key).join('\x1f'), [columns]);
  const bucketOrderSig = useMemo(() => bucketOrderUi.join('\x1f'), [bucketOrderUi]);

  useEffect(() => {
    const tid = window.setTimeout(() => {
      if (!formulaPreviewOpenRef.current) return;
      runFormulaPreviewSnapshot();
    }, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(tid);
  }, [
    formulasFingerprint,
    bucketDraftFingerprint,
    columnPreviewSig,
    bucketOrderSig,
    manifestSampleRowsForUi,
    runFormulaPreviewSnapshot,
  ]);

  const effectiveManifestTemplateId = selectedManifestTemplateId ?? templateId;

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
        data: { template_id: effectiveManifestTemplateId },
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
      setBucketDraftByTarget({});
      const snap = computeSampleFormulaSnapshot(newFormulas, columns, manifestSampleRowsForUi, bucketOrderUi);
      prepS1('handleSuggestFormulas: applied AI suggestions → immediate sample snapshot', {
        suggestionTargets: Object.keys(newFormulas),
        sampleCellsFilled: Object.keys(snap.samples).length,
        sampleErrors: Object.keys(snap.sampleErrors),
      });
      enqueueSnackbar(`AI suggested formulas for ${result.suggestions.length} field(s)`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to get AI suggestions', { variant: 'error' });
    }
  };

  const executeStandardizeManifestCore = async () => {
    if (!orderId || !order?.has_manifest_file) return;
    if (needsSaveAsNew && !newTemplateName.trim()) {
      enqueueSnackbar('Enter a name for the new CSV template before standardizing.', { variant: 'warning' });
      return;
    }
    try {
      const result = await processManifest.mutateAsync({
        orderId,
        data: {
          template_id: effectiveManifestTemplateId,
          column_mappings: formulaMappings,
          save_template: true,
          save_template_as_new: needsSaveAsNew,
          template_name: needsSaveAsNew ? newTemplateName.trim() : templateName || undefined,
        },
      });
      setProcessResult({ rows_created: result.rows_created });
      standardizedFormulasRef.current = { ...formulas };
      templateBaselineFingerprintRef.current = stableFormulasFingerprint(formulas);
      setNewTemplateName('');
      enqueueSnackbar(`Standardized ${result.rows_created} staged row(s)`, { variant: 'success' });
      setCleanupValidatedPayload(null);
      setActiveStep(1);
    } catch {
      enqueueSnackbar('Failed to standardize manifest', { variant: 'error' });
    }
  };

  const handleStandardizeManifest = async () => {
    if (!orderId || !order?.has_manifest_file) return;
    if (!hasMapping('description')) {
      enqueueSnackbar('Set a formula for Description before standardizing', { variant: 'warning' });
      return;
    }
    if (!(hasMapping('unit_retail') || hasMapping('retail_value'))) {
      enqueueSnackbar('Set a formula for unit retail (MSRP) before standardizing — required for pricing', { variant: 'warning' });
      return;
    }
    if (completedStep >= 1) {
      setConfirmDialog('restandardize');
      return;
    }
    await executeStandardizeManifestCore();
  };

  const executeClearStandardization = async () => {
    if (!orderId) return;
    try {
      const result = await clearManifestRowsMutation.mutateAsync(orderId);
      enqueueSnackbar(`Cleared ${result.rows_deleted} manifest rows and ${result.items_deleted ?? 0} item(s)`, { variant: 'info' });
      setProcessResult(null);
      standardizedFormulasRef.current = null;
      setActiveStep(0);
      setStepDerived(false);
      setCleanupValidatedPayload(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      enqueueSnackbar(axiosErr?.response?.data?.detail || 'Failed to clear standardization', { variant: 'error' });
    }
  };

  const handleClearStandardizationRequest = () => setConfirmDialog('undo_std');

  const handleRunCleanupApply = async () => {
    if (!orderId || !cleanupValidatedPayload?.length) return;
    try {
      const result = await uploadCleanupRowsMutation.mutateAsync({ orderId, rows: cleanupValidatedPayload });
      const sw = result.soft_warnings?.length ?? 0;
      setCleanupApplySoftWarnings(result.soft_warnings?.length ? result.soft_warnings : null);
      enqueueSnackbar(
        sw
          ? `Applied cleanup to ${cleanupValidatedPayload.length} row(s) — ${sw} soft warning(s) (see upload log).`
          : `Applied cleanup to ${cleanupValidatedPayload.length} row(s)`,
        { variant: 'success' },
      );
      setCleanupValidatedPayload(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      enqueueSnackbar(axiosErr?.response?.data?.detail || 'Failed to apply cleanup CSV', { variant: 'error' });
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

  const handleFinalizeAndOpenProcessing = async (pending?: PreprocessingReviewRowUpdate[]) => {
    if (!orderId || !order) return;
    try {
      const result = await finalizePreprocessingMutation.mutateAsync({
        orderId,
        rows: pending?.length ? pending : undefined,
      });
      enqueueSnackbar(
        `Finalized ${result.manifest_rows} row(s); ${result.items_created ?? 0} item(s), ${result.batch_groups_created} batch(es).`,
        { variant: 'success' },
      );
      navigate(`/inventory/processing?order=${order.id}`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: unknown } } };
      const msg = axiosErr?.response?.data?.detail;
      enqueueSnackbar(typeof msg === 'string' ? msg : msg ? JSON.stringify(msg) : 'Failed to finalize preprocessing', { variant: 'error' });
    }
  };

  const requestFinalizePreprocessing = () => {
    if (missingPriceCount > 0 || reviewDirtyCount > 0) return;
    setConfirmDialog('finalize');
  };

  const confirmFinalizePreprocessing = async () => {
    setConfirmDialog(null);
    await handleFinalizeAndOpenProcessing();
  };

  const handleOpenProcessing = () => {
    if (!order) return;
    navigate(`/inventory/processing?order=${order.id}`);
  };

  const canStandardize = Boolean(order?.has_manifest_file) && !processManifest.isPending;
  const hasManifestFile = Boolean(order?.has_manifest_file);
  const hasMandatoryMappings =
    hasMapping('description') && (hasMapping('unit_retail') || hasMapping('retail_value'));

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
    setBucketDraftByTarget({});
    if (standardizedFormulasRef.current) {
      setAllFormulas({ ...standardizedFormulasRef.current });
    }
  }, [setAllFormulas]);

  const handleClearFormulas = useCallback(() => {
    const empty: Record<string, string> = {};
    for (const key of Object.keys(formulas)) {
      empty[key] = '';
    }
    setBucketDraftByTarget({});
    setAllFormulas(empty);
  }, [formulas, setAllFormulas]);

  const handleManifestTemplateSelect = useCallback(async (pickedId: number) => {
    setSelectedManifestTemplateId(pickedId);
    setBucketDraftByTarget({});
    try {
      const { data } = await getTemplate(pickedId);
      const mappings = (data.column_mappings ?? []) as ManifestColumnMapping[];
      const nextFormulas = buildFormulas(headers, columns, mappings);
      setAllFormulas(nextFormulas);
      templateBaselineFingerprintRef.current = stableFormulasFingerprint(nextFormulas);
      const snap = computeSampleFormulaSnapshot(nextFormulas, columns, manifestSampleRowsForUi, bucketOrderUi);
      prepS1('handleManifestTemplateSelect: template loaded → sample snapshot', {
        templateId: pickedId,
        sampleCellsFilled: Object.keys(snap.samples).length,
      });
    } catch {
      enqueueSnackbar('Failed to load template mappings', { variant: 'error' });
    }
  }, [columns, enqueueSnackbar, headers, manifestSampleRowsForUi, bucketOrderUi, setAllFormulas]);

  const dropdownOrders: PreprocessingQueueOrder[] = useMemo(() => {
    const rows = [...(queueData?.results ?? [])];
    if (order && !rows.some((r) => r.id === order.id)) {
      rows.unshift({
        id: order.id,
        order_number: order.order_number,
        vendor_name: order.vendor_name ?? '',
        preprocessing_row_count: preprocessingStatus?.preprocessing?.row_count ?? 0,
      });
    }
    return rows;
  }, [
    queueData?.results,
    order?.id,
    order?.order_number,
    order?.vendor_name,
    preprocessingStatus?.preprocessing?.row_count,
  ]);

  const headerTotalUnits = preprocessingStatus?.counts.total_units ?? 0;
  const headerEstimatedRetailLabel = formatCurrency(preprocessingStatus?.summary.total_ideal_price ?? '0');

  let stepperActionHint: ReactNode = null;
  if (activeStep === 0 && step1State === 'partial') {
    stepperActionHint = 'Fill required fields (Description, unit retail / MSRP) to standardize';
  } else if (activeStep === 2 && reviewDirtyCount > 0) {
    stepperActionHint = 'Save changes before finalizing';
  }

  let stepperActionSlot: ReactNode = null;
  if (activeStep === 0) {
    if (step1State === 'ready') {
      stepperActionSlot = (
        <Button
          variant="contained"
          size="small"
          onClick={() => void handleStandardizeManifest()}
          disabled={!canStandardize || step1ActionsLocked || standardizeBlockedByName}
          sx={{ bgcolor: '#2D6A4F', fontSize: 14, fontWeight: 600, textTransform: 'none', py: '10px', px: '20px' }}
        >
          {processManifest.isPending ? 'Standardizing...' : 'Standardize'}
        </Button>
      );
    } else if (completedStep >= 0) {
      stepperActionSlot = (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            variant="outlined"
            color="warning"
            size="small"
            startIcon={clearManifestRowsMutation.isPending ? <CircularProgress size={14} /> : <DeleteOutline />}
            onClick={handleClearStandardizationRequest}
            disabled={clearManifestRowsMutation.isPending}
            sx={{ fontSize: 13, fontWeight: 600, textTransform: 'none' }}
          >
            {clearManifestRowsMutation.isPending ? 'Clearing...' : 'Undo'}
          </Button>
          {(step1State === 'edited' || step1State === 'edited_partial' || step1State === 'done') && (
            <Button
              variant="contained"
              size="small"
              onClick={() => void handleStandardizeManifest()}
              disabled={!canStandardize || step1ActionsLocked || standardizeBlockedByName}
              sx={{ bgcolor: '#2D6A4F', fontSize: 14, fontWeight: 600, textTransform: 'none', py: '10px', px: '20px' }}
            >
              {processManifest.isPending ? 'Re-standardizing...' : 'Re-standardize'}
            </Button>
          )}
        </Box>
      );
    }
  } else if (activeStep === 1) {
    const cleanupRunnable =
      hasActivePreprocessingSession &&
      standardizedRowCount > 0 &&
      cleanedRowCount < standardizedRowCount &&
      Boolean(cleanupValidatedPayload?.length);
    if (cleanupRunnable) {
      stepperActionSlot = (
        <Button
          variant="contained"
          size="small"
          onClick={() => void handleRunCleanupApply()}
          disabled={uploadCleanupRowsMutation.isPending}
          sx={{ bgcolor: '#1565C0', fontSize: 14, fontWeight: 600, textTransform: 'none', py: '10px', px: '20px' }}
        >
          {uploadCleanupRowsMutation.isPending ? 'Applying…' : 'Run Cleanup'}
        </Button>
      );
    }
  } else if (activeStep === 2 && hasActivePreprocessingSession) {
    const finalizeDisabled = missingPriceCount > 0 || reviewDirtyCount > 0 || finalizePreprocessingMutation.isPending;
    stepperActionSlot = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        {completedStep >= 2 && missingPriceCount === 0 && (
          <Typography component="span" sx={{ fontSize: 12, color: '#2D6A4F', fontWeight: 600 }}>
            ✓ All rows priced
          </Typography>
        )}
        <Button
          variant="contained"
          size="small"
          onClick={requestFinalizePreprocessing}
          disabled={finalizeDisabled}
          sx={{ bgcolor: '#2D6A4F', fontSize: 14, fontWeight: 600, textTransform: 'none', py: '10px', px: '20px' }}
        >
          Finalize
        </Button>
      </Box>
    );
  }

  if (showResolveSpinner) return <LoadingScreen />;

  if (orderId === null) {
    return (
      <Box>
        <Typography component="h1" sx={preprocessingStep1.pageTitleSx}>
          Preprocessing
        </Typography>
        <Alert severity="info" sx={{ mt: 2 }}>
          No purchase orders are waiting for manifest preprocessing. Upload a manifest on an order (
          dashboard vendors) to start.
        </Alert>
      </Box>
    );
  }

  if (isLoading && !order) return <LoadingScreen />;
  if (!order) return <Typography>Order not found.</Typography>;
  if (activeStep === null) return <LoadingScreen />;

  return (
    <Box
      sx={{
        bgcolor: '#F4F1EB',
        minWidth: 0,
        maxWidth: '100%',
        overflowX: 'hidden',
      }}
    >
      <PreprocessingPageHeader
        orders={dropdownOrders}
        selectedOrderId={order.id}
        onSelectOrderId={(id) => navigate(`/inventory/preprocessing/${id}`)}
        totalUnits={headerTotalUnits}
        estimatedRetailLabel={headerEstimatedRetailLabel}
        onBackToOrder={() => navigate(`/inventory/orders/${order.id}`)}
      />

      {!hasManifestFile && (
        <Alert severity="info" sx={{ mb: 2, mx: 3 }}>
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
        <Box sx={{ ...preprocessingRootSx, minWidth: 0, maxWidth: '100%', px: 3, pb: 2 }}>
          <PreprocessingStepper
            activeStep={activeStep}
            completedStep={completedStep}
            onStepChange={setActiveStep}
            actionHint={stepperActionHint}
            actionSlot={stepperActionSlot}
          />

          {/* ════════════════════════════════════════════════════════
              STEP 1: Standardize Manifest
          ════════════════════════════════════════════════════════ */}
          {activeStep === 0 && (
            <Box sx={{ maxWidth: '100%', minWidth: 0 }}>
              {completedStep >= 0 && (
                <Alert severity="success" icon={<CheckCircleOutline />} sx={{ mb: 2 }}>
                  Standardization complete — {standardizedRowCount} row(s) created.
                </Alert>
              )}

              {step1PreviewMissing && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Stored manifest preview is missing or empty. On the order detail page, re-upload the raw manifest CSV
                  so Step 1 can load headers and sample rows without re-parsing the full file.
                </Alert>
              )}

              {/* Formula Mappings card (mock `st.card`) */}
              <Box sx={preprocessingStep1.cardSurfaceSx}>
                <Box
                  sx={{
                    ...preprocessingStep1.cardHeaderRowSx,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                    <Typography component="h2" sx={preprocessingStep1.cardTitleSx}>
                      Formula Mappings
                    </Typography>
                    <Typography component="span" sx={preprocessingStep1.badgeSx}>
                      {columns.length} fields
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', ml: { xs: 0, sm: 'auto' } }}>
                    {step1State !== 'clear' && (
                      <Button
                        variant="text"
                        size="small"
                        onClick={handleClearFormulas}
                        sx={{ color: '#c0392b', fontSize: 12, fontWeight: 600, textTransform: 'none' }}
                      >
                        Clear Formulas
                      </Button>
                    )}
                    {(step1State === 'edited' || step1State === 'edited_partial') && (
                      <Button
                        variant="text"
                        size="small"
                        onClick={handleCancelFormulaEdits}
                        sx={{ color: '#555', fontSize: 12, fontWeight: 600, textTransform: 'none' }}
                      >
                        Cancel Edits
                      </Button>
                    )}
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={suggestFormulasMutation.isPending ? <CircularProgress size={14} /> : <AutoAwesome />}
                      onClick={() => void handleSuggestFormulas()}
                      disabled={
                        suggestFormulasMutation.isPending || !headers.length || step1ActionsLocked
                      }
                      sx={{
                        color: '#2D6A4F',
                        borderColor: '#2D6A4F',
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: 'none',
                        py: '6px',
                        px: '14px',
                      }}
                    >
                      {suggestFormulasMutation.isPending ? 'AI analyzing...' : 'Use AI'}
                    </Button>
                  </Box>
                </Box>

                <Box sx={preprocessingStep1.templateRowSx}>
                  <TemplateSelector
                    templates={matchingTemplates}
                    selectedTemplateId={selectedManifestTemplateId ?? templateId ?? null}
                    disabled={step1ActionsLocked}
                    onSelectTemplateId={(id) => void handleManifestTemplateSelect(id)}
                    saveAsNew={
                      needsSaveAsNew
                        ? {
                            value: newTemplateName,
                            onChange: setNewTemplateName,
                            error: standardizeBlockedByName,
                            disabled: step1ActionsLocked,
                            infoTooltip:
                              matchingTemplates.length === 0
                                ? 'No saved templates matched this manifest header signature. When you standardize, we save the current formulas as a new template using the name you enter.'
                                : 'Formulas differ from the loaded template or preview baseline. When you standardize, we save the current formulas as a new template using the name you enter.',
                          }
                        : undefined
                    }
                  />
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: '#888',
                      fontFamily: preprocessingFonts.mono,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Header key: {headerSignature || '--'}
                  </Typography>
                </Box>

                {manifestFieldsQuery.isError ? (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    Could not load standard field definitions (manifest-fields). Refresh the page or try again later.
                  </Alert>
                ) : manifestFieldsGateLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <CircularProgress size={28} />
                  </Box>
                ) : manifestFieldsReady ? (
                  <StandardManifestBuilder
                    headers={headers}
                    columns={columns}
                    formulas={formulas}
                    onFormulaChange={setFormula}
                    aiReasonings={aiReasonings}
                    formulaSamples={formulaSampleSnapshot.samples}
                    formulaSampleErrors={formulaSampleSnapshot.sampleErrors}
                    buckets={manifestFieldMeta?.buckets ?? null}
                    bucketOrder={bucketOrderUi}
                    replaceBucketFormulas={replaceBucketFormulas}
                    onBucketDraftChange={applyBucketDraftChange}
                    onBucketDraftDismiss={dismissBucketDraft}
                  />
                ) : (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    Manifest field metadata is unavailable. Cannot edit formulas until it loads.
                  </Alert>
                )}
              </Box>

              {/* Raw Column Reference card */}
              {manifestSampleRowsForUi.length > 0 && (
                <Box sx={preprocessingStep1.cardSurfaceSx}>
                  <Box
                    role="button"
                    tabIndex={0}
                    onClick={() => setRawReferenceOpen(!rawReferenceOpen)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setRawReferenceOpen(!rawReferenceOpen);
                      }
                    }}
                    sx={{
                      ...preprocessingStep1.cardHeaderRowSx,
                      cursor: 'pointer',
                      userSelect: 'none',
                      mb: rawReferenceOpen ? 1 : 0,
                    }}
                  >
                    <Typography sx={{ ...preprocessingStep1.cardTitleSx, fontSize: 14 }}>
                      {rawReferenceOpen ? '▾' : '▸'} Raw Column Reference ({rawHeaders.length} columns)
                    </Typography>
                    <Typography component="span" sx={preprocessingStep1.badgeMutedSx}>
                      Stored sample (≤10 rows)
                    </Typography>
                  </Box>
                  <Collapse in={rawReferenceOpen}>
                    <TableContainer
                      sx={{
                        ...preprocessingStep1.tableHorizontalScrollSx,
                        maxHeight: 200,
                        mt: 1,
                        border: '1px solid #DDD5C9',
                        borderRadius: 1,
                      }}
                    >
                      <Table
                        size="small"
                        stickyHeader
                        sx={{
                          width: 'max-content',
                          minWidth: '100%',
                          borderCollapse: 'collapse',
                          fontSize: 13,
                          tableLayout: 'auto',
                        }}
                      >
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ ...preprocessingStep1.tableHeaderSmallSx, width: 40 }}>Row</TableCell>
                            {rawHeaders.map((header, idx) => (
                              <TableCell key={`${header}-${idx}`} sx={preprocessingStep1.tableHeaderSmallSx}>
                                {header}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {manifestSampleRowsForUi.map((row, ri) => (
                            <TableRow
                              key={row.row_number}
                              sx={{ bgcolor: ri % 2 === 0 ? '#FAFAF6' : undefined }}
                            >
                              <TableCell sx={preprocessingStep1.tableBodySmallSx}>{row.row_number}</TableCell>
                              {rawHeaders.map((header, idx) => (
                                <TableCell key={`${row.row_number}-${header}-${idx}`} sx={preprocessingStep1.tableBodySmallSx}>
                                  {row.raw[header] || ''}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Collapse>
                </Box>
              )}

              <FormulaPreview
                expanded={formulaPreviewOpen}
                onToggle={() => {
                  prepS1('Formula Preview toggle clicked', {
                    nextExpanded: !formulaPreviewOpen,
                  });
                  setFormulaPreviewOpen(!formulaPreviewOpen);
                }}
                onRefresh={runFormulaPreviewSnapshot}
                previewTargets={formulaPreviewGridSnapshot.previewTargets}
                previewRows={formulaPreviewGridSnapshot.previewRows}
                columns={columns}
                bucketLabels={bucketLabelsForPreview}
              />
            </Box>
          )}

          {/* ════════════════════════════════════════════════════════
              STEP 2: AI Cleanup
          ════════════════════════════════════════════════════════ */}
          {activeStep === 1 && (
            <CleanupStep
              orderId={orderId!}
              orderNumber={order.order_number}
              standardizedRowCount={standardizedRowCount}
              cleanedRowCount={cleanedRowCount}
              completedStep={completedStep}
              expectedRowIds={cleanupExpectedRowIds ?? EMPTY_EXPECTED_ROW_IDS}
              rowNumberById={cleanupRowNumberById}
              validatedPayload={cleanupValidatedPayload}
              onValidatedPayloadChange={setCleanupValidatedPayload}
              lastApplySoftWarnings={cleanupApplySoftWarnings}
              onDismissApplyWarnings={() => setCleanupApplySoftWarnings(null)}
            />
          )}

          {/* ════════════════════════════════════════════════════════
              STEP 3: Final Review
          ════════════════════════════════════════════════════════ */}
          {activeStep === 2 && (
            <Box>
              {completedStep >= 2 && hasActivePreprocessingSession && (
                <Alert severity="success" icon={<CheckCircleOutline />} sx={{ mb: 1.5 }}>
                  Final review complete — all staged rows are priced.
                </Alert>
              )}
              {hasActivePreprocessingSession ? (
                <>
                  {reviewFullLoading && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Loading {preprocessingStatus?.preprocessing?.row_count ?? ''} staged rows…
                    </Typography>
                  )}
                  <PreprocessingReviewTable
                    rows={reviewPageSlice}
                    getStagedRow={getStagedRow}
                    filteredRowIds={filteredReviewRows.map((r) => r.id)}
                    baselineByRowId={reviewBaselineByRowId}
                    summary={clientReviewSummary}
                    totalFilteredCount={filteredReviewRows.length}
                    page={reviewPage}
                    pageSize={reviewPageSize}
                    isLoading={reviewFullLoading && !reviewRowsFull?.length}
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
                    onPersistSuccess={mergeReviewPatches}
                    onDirtyCountChange={setReviewDirtyCount}
                    isSaving={updatePreprocessingReview.isPending}
                  />
                </>
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
        </Box>
      )}

      <ConfirmModal
        open={confirmDialog === 'undo_std'}
        emoji="⚠️"
        title="Undo standardization?"
        message="This permanently deletes standardized rows, cleanup suggestions, manual review edits on staged rows, and non-terminal generated products/items tied to this workflow."
        confirmLabel="Undo standardization"
        danger
        isBusy={clearManifestRowsMutation.isPending}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => {
          setConfirmDialog(null);
          void executeClearStandardization();
        }}
      />
      <ConfirmModal
        open={confirmDialog === 'restandardize'}
        emoji="⚠️"
        title="Re-run standardize?"
        message="Re-running standardize will clear all AI cleanup output and manual review edits for this order. Continue?"
        confirmLabel="Confirm"
        isBusy={processManifest.isPending}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => {
          setConfirmDialog(null);
          void executeStandardizeManifestCore();
        }}
      />
      <ConfirmModal
        open={confirmDialog === 'finalize'}
        title="Finalize preprocessing?"
        message={`Create processing batches from ${standardizedRowCount} staged row(s) and open the processing queue.`}
        confirmLabel="Finalize"
        isBusy={finalizePreprocessingMutation.isPending}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => void confirmFinalizePreprocessing()}
      />
    </Box>
  );
}
