import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  List,
  ListItemButton,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Link,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import CheckCircle from '@mui/icons-material/CheckCircle';
import FilterList from '@mui/icons-material/FilterList';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import Refresh from '@mui/icons-material/Refresh';
import Search from '@mui/icons-material/Search';
import WarningAmber from '@mui/icons-material/WarningAmber';
import { useSnackbar } from 'notistack';
import { TARS_SOURCE_COLORS } from './tarsConstants';
import { TarsGradeValuesCard } from './TarsGradeValuesCard';
import { TarsSplitDialog } from './TarsSplitDialog';
import { TarsAlreadyInQueueDialog } from './TarsAlreadyInQueueDialog';
import { TarsItemBlockedDialog, type TarsBlockedLocation } from './TarsItemBlockedDialog';
import { TarsNeedsPricesDialog } from './TarsNeedsPricesDialog';
import { TarsScanMessageDialog } from './TarsScanMessageDialog';
import { stackSkuSummary } from './tarsStackDisplay';
import {
  useCombineRestorationJobs,
  useCreateRestorationJobFromSku,
  usePatchRestorationJob,
  useReturnRestorationJobToProcessing,
  useSplitRestorationJob,
} from '../../../hooks/useRestorationJobs';
import { useRestorationQueueJobs } from '../../../hooks/useRestorationBench';
import { useGradeScales } from '../../../hooks/useGradeScales';
import { gradeValuesComplete, gradesForScale } from './tarsProfit';
import type {
  RestorationJobDTO,
  RestorationJobCreateResultDTO,
  RestorationJobReturnPayload,
  RestorationReturnDispositionType,
  RestorationUntouchedReason,
  TarsSource,
} from '../../../types/inventory.types';
import { inventoryWorkbenchItemUrl } from '../../../utils/richInventorySearch';

export type TarsQueueNavState = {
  selectJobId?: number;
  showNeedsPricesDialog?: boolean;
};

type BulkAction = 'combine' | 'split' | 'return' | 'clear';

const QUEUE_HEADER_MIN_HEIGHT = 158;

function SourceDot({ source }: { source: TarsSource }) {
  const color = source ? TARS_SOURCE_COLORS[source] : '#94a3b8';
  return (
    <Box
      component="span"
      sx={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: color,
        flexShrink: 0,
      }}
    />
  );
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function parseMoney(raw: string | null | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

function gradeCompletion(job: RestorationJobDTO, scales: Record<string, string[]>) {
  const grades = gradesForScale(job.scale, scales);
  const values = job.grade_values ?? {};
  const complete = grades.filter((grade) => (values[grade] ?? 0) > 0).length;
  const amounts = grades.map((grade) => values[grade] ?? 0);
  return {
    complete,
    total: grades.length,
    maxValue: amounts.length > 0 ? Math.max(...amounts) : 0,
  };
}

function primaryCatalogItem(job: RestorationJobDTO) {
  return job.items[0] ?? null;
}

function stackConditionSummary(job: RestorationJobDTO) {
  const conditions = Array.from(
    new Set(
      (job.items ?? [])
        .map((item) => item.condition?.trim())
        .filter(Boolean),
    ),
  );
  if (conditions.length > 1) return 'Mixed';
  return conditions[0] ?? job.condition;
}

function jobToCardItem(job: RestorationJobDTO) {
  const catalogItem = primaryCatalogItem(job);
  const catalogSku = catalogItem?.sku ?? job.sku ?? undefined;
  return {
    sku: catalogSku,
    skuLabel: stackSkuSummary(job),
    catalogItemId: catalogItem?.id,
    catalogItemIds: (job.items ?? []).map((item) => item.id),
    productId: job.product_id ?? undefined,
    orderId: job.purchase_order_id ?? undefined,
    stackQuantity: job.quantity,
    orderNumber: job.purchase_order_number ?? undefined,
    name: job.name,
    brand: job.brand,
    model: job.model,
    productNumber: job.product_number,
    upc: job.upc,
    source: job.source ?? undefined,
    category: job.category,
    condition: stackConditionSummary(job),
    retail: parseMoney(job.retail),
    price: parseMoney(job.price),
  };
}

const UNTOUCHED_REASON_OPTIONS: Array<{ value: RestorationUntouchedReason; label: string }> = [
  { value: 'recalled', label: 'Untouched - Recalled' },
  { value: 'not_worth_it', label: 'Untouched - Not worth it from preliminary look' },
  { value: 'other', label: 'Untouched - Other reason' },
];

function queueTotals(jobs: RestorationJobDTO[]) {
  const stackCount = jobs.length;
  const itemCount = jobs.reduce((sum, job) => sum + job.quantity, 0);
  return { stackCount, itemCount };
}

function itemCountLabel(count: number) {
  return `${count} item${count === 1 ? '' : 's'}`;
}

function stackCountLabel(count: number) {
  return `${count} stack${count === 1 ? '' : 's'}`;
}

function normalizeGradeValues(values: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(values).map(([grade, value]) => [
      grade,
      Number.isFinite(value) ? Math.round(value * 100) / 100 : 0,
    ]),
  );
}

function stackProductKey(job: RestorationJobDTO) {
  return job.product_id != null ? String(job.product_id) : `${job.name}|${job.brand}|${job.model}|${job.product_number}|${job.upc}`;
}

function stackMoneyKey(raw: string | null) {
  const value = parseMoney(raw);
  return value == null ? '' : value.toFixed(2);
}

function hasCompleteCombineData(job: RestorationJobDTO, scales: Record<string, string[]>) {
  return (
    parseMoney(job.retail) != null &&
    parseMoney(job.price) != null &&
    gradeValuesComplete(job.scale, job.grade_values ?? {}, scales)
  );
}

function jobMatchesSearch(job: RestorationJobDTO, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    job.sku,
    job.name,
    job.brand,
    job.model,
    job.category,
    job.product_number,
    job.upc,
    job.purchase_order_number,
    job.scale,
    ...(job.items ?? []).map((item) => item.sku),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function StackedQueueCard({
  job,
  selected,
  checked,
  onToggleChecked,
  onSelect,
  scales,
}: {
  job: RestorationJobDTO;
  selected: boolean;
  checked: boolean;
  onToggleChecked: () => void;
  onSelect: () => void;
  scales: Record<string, string[]>;
}) {
  const needsSetup = job.needs_setup;
  const completion = gradeCompletion(job, scales);
  const stackDepth = Math.min(Math.max(job.quantity - 1, 0), 2);
  const catalogItem = primaryCatalogItem(job);
  const catalogUrl = catalogItem ? inventoryWorkbenchItemUrl(catalogItem) : null;
  const skuLabel = stackSkuSummary(job);

  return (
    <Box sx={{ position: 'relative', mb: 0.75, px: stackDepth > 0 ? 0.5 : 0, pt: stackDepth > 0 ? 0.5 : 0 }}>
      {stackDepth > 0 &&
        Array.from({ length: stackDepth }, (_, index) => (
          <Box
            key={index}
        sx={{
              position: 'absolute',
              top: (stackDepth - index) * 4,
              left: (stackDepth - index) * 4,
              right: -(stackDepth - index) * 4,
              bottom: -(stackDepth - index) * 4,
              borderRadius: 1.5,
              border: '1px solid #e2e8f0',
              bgcolor: index === 0 ? '#eef2f7' : '#f8fafc',
              zIndex: 0,
            }}
          />
        ))}
                  <ListItemButton
                    selected={selected}
        onClick={onSelect}
                    sx={{
          position: 'relative',
          zIndex: 1,
                      display: 'block',
                      p: 1.1,
                      borderRadius: 1.5,
                      border: '1px solid',
                      borderColor: selected ? 'success.main' : needsSetup ? '#f59e0b' : '#e2e8f0',
                      bgcolor: selected ? '#e8f5e9' : 'background.paper',
                      boxShadow: selected ? '0 8px 18px rgba(46, 125, 50, 0.16)' : '0 4px 12px rgba(15, 23, 42, 0.04)',
                      '&.Mui-selected': { bgcolor: '#e8f5e9' },
                      '&:hover': {
                        bgcolor: selected ? '#e8f5e9' : '#ffffff',
                        borderColor: selected ? 'success.main' : '#cbd5e1',
                      },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(180px, 1fr) auto',
                          gap: 1,
                          alignItems: 'center',
                          mb: 0.65,
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1} minWidth={0}>
              <Checkbox
                size="small"
                checked={checked}
                onClick={(event) => event.stopPropagation()}
                onChange={onToggleChecked}
                sx={{ p: 0.25 }}
              />
              <SourceDot source={job.source} />
              <Chip
                label={itemCountLabel(job.quantity)}
                size="small"
                sx={{ height: 20, fontSize: 10, fontWeight: 800, bgcolor: '#eef2f7' }}
              />
              {catalogUrl ?
                <Link
                  component={RouterLink}
                  to={catalogUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="caption"
                  fontFamily="monospace"
                  fontWeight={850}
                  noWrap
                  title={`Open ${skuLabel} in catalog`}
                  onClick={(event) => event.stopPropagation()}
                  sx={{
                    color: 'primary.main',
                    textDecorationColor: 'rgba(25, 118, 210, 0.4)',
                    '&:hover': { textDecorationColor: 'inherit' },
                  }}
                >
                  {skuLabel}
                </Link>
              : <Typography variant="caption" fontFamily="monospace" fontWeight={850} noWrap title={skuLabel}>
                  {skuLabel}
                          </Typography>
              }
              <Typography variant="body2" fontWeight={800} lineHeight={1.15} noWrap title={job.name}>
                {job.name}
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Chip
                            icon={needsSetup ? <WarningAmber sx={{ fontSize: 14 }} /> : <CheckCircle sx={{ fontSize: 14 }} />}
                            label={needsSetup ? 'Needs values' : 'Ready'}
                            size="small"
                            color={needsSetup ? 'warning' : 'success'}
                            variant={needsSetup ? 'outlined' : 'filled'}
                            sx={{ height: 20, fontSize: 10, fontWeight: 750 }}
                          />
                        </Stack>
                      </Box>

                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: {
                            xs: '1fr 1fr',
                            lg: '1.15fr 0.72fr 0.6fr 0.62fr 0.7fr 0.9fr',
                          },
                          gap: 0.75,
                          alignItems: 'center',
                        }}
                      >
                        {[
              ['Category', job.category],
              ['Scale', job.scale || 'No scale'],
              ['Retail', parseMoney(job.retail) != null ? formatUsd(parseMoney(job.retail)!) : '—'],
              ['Price', parseMoney(job.price) != null ? formatUsd(parseMoney(job.price)!) : '—'],
                          ['Values', `${completion.complete}/${completion.total || '—'}`],
              ['Order #', job.purchase_order_number || '—'],
                        ].map(([label, value]) => (
                          <Box
                            key={label}
                            sx={{
                              minWidth: 0,
                              px: 0.75,
                              py: 0.45,
                              borderRadius: 1,
                              bgcolor: '#fff',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>
                              {label}
                            </Typography>
                            <Typography
                              variant="caption"
                              fontWeight={850}
                  fontFamily={label === 'Order #' || label === 'Values' ? 'monospace' : undefined}
                              noWrap
                  title={String(value)}
                              sx={{ display: 'block', lineHeight: 1.25 }}
                            >
                              {value}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </ListItemButton>
    </Box>
  );
}

export function TarsIntakePanel() {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as TarsQueueNavState | null;
  const { scales: gradeScales } = useGradeScales();
  const { data: jobs = [], isLoading, isError, isFetching, refetch } = useRestorationQueueJobs();
  const createFromSku = useCreateRestorationJobFromSku();
  const patchJob = usePatchRestorationJob();
  const combineJobs = useCombineRestorationJobs();
  const returnJob = useReturnRestorationJobToProcessing();
  const splitJob = useSplitRestorationJob();

  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedStackIds, setSelectedStackIds] = useState<number[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [needsValuesFilter, setNeedsValuesFilter] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [alreadyInQueueDialog, setAlreadyInQueueDialog] = useState<{
    sku: string;
    jobId: number;
    itemId: number;
    stackQuantity: number;
  } | null>(null);
  const [blockedDialog, setBlockedDialog] = useState<{
    sku: string;
    jobId: number;
    location: TarsBlockedLocation;
  } | null>(null);
  const [scanMessageDialog, setScanMessageDialog] = useState<{ title: string; message: string } | null>(null);
  const [needsPricesDialog, setNeedsPricesDialog] = useState<{ sku: string } | null>(null);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitDialogJob, setSplitDialogJob] = useState<RestorationJobDTO | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [combineUseTopValues, setCombineUseTopValues] = useState(false);
  const [bulkReturnDispositionType, setBulkReturnDispositionType] =
    useState<RestorationReturnDispositionType>('untouched');
  const [bulkReturnReason, setBulkReturnReason] = useState<RestorationUntouchedReason>('recalled');
  const [bulkReturnScale, setBulkReturnScale] = useState('');
  const [bulkReturnGrade, setBulkReturnGrade] = useState('');
  const [bulkReturnNotes, setBulkReturnNotes] = useState('');
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnScope, setReturnScope] = useState<'all' | 'selected'>('all');
  const [returnSelectedItemIds, setReturnSelectedItemIds] = useState<number[]>([]);
  const [returnDispositionType, setReturnDispositionType] =
    useState<RestorationReturnDispositionType>('untouched');
  const [returnReason, setReturnReason] = useState<RestorationUntouchedReason>('recalled');
  const [returnScale, setReturnScale] = useState('');
  const [returnGrade, setReturnGrade] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [saveFormatVersion, setSaveFormatVersion] = useState(0);
  const [localEdits, setLocalEdits] = useState<
    Record<number, { scale: string; values: Record<string, number> }>
  >({});
  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<{ id: number; payload: { scale?: string; grade_values?: Record<string, number> } } | null>(null);

  const displayForJob = useCallback(
    (job: RestorationJobDTO) =>
      localEdits[job.id] ?? { scale: job.scale, values: job.grade_values ?? {} },
    [localEdits],
  );

  const flushPatch = useCallback(() => {
    const pending = pendingPatchRef.current;
    if (!pending) return;
    pendingPatchRef.current = null;
    patchJob.mutate(pending);
  }, [patchJob]);

  const schedulePatch = useCallback(
    (id: number, payload: { scale?: string; grade_values?: Record<string, number> }) => {
      pendingPatchRef.current = { id, payload };
      if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
      patchTimerRef.current = setTimeout(flushPatch, 400);
    },
    [flushPatch],
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (!navState?.selectJobId) return;
    setSelectedJobId(navState.selectJobId);
    if (navState.showNeedsPricesDialog) {
      const job = jobs.find((entry) => entry.id === navState.selectJobId);
      if (job) {
        const sku = job.sku ?? job.items[0]?.sku ?? 'Item';
        setNeedsPricesDialog({ sku });
      }
    }
    window.history.replaceState({}, document.title);
  }, [jobs, navState?.selectJobId, navState?.showNeedsPricesDialog]);

  const visibleJobs = useMemo(
    () =>
      jobs.filter((job) => {
        if (needsValuesFilter && !job.needs_setup) return false;
        return jobMatchesSearch(job, searchQuery);
      }),
    [jobs, needsValuesFilter, searchQuery],
  );

  useEffect(() => {
    if (visibleJobs.length === 0) {
      setSelectedJobId(null);
      setSelectedStackIds([]);
      return;
    }
    if (selectedJobId == null || !visibleJobs.some((j) => j.id === selectedJobId)) {
      setSelectedJobId(visibleJobs[0].id);
    }
    setSelectedStackIds((prev) => prev.filter((id) => jobs.some((job) => job.id === id)));
  }, [jobs, selectedJobId, visibleJobs]);

  const activeJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) ?? visibleJobs[0] ?? null,
    [jobs, selectedJobId, visibleJobs],
  );

  const totals = useMemo(() => queueTotals(visibleJobs), [visibleJobs]);
  const selectedStacks = useMemo(
    () =>
      selectedStackIds
        .map((id) => jobs.find((job) => job.id === id))
        .filter((job): job is RestorationJobDTO => Boolean(job)),
    [jobs, selectedStackIds],
  );
  const selectedItemCount = selectedStacks.reduce((sum, job) => sum + job.quantity, 0);
  const topSelectedStack = selectedStacks[0] ?? null;
  const combineOrderMismatch = new Set(selectedStacks.map((job) => job.purchase_order_number ?? '')).size > 1;
  const combineProductMismatch = new Set(selectedStacks.map(stackProductKey)).size > 1;
  const combineNeedsPriceConfirm =
    new Set(selectedStacks.map((job) => stackMoneyKey(job.retail))).size > 1 ||
    new Set(selectedStacks.map((job) => stackMoneyKey(job.price))).size > 1;
  const combineMergeSource = selectedStacks.find((job) => hasCompleteCombineData(job, gradeScales)) ?? topSelectedStack;

  const splittableSelectedStacks = useMemo(
    () => selectedStacks.filter((job) => job.quantity > 1),
    [selectedStacks],
  );
  const queueStatsLabel =
    selectedStackIds.length > 0 ?
      `${itemCountLabel(totals.itemCount)} · ${stackCountLabel(totals.stackCount)} · ${selectedStackIds.length} selected`
    : `${itemCountLabel(totals.itemCount)} · ${stackCountLabel(totals.stackCount)}`;

  const compactQueueActionSx = {
    minHeight: 28,
    px: 1,
    py: 0.25,
    fontSize: '0.75rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  } as const;

  const queuePatch = useCallback(
    (id: number, payload: { scale?: string; grade_values?: Record<string, number> }) => {
      schedulePatch(id, payload);
    },
    [schedulePatch],
  );

  const handleScaleChange = useCallback(
    (job: RestorationJobDTO, scale: string) => {
      const prev = displayForJob(job);
      setLocalEdits((ed) => ({
        ...ed,
        [job.id]: { scale, values: prev.values },
      }));
      queuePatch(job.id, { scale });
    },
    [displayForJob, queuePatch],
  );

  const handleGradeChange = useCallback(
    (job: RestorationJobDTO, grade: string, value: number) => {
      const prev = displayForJob(job);
      const nextValues = { ...prev.values, [grade]: value };
      setLocalEdits((ed) => ({
        ...ed,
        [job.id]: { scale: prev.scale, values: nextValues },
      }));
      queuePatch(job.id, { grade_values: nextValues });
    },
    [displayForJob, queuePatch],
  );

  const handleScan = useCallback(async () => {
    const sku = scanInput.trim();
    if (!sku) return;
    try {
      const job: RestorationJobCreateResultDTO = await createFromSku.mutateAsync(sku);
      setScanInput('');
      const itemSku = job.scanned_item_sku ?? job.sku ?? sku;
      const itemId = job.scanned_item_id ?? job.items[0]?.id;

      if (job.queue_add_status === 'on_bench' || job.queue_add_status === 'on_pending') {
        setBlockedDialog({
          sku: itemSku,
          jobId: job.id,
          location: job.queue_add_status,
        });
        return;
      }

      if (job.queue_add_status === 'already_queued') {
        setSelectedJobId(job.id);
        if (itemId != null) {
          setAlreadyInQueueDialog({
            sku: itemSku,
            jobId: job.id,
            itemId,
            stackQuantity: job.quantity,
          });
        }
        return;
      }

      setSelectedJobId(job.id);
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err ?
          (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : undefined;
      setScanMessageDialog({
        title: 'Could not add item',
        message: detail || 'No restoration item found for that SKU or item #.',
      });
    }
  }, [createFromSku, scanInput]);

  const handleGoToBlocked = useCallback(() => {
    if (!blockedDialog) return;
    navigate('/restoration/tars', {
      state: { selectJobId: blockedDialog.jobId },
    });
    setBlockedDialog(null);
  }, [blockedDialog, navigate]);

  const handleRemoveFromStack = useCallback(() => {
    if (!alreadyInQueueDialog) return;
    const { jobId, itemId } = alreadyInQueueDialog;
    splitJob.mutate(
      { id: jobId, payload: { groups: [{ item_ids: [itemId] }] } },
      {
        onSuccess: (result) => {
          const nextId = result.created_jobs[0]?.id ?? result.source_job?.id ?? null;
          if (nextId != null) setSelectedJobId(nextId);
          setAlreadyInQueueDialog(null);
          enqueueSnackbar('Item removed from stack.', { variant: 'success' });
        },
        onError: (err: unknown) => {
          const detail =
            err && typeof err === 'object' && 'response' in err ?
              (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined;
          enqueueSnackbar(detail || 'Could not remove item from stack.', { variant: 'warning' });
        },
      },
    );
  }, [alreadyInQueueDialog, enqueueSnackbar, splitJob]);

  const activeDisplay = activeJob ? displayForJob(activeJob) : null;
  const returnGrades = returnScale ? gradesForScale(returnScale, gradeScales) : [];
  const bulkReturnGrades = bulkReturnScale ? gradesForScale(bulkReturnScale, gradeScales) : [];
  const returnItemChoices = activeJob?.items ?? [];
  const returnCount =
    returnScope === 'all' || activeJob == null || activeJob.quantity <= 1 ?
      activeJob?.quantity ?? 0
    : returnSelectedItemIds.length;
  const canReturn =
    activeJob != null &&
    !returnJob.isPending &&
    (
      returnDispositionType === 'untouched' ||
      (returnDispositionType === 'tars_completed' && Boolean(returnScale) && Boolean(returnGrade))
    ) &&
    (
      returnScope === 'all' ||
      activeJob.quantity <= 1 ||
      returnSelectedItemIds.length > 0
    );

  useEffect(() => {
    if (!returnDialogOpen || !activeDisplay || !activeJob) return;
    setReturnDispositionType('untouched');
    setReturnReason('recalled');
    setReturnScale(activeDisplay.scale || '');
    setReturnGrade('');
    setReturnNotes('');
    setReturnScope('all');
    setReturnSelectedItemIds((activeJob.items ?? []).map((item) => item.id));
  }, [activeDisplay, activeJob, returnDialogOpen]);

  const handleReturnSubmit = useCallback(() => {
    if (!activeJob || !canReturn) return;
    const payload: RestorationJobReturnPayload = {
      disposition_type: returnDispositionType,
      reason: returnDispositionType === 'untouched' ? returnReason : '',
      scale: returnDispositionType === 'tars_completed' ? returnScale : '',
      grade: returnDispositionType === 'tars_completed' ? returnGrade : '',
      notes: returnNotes,
      item_ids:
        returnScope === 'selected' && activeJob.quantity > 1 ?
          returnSelectedItemIds
        : undefined,
    };
    returnJob.mutate(
      { id: activeJob.id, payload },
      {
        onSuccess: () => {
          setReturnDialogOpen(false);
          enqueueSnackbar('Returned to Processing', { variant: 'success' });
        },
        onError: (err: unknown) => {
          const detail =
            err && typeof err === 'object' && 'response' in err ?
              (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined;
          enqueueSnackbar(detail || 'Could not return to Processing.', { variant: 'warning' });
        },
      },
    );
  }, [
    activeJob,
    canReturn,
    enqueueSnackbar,
    returnDispositionType,
    returnGrade,
    returnJob,
    returnNotes,
    returnReason,
    returnScale,
    returnScope,
    returnSelectedItemIds,
  ]);

  const handleSplit = useCallback(
    (payload: { groups: Array<{ item_ids: number[] }> }) => {
      const splitTarget = splitDialogJob ?? activeJob;
      if (!splitTarget) return;
      splitJob.mutate(
        { id: splitTarget.id, payload },
        {
          onSuccess: (result) => {
            setSplitDialogOpen(false);
            setSplitDialogJob(null);
            const nextId =
              result.created_jobs[0]?.id ?? result.source_job?.id ?? null;
            if (nextId != null) setSelectedJobId(nextId);
            enqueueSnackbar('Stack split successfully.', { variant: 'success' });
          },
          onError: (err: unknown) => {
            const detail =
              err && typeof err === 'object' && 'response' in err ?
                (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
              : undefined;
            enqueueSnackbar(detail || 'Could not split stack.', { variant: 'warning' });
          },
        },
      );
    },
    [activeJob, enqueueSnackbar, splitDialogJob, splitJob],
  );

  const handleSave = useCallback(() => {
    if (!activeJob || !activeDisplay) return;
    const normalizedValues = normalizeGradeValues(activeDisplay.values);
    setLocalEdits((ed) => ({
      ...ed,
      [activeJob.id]: { scale: activeDisplay.scale, values: normalizedValues },
    }));
    if (patchTimerRef.current) {
      clearTimeout(patchTimerRef.current);
      patchTimerRef.current = null;
    }
    pendingPatchRef.current = null;
    patchJob.mutate(
      {
        id: activeJob.id,
        payload: {
          scale: activeDisplay.scale,
          grade_values: normalizedValues,
        },
      },
      {
        onSuccess: (data) => {
          setLocalEdits((ed) => ({
            ...ed,
            [data.id]: { scale: data.scale, values: data.grade_values ?? {} },
          }));
          setSaveFormatVersion((version) => version + 1);
          enqueueSnackbar('Saved', { variant: 'success' });
        },
        onError: () => {
          enqueueSnackbar('Could not save grade values.', { variant: 'warning' });
        },
      },
    );
  }, [activeDisplay, activeJob, enqueueSnackbar, patchJob]);

  const toggleStackSelection = useCallback((jobId: number) => {
    setSelectedStackIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId],
    );
  }, []);

  const handleRefreshQueue = useCallback(async () => {
    if (patchTimerRef.current) {
      clearTimeout(patchTimerRef.current);
      patchTimerRef.current = null;
    }
    pendingPatchRef.current = null;
    setLocalEdits({});
    try {
      const result = await refetch();
      if (result.isError) {
        enqueueSnackbar('Could not refresh queue.', { variant: 'error' });
        return;
      }
      enqueueSnackbar('Queue refreshed.', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not refresh queue.', { variant: 'error' });
    }
  }, [enqueueSnackbar, refetch]);

  const toggleSelectAllVisibleStacks = useCallback(() => {
    const visibleIds = new Set(visibleJobs.map((job) => job.id));
    const everyVisibleSelected =
      visibleJobs.length > 0 && visibleJobs.every((job) => selectedStackIds.includes(job.id));
    if (everyVisibleSelected) {
      setSelectedStackIds((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      setSelectedStackIds(visibleJobs.map((job) => job.id));
    }
  }, [visibleJobs, selectedStackIds]);

  const allVisibleSelected =
    visibleJobs.length > 0 && visibleJobs.every((job) => selectedStackIds.includes(job.id));

  const openBulkAction = useCallback((action: BulkAction) => {
    setBulkAction(action);
    setCombineUseTopValues(false);
    setBulkReturnDispositionType('untouched');
    setBulkReturnReason('recalled');
    setBulkReturnScale('');
    setBulkReturnGrade('');
    setBulkReturnNotes('');
  }, []);

  const handleSplitClick = useCallback(() => {
    if (splittableSelectedStacks.length === 1) {
      setSplitDialogJob(splittableSelectedStacks[0]);
      setSplitDialogOpen(true);
      return;
    }
    if (splittableSelectedStacks.length > 1) {
      openBulkAction('split');
    }
  }, [openBulkAction, splittableSelectedStacks]);

  const closeBulkAction = useCallback(() => {
    if (combineJobs.isPending || patchJob.isPending || returnJob.isPending || splitJob.isPending) return;
    setBulkAction(null);
  }, [combineJobs.isPending, patchJob.isPending, returnJob.isPending, splitJob.isPending]);

  const handleBulkConfirm = useCallback(async () => {
    if (!bulkAction || selectedStacks.length === 0) return;

    try {
      if (bulkAction === 'combine') {
        const combined = await combineJobs.mutateAsync({
          job_ids: selectedStacks.map((job) => job.id),
          replace_values: combineNeedsPriceConfirm ? combineUseTopValues : false,
        });
        setSelectedJobId(combined.id);
        enqueueSnackbar('Stacks combined.', { variant: 'success' });
      } else if (bulkAction === 'split') {
        const splittable = selectedStacks.filter((job) => job.quantity > 1);
        await Promise.all(
          splittable.map((job) =>
            splitJob.mutateAsync({
              id: job.id,
              payload: { groups: job.items.map((item) => ({ item_ids: [item.id] })) },
            }),
          ),
        );
        enqueueSnackbar(`Split ${splittable.length} stack${splittable.length === 1 ? '' : 's'} into individuals.`, {
          variant: 'success',
        });
      } else if (bulkAction === 'return') {
        const payload: RestorationJobReturnPayload = {
          disposition_type: bulkReturnDispositionType,
          reason: bulkReturnDispositionType === 'untouched' ? bulkReturnReason : '',
          scale: bulkReturnDispositionType === 'tars_completed' ? bulkReturnScale : '',
          grade: bulkReturnDispositionType === 'tars_completed' ? bulkReturnGrade : '',
          notes: bulkReturnNotes,
        };
        await Promise.all(
          selectedStacks.map((job) => returnJob.mutateAsync({ id: job.id, payload })),
        );
        enqueueSnackbar('Selected stacks returned to Processing.', { variant: 'success' });
      } else if (bulkAction === 'clear') {
        await Promise.all(
          selectedStacks.map((job) =>
            patchJob.mutateAsync({ id: job.id, payload: { scale: '', grade_values: {} } }),
          ),
        );
        setLocalEdits((edits) => {
          const next = { ...edits };
          selectedStacks.forEach((job) => {
            delete next[job.id];
          });
          return next;
        });
        enqueueSnackbar('Selected stack values cleared.', { variant: 'success' });
      }

      setBulkAction(null);
      setSelectedStackIds([]);
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err ?
          (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : undefined;
      enqueueSnackbar(detail || 'Bulk action failed.', { variant: 'warning' });
    }
  }, [
    bulkAction,
    bulkReturnDispositionType,
    bulkReturnGrade,
    bulkReturnNotes,
    bulkReturnReason,
    bulkReturnScale,
    combineJobs,
    combineNeedsPriceConfirm,
    combineUseTopValues,
    enqueueSnackbar,
    patchJob,
    returnJob,
    selectedStacks,
    splitJob,
  ]);

  const bulkActionPending = combineJobs.isPending || patchJob.isPending || returnJob.isPending || splitJob.isPending;
  const bulkReturnCanSubmit =
    bulkReturnDispositionType === 'untouched' ||
    (bulkReturnDispositionType === 'tars_completed' && Boolean(bulkReturnScale) && Boolean(bulkReturnGrade));
  const bulkConfirmDisabled =
    bulkActionPending ||
    selectedStacks.length === 0 ||
    (
      bulkAction === 'combine' &&
      (
        selectedStacks.length < 2 ||
        combineOrderMismatch ||
        combineProductMismatch ||
        (combineNeedsPriceConfirm && !combineUseTopValues)
      )
    ) ||
    (bulkAction === 'split' && !selectedStacks.some((job) => job.quantity > 1)) ||
    (bulkAction === 'return' && !bulkReturnCanSubmit);

  const bulkActionTitle =
    bulkAction === 'combine' ? 'Combine selected stacks'
    : bulkAction === 'split' ? 'Split selected stacks'
    : bulkAction === 'return' ? 'Return selected stacks to Processing'
    : bulkAction === 'clear' ? 'Clear selected values'
    : '';
  const bulkActionMessage =
    bulkAction === 'combine' ?
      `This will combine ${selectedStacks.length} selected stacks (${selectedItemCount} items). Retail, price, grade scale, and values will come from ${combineMergeSource ? stackSkuSummary(combineMergeSource) : 'the first selected stack'}${combineMergeSource && hasCompleteCombineData(combineMergeSource, gradeScales) ? ', the first selected stack with all required data.' : '.'}`
    : bulkAction === 'split' ?
      `This will split every selected multi-item stack into individual one-item stacks. Single-item stacks will be left as-is.`
    : bulkAction === 'return' ?
      `This will return all items in the ${selectedStacks.length} selected stacks (${selectedItemCount} items) to Processing.`
    : bulkAction === 'clear' ?
      `This will clear the grade scale and grade values from the ${selectedStacks.length} selected stacks. The stacks will remain in the queue.`
    : '';

  return (
    <Box
      sx={{
        flex: 1,
        width: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1.5}
        sx={{ mb: 1.5, flexShrink: 0 }}
      >
        <Box minWidth={0}>
          <Typography variant="h5" fontWeight={850} lineHeight={1.15}>
            Restoration Queue
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.35}>
            Search, scan, combine, split, and set TARS grade values for items waiting on restoration review.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          disabled={isFetching}
          onClick={() => void handleRefreshQueue()}
          startIcon={
            isFetching ?
              <CircularProgress size={14} color="inherit" />
            : <Refresh sx={{ fontSize: 16 }} />
          }
          sx={{ flexShrink: 0, fontWeight: 800, whiteSpace: 'nowrap' }}
        >
          Refresh Queue
        </Button>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(440px, 0.95fr) 1.05fr' },
          gap: 2.5,
          alignItems: 'stretch',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            overflow: 'hidden',
            minHeight: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderColor: '#cbd5e1',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.06)',
          }}
        >
              <Box
                sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.85,
              px: 1.25,
              py: 1,
              minHeight: QUEUE_HEADER_MIN_HEIGHT,
                  borderBottom: 1,
                  borderColor: 'divider',
              bgcolor: '#f8fafc',
                  flexShrink: 0,
                }}
              >
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, alignItems: 'start' }}>
              <Stack spacing={0.75} minWidth={0}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  minWidth: 0,
                  height: 34,
                  border: '1px solid',
                  borderColor: '#cbd5e1',
                  borderRadius: 1.25,
                  bgcolor: 'background.paper',
                  overflow: 'hidden',
                  transition: (theme) => theme.transitions.create(['border-color', 'box-shadow']),
                  '&:focus-within': {
                    borderColor: 'success.main',
                    boxShadow: '0 0 0 3px rgba(46, 125, 50, 0.14)',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, px: 1.25, gap: 1 }}>
                  <Search sx={{ color: 'text.secondary', fontSize: 19, flexShrink: 0 }} />
                  <TextField
                    fullWidth
                        size="small"
                    variant="standard"
                    placeholder="Search stacks…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setSearchQuery(searchInput.trim());
                      } else if (e.key === 'Escape') {
                        setSearchInput('');
                        setSearchQuery('');
                      }
                    }}
                    slotProps={{
                      input: {
                        disableUnderline: true,
                        sx: { fontSize: 14 },
                      },
                    }}
                  />
                </Box>
                <Button
                        size="small"
                  onClick={() => {
                    setSearchInput('');
                    setSearchQuery('');
                  }}
                  disabled={!searchInput && !searchQuery}
                  sx={{ height: 34, borderRadius: 0, px: 1.25 }}
                >
                  Clear
                </Button>
                  </Box>
              <Button
                size="small"
                variant={needsValuesFilter ? 'contained' : 'outlined'}
                color={needsValuesFilter ? 'warning' : 'inherit'}
                startIcon={<FilterList sx={{ fontSize: 16 }} />}
                onClick={() => setNeedsValuesFilter((active) => !active)}
                    sx={{
                  alignSelf: 'flex-start',
                  minHeight: 28,
                      px: 1,
                  borderColor: needsValuesFilter ? undefined : '#cbd5e1',
                  bgcolor: needsValuesFilter ? undefined : '#fff',
                  color: needsValuesFilter ? undefined : 'text.secondary',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.25,
                  textTransform: 'uppercase',
                  '& .MuiButton-startIcon': { mr: 0.5 },
                }}
              >
                Needs Values
              </Button>
              </Stack>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  minWidth: 0,
                  height: 34,
                  border: '1px solid',
                  borderColor: '#cbd5e1',
                  borderRadius: 1.25,
                  bgcolor: 'background.paper',
                  overflow: 'hidden',
                  transition: (theme) => theme.transitions.create(['border-color', 'box-shadow']),
                  '&:focus-within': {
                    borderColor: 'success.main',
                    boxShadow: '0 0 0 3px rgba(46, 125, 50, 0.14)',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, px: 1.25, gap: 1 }}>
                  <QrCodeScanner sx={{ color: 'text.secondary', fontSize: 19, flexShrink: 0 }} />
                  <TextField
                    fullWidth
                        size="small"
                    variant="standard"
                    placeholder="Scan SKU or item # to add…"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void handleScan();
                      } else if (e.key === 'Escape') {
                        setScanInput('');
                      }
                    }}
                    slotProps={{
                      input: {
                        disableUnderline: true,
                        sx: { fontFamily: 'monospace', fontSize: 14 },
                      },
                    }}
                  />
                </Box>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => void handleScan()}
                  disabled={createFromSku.isPending}
                  sx={{ height: 34, borderRadius: 0, px: 1.5 }}
                >
                  Add
                </Button>
              </Box>
            </Box>

                <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              spacing={0.75}
              sx={{ mt: 'auto', minWidth: 0, gap: 0.75 }}
                >
                  <Stack
                    direction="row"
                spacing={0.5}
                    alignItems="center"
                flexWrap="nowrap"
                sx={{ minWidth: 0, overflowX: 'auto', pb: 0.15 }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  onClick={toggleSelectAllVisibleStacks}
                  disabled={visibleJobs.length === 0}
                  sx={compactQueueActionSx}
                >
                  {allVisibleSelected ? 'Deselect all' : 'Select all'}
                </Button>
                {selectedStackIds.length > 0 ?
                  <>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={selectedStackIds.length < 2}
                      onClick={() => openBulkAction('combine')}
                      sx={compactQueueActionSx}
                    >
                      Combine
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={splittableSelectedStacks.length === 0 || splitJob.isPending}
                      onClick={handleSplitClick}
                      sx={compactQueueActionSx}
                    >
                      Split
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => openBulkAction('return')}
                      sx={compactQueueActionSx}
                    >
                      Return
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      onClick={() => openBulkAction('clear')}
                      sx={compactQueueActionSx}
                    >
                      Clear values
                    </Button>
                  </>
                : null}
              </Stack>
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                justifyContent="flex-end"
                flexWrap="nowrap"
                sx={{ flexShrink: 0 }}
              >
                <Chip
                  label={queueStatsLabel}
                  size="small"
                  sx={{ fontWeight: 700, bgcolor: '#eef2f7', flexShrink: 0, maxWidth: 'none' }}
                />
              </Stack>
            </Stack>
          </Box>
          <Divider />
          {isLoading ?
            <Box sx={{ display: 'grid', placeItems: 'center', flex: 1, py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          : isError ?
            <Typography variant="body2" color="error" textAlign="center" py={5} px={2}>
              Could not load restoration queue.
                    </Typography>
          : visibleJobs.length === 0 ?
            <Typography variant="body2" color="text.secondary" textAlign="center" py={5} px={2}>
              {needsValuesFilter && searchQuery ?
                'No stacks need values match that search.'
              : needsValuesFilter ?
                'No stacks need values.'
              : searchQuery ?
                'No stacks match that search.'
              : 'Nothing queued yet.'}
                    </Typography>
          : <List
              disablePadding
                        sx={{
                p: 1,
                bgcolor: '#f8fafc',
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overscrollBehavior: 'contain',
              }}
            >
              {visibleJobs.map((job) => (
                <StackedQueueCard
                  key={job.id}
                  job={job}
                  selected={activeJob?.id === job.id}
                  checked={selectedStackIds.includes(job.id)}
                  onToggleChecked={() => toggleStackSelection(job.id)}
                  onSelect={() => setSelectedJobId(job.id)}
                  scales={gradeScales}
                />
              ))}
            </List>
          }
        </Paper>

        {activeJob && activeDisplay ?
          <TarsGradeValuesCard
            fillHeight
            item={jobToCardItem(activeJob)}
            scale={activeDisplay.scale}
            values={activeDisplay.values}
            formatVersion={saveFormatVersion}
            scales={gradeScales}
            onScaleChange={(name) => handleScaleChange(activeJob, name)}
            onGradeValueChange={(grade, value) => handleGradeChange(activeJob, grade, value)}
            secondaryAction={{
              disabled: returnJob.isPending || patchJob.isPending,
              label: 'Return to Processing',
              onClick: () => setReturnDialogOpen(true),
            }}
            sendAction={{
              disabled: patchJob.isPending,
              label: 'Save',
              requireCompleteGrades: false,
              onSend: handleSave,
            }}
          />
        : <Paper
            variant="outlined"
                            sx={{
              minHeight: 320,
              height: '100%',
                              display: 'grid',
                              placeItems: 'center',
              borderColor: '#cbd5e1',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Select a queued item to set its grade scale and values.
            </Typography>
          </Paper>
        }
      </Box>

      <Dialog
        open={returnDialogOpen}
        onClose={returnJob.isPending ? undefined : () => setReturnDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Return to Processing</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Send units back to Processing with a restoration disposition.
            </Typography>

            {activeJob && activeJob.quantity > 1 ?
              <FormControl>
                <RadioGroup
                  row
                  value={returnScope}
                  onChange={(e) => setReturnScope(e.target.value as 'all' | 'selected')}
                >
                  <FormControlLabel
                    value="all"
                    control={<Radio />}
                    label={`Return all ${activeJob.quantity} items`}
                  />
                  <FormControlLabel
                    value="selected"
                    control={<Radio />}
                    label="Return selected items"
                  />
                </RadioGroup>
              </FormControl>
            : null}

            {returnScope === 'selected' && activeJob && activeJob.quantity > 1 ?
                            <Box
                              sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  maxHeight: 180,
                  overflowY: 'auto',
                }}
              >
                {returnItemChoices.map((item) => (
                  <FormControlLabel
                    key={item.id}
                    sx={{ display: 'flex', mx: 0, px: 1.5, py: 0.25 }}
                    control={
                      <Checkbox
                        checked={returnSelectedItemIds.includes(item.id)}
                        onChange={(e) => {
                          setReturnSelectedItemIds((prev) =>
                            e.target.checked ?
                              [...prev, item.id]
                            : prev.filter((id) => id !== item.id),
                          );
                        }}
                      />
                    }
                    label={
                      <Typography variant="body2" fontFamily="monospace">
                        {item.sku}
                            </Typography>
                    }
                  />
                ))}
              </Box>
            : null}

            {activeJob && activeJob.quantity > 1 ?
                            <Typography variant="caption" color="text.secondary">
                Returning {returnCount} of {activeJob.quantity}.{' '}
                {activeJob.quantity - returnCount} will remain in the restoration queue.
                            </Typography>
            : null}

            <FormControl>
              <RadioGroup
                value={returnDispositionType}
                onChange={(e) => setReturnDispositionType(e.target.value as RestorationReturnDispositionType)}
              >
                <FormControlLabel
                  value="tars_completed"
                  control={<Radio />}
                  label="TARS completed"
                />
                <FormControlLabel
                  value="untouched"
                  control={<Radio />}
                  label="Untouched - TARS not needed"
                />
              </RadioGroup>
            </FormControl>

            {returnDispositionType === 'untouched' ?
              <TextField
                select
                label="Reason"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value as RestorationUntouchedReason)}
                fullWidth
              >
                {UNTOUCHED_REASON_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
            : <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  select
                  label="Achieved scale"
                  value={returnScale}
                  onChange={(e) => {
                    setReturnScale(e.target.value);
                    setReturnGrade('');
                  }}
                  fullWidth
                >
                  {Object.keys(gradeScales).map((scale) => (
                    <MenuItem key={scale} value={scale}>
                      {scale}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Achieved grade"
                  value={returnGrade}
                  onChange={(e) => setReturnGrade(e.target.value)}
                  fullWidth
                  disabled={!returnScale}
                >
                  {returnGrades.map((grade) => (
                    <MenuItem key={grade} value={grade}>
                      {grade}
                    </MenuItem>
                  ))}
                </TextField>
                        </Stack>
            }

                          <TextField
              label="Notes"
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              multiline
              minRows={3}
              fullWidth
              placeholder="Add details for Processing..."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReturnDialogOpen(false)} disabled={returnJob.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            disabled={!canReturn}
            onClick={handleReturnSubmit}
          >
            Return to Processing
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={bulkAction != null}
        onClose={bulkActionPending ? undefined : closeBulkAction}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{bulkActionTitle}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {bulkActionMessage}
            </Typography>

            {bulkAction === 'combine' && combineOrderMismatch ?
              <Typography variant="body2" color="error" fontWeight={800}>
                Selected stacks must be from the same order.
              </Typography>
            : null}

            {bulkAction === 'combine' && combineProductMismatch ?
              <Typography variant="body2" color="error" fontWeight={800}>
                Selected stacks must be for the same product.
              </Typography>
            : null}

            {bulkAction === 'combine' && combineNeedsPriceConfirm ?
              <FormControlLabel
                control={
                  <Checkbox
                    checked={combineUseTopValues}
                    onChange={(event) => setCombineUseTopValues(event.target.checked)}
                  />
                }
                label={`Retail or price differs across selected stacks. Use ${combineMergeSource ? stackSkuSummary(combineMergeSource) : 'the merge source'} for the combined stack.`}
              />
            : null}

            {bulkAction === 'return' ?
              <>
                <FormControl>
                  <RadioGroup
                    value={bulkReturnDispositionType}
                    onChange={(e) => setBulkReturnDispositionType(e.target.value as RestorationReturnDispositionType)}
                  >
                    <FormControlLabel
                      value="tars_completed"
                      control={<Radio />}
                      label="TARS completed"
                    />
                    <FormControlLabel
                      value="untouched"
                      control={<Radio />}
                      label="Untouched - TARS not needed"
                    />
                  </RadioGroup>
                </FormControl>

                {bulkReturnDispositionType === 'untouched' ?
                  <TextField
                    select
                    label="Reason"
                    value={bulkReturnReason}
                    onChange={(e) => setBulkReturnReason(e.target.value as RestorationUntouchedReason)}
                    fullWidth
                  >
                    {UNTOUCHED_REASON_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </TextField>
                : <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    <TextField
                      select
                      label="Achieved scale"
                      value={bulkReturnScale}
                      onChange={(e) => {
                        setBulkReturnScale(e.target.value);
                        setBulkReturnGrade('');
                      }}
                      fullWidth
                    >
                      {Object.keys(gradeScales).map((scale) => (
                        <MenuItem key={scale} value={scale}>
                          {scale}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="Achieved grade"
                      value={bulkReturnGrade}
                      onChange={(e) => setBulkReturnGrade(e.target.value)}
                      fullWidth
                      disabled={!bulkReturnScale}
                    >
                      {bulkReturnGrades.map((grade) => (
                        <MenuItem key={grade} value={grade}>
                          {grade}
                        </MenuItem>
                      ))}
                    </TextField>
                        </Stack>
                }

                <TextField
                  label="Notes"
                  value={bulkReturnNotes}
                  onChange={(e) => setBulkReturnNotes(e.target.value)}
                  multiline
                  minRows={3}
                fullWidth
                  placeholder="Add details for Processing..."
                />
              </>
            : null}

            {bulkAction && bulkAction !== 'return' ?
              <Typography variant="caption" color="text.secondary">
                Choose Yes to continue, or Cancel to leave the selected stacks unchanged.
              </Typography>
            : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeBulkAction} disabled={bulkActionPending}>
            Cancel
          </Button>
          <Button
                variant="contained"
            color={bulkAction === 'clear' || bulkAction === 'return' ? 'warning' : 'primary'}
            disabled={bulkConfirmDisabled}
            onClick={() => void handleBulkConfirm()}
          >
            Yes, continue
              </Button>
        </DialogActions>
      </Dialog>

      <TarsSplitDialog
        open={splitDialogOpen}
        job={splitDialogJob ?? activeJob}
        pending={splitJob.isPending}
        onClose={() => {
          setSplitDialogOpen(false);
          setSplitDialogJob(null);
        }}
        onSplit={handleSplit}
      />

      <TarsAlreadyInQueueDialog
        open={alreadyInQueueDialog != null}
        sku={alreadyInQueueDialog?.sku ?? ''}
        stackQuantity={alreadyInQueueDialog?.stackQuantity ?? 1}
        removePending={splitJob.isPending}
        onClose={() => setAlreadyInQueueDialog(null)}
        onRemoveFromStack={
          alreadyInQueueDialog && alreadyInQueueDialog.stackQuantity > 1 ?
            handleRemoveFromStack
          : undefined
        }
      />

      <TarsItemBlockedDialog
        open={blockedDialog != null}
        sku={blockedDialog?.sku ?? ''}
        location={blockedDialog?.location ?? 'on_bench'}
        onClose={() => setBlockedDialog(null)}
        onGoTo={handleGoToBlocked}
      />

      <TarsScanMessageDialog
        open={scanMessageDialog != null}
        title={scanMessageDialog?.title ?? ''}
        message={scanMessageDialog?.message ?? ''}
        onClose={() => setScanMessageDialog(null)}
      />

      <TarsNeedsPricesDialog
        open={needsPricesDialog != null}
        sku={needsPricesDialog?.sku ?? ''}
        onClose={() => setNeedsPricesDialog(null)}
      />
    </Box>
  );
}
