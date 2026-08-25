import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';

import { useSnackbar } from 'notistack';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { RequestsDrawerHost } from '../../../components/enhancements/RequestsDrawer';
import { useAuth } from '../../../hooks/useAuth';

import {
  useCheckInRestorationJob,
  useCompleteRestorationJob,
  useRejectRestorationJob,
  useMoveRestorationJobBackToQueue,
  usePatchRestorationJobWorkSession,
  useRestorationScoreboard,
  useRestorationActions,
  useDescribeRestorationAction,
  useStartRestorationAction,
  useUndoRestorationAction,
  useDeleteRestorationAction,
  useTarsBenchJobs,
  useRestorationParts,
  useRestorationPartsOrders,
  useCreateRestorationPart,
  useUpdateRestorationPart,
  useDeleteRestorationPart,
  useCreateRestorationPartsOrder,
  useUpdateRestorationPartsOrder,
  useRequestRestorationPartsOrder,
  useReceiveRestorationPartsOrder,
  useInspectRestorationPartsOrder,
  useWithdrawRestorationPartsOrder,
  useRequestCancelRestorationPartsOrder,
  useDropQueueRestorationPartsOrder,
  useCancelRestorationPartsOrder,
  useHoldRestorationJob,
  useRestorationJobTimeline,
  useForgetRestorationTimelineWords,
  useResetRestorationQueueNote,
} from '../../../hooks/useRestorationBench';
import { useGradeScales } from '../../../hooks/useGradeScales';
import type {
  RestorationActionCategory,
  RestorationJobDTO,
  RestorationPartDTO,
  RestorationPartsOrderDTO,
  RestorationPartsLineInspectPayload,
  RestorationPartsOrderWritePayload,
} from '../../../types/inventory.types';
import { TarsSendBackDialog } from './TarsSendBackDialog';
import { categoryChangeStartsNewSitting, fileCurrentActionPlan } from './tarsActions';
import { TARS_DEFAULT_HOURLY_RATE, TARS_DEFAULT_TIME_PREMIUM } from './tarsConstants';
import { TarsDoneDialog } from './TarsDoneDialog';
import { TarsRejectDialog } from './TarsRejectDialog';
import { TarsScanMessageDialog } from './TarsScanMessageDialog';
import { TarsHoldDialog } from './TarsHoldDialog';
import { TarsActionHistory } from './TarsActionHistory';
import { TarsBenchConsole } from './TarsBenchConsole';
import { TarsPurchaseDesk } from './TarsPartsListPanel';
import {
  TarsStudioShell,
  type StudioLane,
} from './studio/TarsStudioShell';
import { TarsDashboardShell } from './studio/TarsDashboardShell';
import {
  RESTORATION_OVERVIEW_PATH,
  restorationOverviewAddPath,
  restorationOverviewPath,
} from '../restorationRoutes';
import {
  decideBenchScan,
  fetchRestorationScanLookup,
  isOccupiedBenchError,
  shouldPickupOnScan,
} from '../restorationScanFind';
import {
  StudioNoticeButton,
  StudioNoticeDrawer,
  type StudioNotice,
} from './studio/StudioNotices';
import { TarsHome } from './TarsHome';
import { TarsGradeTable } from './TarsGradeTable';
import { BENCH_SPLIT_COLUMNS, BENCH_SPLIT_GAP } from './tarsBenchLayout';
import { bestRemainingGrade } from './tarsBenchValue';
import { currentGradeOf, readBenchPlan, withLowestValueStart, type TarsBenchPlan } from './tarsBenchPlan';
import {
  FINISH_BLOCKED_MESSAGE,
  isOpenPartsOrder,
  partsRangeByGrade,
  spentPartsCost,
  summarizePartsList,
} from './tarsPartsOrders';
import { studio } from './studio/tarsStudioTheme';

import { isForeignBench, myActiveBenchRestorationJob, restorationJobToTarsItem, tarsJobRowKey } from './tarsJobAdapter';
import { benchOwnerGivenName } from '../queue/restorationQueueModel';
import { useWorkSessionDraft } from './useWorkSessionDraft';

import { evaluateWorkSession } from './tarsWorkRollup';

import type { TarsWorkSession } from './tarsWorkTypes';
import type { TarsHoldSubmit } from './TarsHoldDialog';

export type TarsWorkstationNavState = {
  selectJobId?: number;
};

function timeValue(iso: string | null | undefined): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : 0;
}

function benchSortValue(job: RestorationJobDTO): number {
  return timeValue(job.bench_started_at ?? job.sent_at ?? job.created_at);
}

/** TARS workstation - backend-backed evaluation + action log. */

function actionErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function TarsWorkstation({ chrome = 'studio' }: { chrome?: 'studio' | 'dashboard' } = {}) {
  const isDashboard = chrome === 'dashboard';
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const currentUserId = user?.id;
  const isSuperuser = Boolean(user?.is_superuser);
  const { data: jobs = [], isLoading, refetch } = useTarsBenchJobs();
  const { scales: gradeScales } = useGradeScales();
  const scoreboard = useRestorationScoreboard();

  const checkIn = useCheckInRestorationJob();
  const moveBack = useMoveRestorationJobBackToQueue();
  const holdJob = useHoldRestorationJob();
  const completeJob = useCompleteRestorationJob();
  const rejectJob = useRejectRestorationJob();
  const patchWorkSession = usePatchRestorationJobWorkSession();
  const createPart = useCreateRestorationPart();
  const updatePart = useUpdateRestorationPart();
  const deletePart = useDeleteRestorationPart();
  const createOrder = useCreateRestorationPartsOrder();
  const updateOrder = useUpdateRestorationPartsOrder();
  const requestOrder = useRequestRestorationPartsOrder();
  const receiveOrder = useReceiveRestorationPartsOrder();
  const inspectOrder = useInspectRestorationPartsOrder();
  const withdrawOrder = useWithdrawRestorationPartsOrder();
  const requestCancel = useRequestCancelRestorationPartsOrder();
  const dropQueue = useDropQueueRestorationPartsOrder();
  const cancelOrder = useCancelRestorationPartsOrder();

  const location = useLocation();
  const navState = location.state as TarsWorkstationNavState | null;
  const [searchParams, setSearchParams] = useSearchParams();
  const queryJobId = Number(searchParams.get('job')) || null;
  const queryView = searchParams.get('view');

  const [benchScanInput, setBenchScanInput] = useState('');
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [scanMessageDialog, setScanMessageDialog] = useState<{ title: string; message: string } | null>(null);
  // Home unless asked for otherwise. An active bench item pulls the view to
  // Bench a moment later; with nothing in progress, Home is the useful landing.
  // Dashboard chrome is the bench page itself — it never hosts Home.
  const [studioLane, setStudioLane] = useState<StudioLane>(
    chrome === 'dashboard' || queryView === 'bench' ? 'bench' : 'home',
  );
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [holdSuggest, setHoldSuggest] = useState<string | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const appliedInitialSelectionRef = useRef(false);

  const focusScanInput = useCallback(() => {
    requestAnimationFrame(() => scanInputRef.current?.focus());
  }, []);

  const setStudioLocation = useCallback(
    (lane: StudioLane, jobId?: number | null) => {
      if (chrome === 'dashboard') {
        if (lane === 'home') {
          navigate(RESTORATION_OVERVIEW_PATH);
          return;
        }
        setStudioLane('bench');
        const next = new URLSearchParams();
        if (jobId != null) next.set('job', String(jobId));
        setSearchParams(next, { replace: true });
        return;
      }
      setStudioLane(lane);
      const next = new URLSearchParams();
      next.set('view', lane);
      if (jobId != null) next.set('job', String(jobId));
      setSearchParams(next, { replace: true });
    },
    [chrome, navigate, setSearchParams],
  );

  const handleBackToDashboard = useCallback(() => {
    // Script-opened tabs can close even when `noopener` intentionally hides
    // window.opener. Direct/bookmarked tabs reject close, then use the fallback.
    window.close();
    window.setTimeout(() => {
      if (!window.closed) navigate('/dashboard');
    }, 50);
  }, [navigate]);

  const queueJobs = useMemo(
    () => jobs.filter((j) => j.stage === 'queued' || j.stage === 'sent'),
    [jobs],
  );

  const benchJobs = useMemo(() => {
    const bench = jobs.filter((j) => j.stage === 'bench');
    return [...bench].sort((a, b) => benchSortValue(b) - benchSortValue(a));
  }, [jobs]);
  const myBenchJobs = useMemo(
    () => benchJobs.filter((job) => job.bench_owner_id === currentUserId),
    [benchJobs, currentUserId],
  );
  const ambiguousBenchJobs = useMemo(
    () => myBenchJobs.filter((job) => (
      job.bench_ownership_ambiguous
      ?? (job.stage === 'bench' && job.bench_owner_id == null)
    )),
    [myBenchJobs],
  );

  const pendingJobs = useMemo(() => jobs.filter((j) => j.stage === 'pending'), [jobs]);

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const selectedJob = useMemo(
    () => (selectedRowKey != null ? jobs.find((j) => tarsJobRowKey(j) === selectedRowKey) ?? null : null),
    [jobs, selectedRowKey],
  );

  const displayJob = selectedJob;
  const foreignBench = isForeignBench(displayJob, currentUserId);
  const jobPartsQuery = useRestorationParts(displayJob?.id ?? null);
  const jobOrdersQuery = useRestorationPartsOrders({
    job: displayJob?.id ?? null,
    enabled: displayJob != null,
  });
  const jobParts = jobPartsQuery.data ?? [];
  const jobOrders = jobOrdersQuery.data ?? [];

  const persistWorkSession = useCallback(
    async (jobId: number, session: TarsWorkSession) => {
      const job = jobById.get(jobId);
      if (!job) return;

      try {
        await patchWorkSession.mutateAsync({
          id: jobId,
          workSession: session as unknown as Record<string, unknown>,
        });
      } catch (err) {
        enqueueSnackbar(err instanceof Error ? err.message : 'Failed to save work session', {
          variant: 'error',
        });
        // Rethrow so callers (draft hook, action flows) know the save failed.
        throw err;
      }
    },
    [jobById, patchWorkSession, enqueueSnackbar],
  );

  const {
    session: draftWorkSession,
    replaceSession: replaceWorkSession,
    flushSave: flushWorkSessionSave,
  } = useWorkSessionDraft(displayJob, persistWorkSession);

  const displayItem = useMemo(() => {
    if (!displayJob) return null;
    const base = restorationJobToTarsItem(displayJob);
    if (!draftWorkSession) return base;
    return { ...base, workSession: draftWorkSession };
  }, [displayJob, draftWorkSession]);

  // What is being done to the item on the bench, and what already has been.
  const actions = useRestorationActions(displayJob?.id ?? null);
  const timeline = useRestorationJobTimeline(displayJob?.id ?? null);
  const describeAction = useDescribeRestorationAction();
  const startAction = useStartRestorationAction();
  const undoAction = useUndoRestorationAction();
  const deleteAction = useDeleteRestorationAction();
  const forgetWords = useForgetRestorationTimelineWords();
  const resetNote = useResetRestorationQueueNote();

  const evaluation = useMemo(() => {
    if (!displayItem) return null;
    return evaluateWorkSession(
      displayItem,
      displayItem.workSession,
      TARS_DEFAULT_HOURLY_RATE,
      TARS_DEFAULT_TIME_PREMIUM,
      gradeScales,
    );
  }, [displayItem, gradeScales]);

  const gradeOptions = useMemo(
    () => evaluation?.directions.map((d) => d.grade) ?? [],
    [evaluation],
  );

  useEffect(() => {
    if (isLoading || authLoading) return;
    if (appliedInitialSelectionRef.current) return;
    if (isDashboard && searchParams.get('pickup') === '1') return;

    const requestedJobId = queryJobId ?? navState?.selectJobId ?? null;
    if (requestedJobId) {
      const match = jobs.find((j) => j.id === requestedJobId);
      if (navState?.selectJobId) navigate(location.pathname + location.search, { replace: true, state: {} });
      if (match) {
        setSelectedRowKey(tarsJobRowKey(match));
        if (isDashboard) {
          setStudioLocation('bench', match.id);
        } else {
          setStudioLocation(match.stage === 'bench' ? 'bench' : 'home', match.id);
        }
        appliedInitialSelectionRef.current = true;
        focusScanInput();
        return;
      }
      // No matching job - fall through to normal selection.
    }

    const active = myActiveBenchRestorationJob(myBenchJobs, currentUserId);
    if (active) {
      setSelectedRowKey(tarsJobRowKey(active));
      setStudioLocation('bench', active.id);
    } else if (isDashboard) {
      setStudioLane('bench');
    } else if (queryView === 'home' || queryView === 'bench') {
      setStudioLane(queryView);
    }
    appliedInitialSelectionRef.current = true;
    focusScanInput();
  }, [
    isLoading,
    authLoading,
    isDashboard,
    jobs,
    myBenchJobs,
    navState?.selectJobId,
    queryJobId,
    queryView,
    searchParams,
    focusScanInput,
    currentUserId,
    navigate,
    location.pathname,
    location.search,
    setStudioLocation,
  ]);

  const handleCheckIn = useCallback(
    async (job: RestorationJobDTO) => {
      try {
        const itemId = job.items[0]?.id;
        const updated = await checkIn.mutateAsync({ id: job.id, itemId });
        setSelectedRowKey(tarsJobRowKey(updated));
        setStudioLocation('bench', updated.id);
        setBenchScanInput('');
        focusScanInput();
      } catch (err) {
        if (isOccupiedBenchError(err)) {
          navigate(restorationOverviewPath(job.id));
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Could not check in to the bench.';
        const refreshed = await refetch();
        const active = myActiveBenchRestorationJob(refreshed.data ?? [], currentUserId);
        if (active) {
          setSelectedRowKey(tarsJobRowKey(active));
          setStudioLocation('bench', active.id);
        }
        setScanMessageDialog({
          title: 'Check-in failed',
          message,
        });
      }
    },
    [checkIn, currentUserId, focusScanInput, navigate, refetch, setStudioLocation],
  );

  const pickupAttemptedRef = useRef(false);
  useEffect(() => {
    if (!isDashboard) return;
    if (pickupAttemptedRef.current) return;
    if (isLoading || authLoading) return;
    if (searchParams.get('pickup') !== '1' || !queryJobId) return;
    const match = jobs.find((j) => j.id === queryJobId);
    pickupAttemptedRef.current = true;
    appliedInitialSelectionRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('pickup');
    setSearchParams(next, { replace: true });
    if (!match) return;
    if (match.stage === 'bench') {
      setSelectedRowKey(tarsJobRowKey(match));
      return;
    }
    void handleCheckIn(match);
  }, [
    isDashboard,
    isLoading,
    authLoading,
    searchParams,
    queryJobId,
    jobs,
    handleCheckIn,
    setSearchParams,
  ]);

  const submitBenchScan = useCallback(async () => {
    const v = benchScanInput.trim();
    if (!v) return;
    setBenchScanInput('');

    const mine = myActiveBenchRestorationJob(myBenchJobs, currentUserId);
    const decision = decideBenchScan(v, mine, jobs);
    if (decision.action === 'pickup') {
      void handleCheckIn(decision.job);
      return;
    }
    if (decision.action === 'stay') {
      setSelectedRowKey(tarsJobRowKey(decision.job));
      setStudioLocation('bench', decision.job.id);
      setScanMessageDialog({
        title: 'Already on bench',
        message: `Item ${decision.job.sku ?? v.toUpperCase()} is already on the bench and has been selected.`,
      });
      return;
    }
    if (decision.action === 'overview') {
      navigate(restorationOverviewPath(decision.jobId));
      return;
    }

    const looked = await fetchRestorationScanLookup(v);
    if (looked.found === 'job' && looked.job) {
      if (looked.job.stage === 'bench') {
        setSelectedRowKey(tarsJobRowKey(looked.job));
        setStudioLocation('bench', looked.job.id);
        return;
      }
      if (shouldPickupOnScan(looked.job, mine == null)) {
        void handleCheckIn(looked.job);
        return;
      }
      navigate(restorationOverviewPath(looked.job.id));
      return;
    }
    if (looked.found === 'item' && looked.item) {
      navigate(restorationOverviewAddPath(looked.item.sku));
      return;
    }
    setScanMessageDialog({
      title: 'No matching item',
      message: `${v.toUpperCase()} is not in restoration and no catalog item was found for that SKU.`,
    });
  }, [
    benchScanInput,
    currentUserId,
    handleCheckIn,
    jobs,
    myBenchJobs,
    navigate,
    setStudioLocation,
  ]);

  const partsBusy = deletePart.isPending || cancelOrder.isPending || inspectOrder.isPending;

  const handleCreatePart = useCallback(
    () => {
      if (!displayJob) return;
      createPart.mutate(
        { job: displayJob.id, category: 'parts', description: '', qty: 1, unit_price: 0 },
        {
          onError: (err) =>
            enqueueSnackbar(actionErrorMessage(err, 'Could not add that part'), { variant: 'error' }),
        },
      );
    },
    [displayJob, createPart, enqueueSnackbar],
  );

  const handleUpdatePart = useCallback(
    (id: number, patch: Partial<Pick<RestorationPartDTO, 'description' | 'url' | 'qty' | 'unit_price' | 'category'>>) => {
      updatePart.mutate(
        { id, payload: patch },
        {
          onError: (err) =>
            enqueueSnackbar(actionErrorMessage(err, 'Could not save that part'), { variant: 'error' }),
        },
      );
    },
    [updatePart, enqueueSnackbar],
  );

  const handleDeletePart = useCallback(
    (id: number) => {
      if (!displayJob) return;
      deletePart.mutate(
        { id, jobId: displayJob.id },
        {
          onError: (err) =>
            enqueueSnackbar(actionErrorMessage(err, 'Could not remove that part'), { variant: 'error' }),
        },
      );
    },
    [displayJob, deletePart, enqueueSnackbar],
  );

  const handleSaveOrder = useCallback(
    (payload: RestorationPartsOrderWritePayload, existingId?: number) => {
      if (!displayJob) return;
      if (existingId) {
        updateOrder.mutate(
          { id: existingId, payload },
          {
            onError: (err) =>
              enqueueSnackbar(actionErrorMessage(err, 'Could not save that order'), { variant: 'error' }),
          },
        );
        return;
      }
      createOrder.mutate(
        { ...payload, job: displayJob.id, name: payload.name || 'Order' },
        {
          onError: (err) =>
            enqueueSnackbar(actionErrorMessage(err, 'Could not create that order'), { variant: 'error' }),
        },
      );
    },
    [displayJob, createOrder, updateOrder, enqueueSnackbar],
  );

  const handleCancelOrder = useCallback(
    (id: number) => {
      cancelOrder.mutate(id, {
        onError: (err) =>
          enqueueSnackbar(actionErrorMessage(err, 'Could not cancel that order'), { variant: 'error' }),
      });
    },
    [cancelOrder, enqueueSnackbar],
  );

  const handleRequestOrder = useCallback(
    (order: RestorationPartsOrderDTO) => {
      const fallback =
        order.target_grade.trim() ||
        currentGradeOf(readBenchPlan(draftWorkSession)) ||
        gradeOptions[0] ||
        '';
      if (!fallback) {
        enqueueSnackbar('Say which grade this order would achieve.', { variant: 'error' });
        return;
      }
      requestOrder.mutate(
        {
          id: order.id,
          jobId: order.job,
          target_grade: fallback,
        },
        {
          onSuccess: () => {
            enqueueSnackbar(`Requested ${order.name}`, { variant: 'success' });
            setHoldSuggest(order.name);
          },
          onError: (err) =>
            enqueueSnackbar(actionErrorMessage(err, 'Could not request that order'), { variant: 'error' }),
        },
      );
    },
    [draftWorkSession, gradeOptions, requestOrder, enqueueSnackbar],
  );

  const handleWithdrawOrder = useCallback(
    (id: number) => {
      withdrawOrder.mutate(id, {
        onSuccess: (order) => enqueueSnackbar(`Cancelled the request for ${order.name}`, { variant: 'info' }),
        onError: (err) =>
          enqueueSnackbar(actionErrorMessage(err, 'Could not cancel that request'), { variant: 'error' }),
      });
    },
    [withdrawOrder, enqueueSnackbar],
  );

  const handleRequestCancel = useCallback(
    (blockingId: number, replacementId?: number) => {
      requestCancel.mutate(
        { id: blockingId, replacement_id: replacementId },
        {
          onSuccess: (order) =>
            enqueueSnackbar(`Asked to cancel ${order.name}`, { variant: 'info' }),
          onError: (err) =>
            enqueueSnackbar(actionErrorMessage(err, 'Could not ask for a cancel'), { variant: 'error' }),
        },
      );
    },
    [requestCancel, enqueueSnackbar],
  );

  const handleReceiveOrder = useCallback(
    (order: RestorationPartsOrderDTO) => {
      receiveOrder.mutate(order.id, {
        onSuccess: () => enqueueSnackbar(`Marked ${order.name} received`, { variant: 'success' }),
        onError: (err) =>
          enqueueSnackbar(actionErrorMessage(err, 'Could not mark that received'), { variant: 'error' }),
      });
    },
    [receiveOrder, enqueueSnackbar],
  );

  const handleInspectOrder = useCallback(
    (order: RestorationPartsOrderDTO, lines: RestorationPartsLineInspectPayload[]) => {
      inspectOrder.mutate(
        { id: order.id, lines },
        {
          onSuccess: () => enqueueSnackbar(`Inspected ${order.name}`, { variant: 'success' }),
          onError: (err) =>
            enqueueSnackbar(actionErrorMessage(err, 'Could not inspect that order'), { variant: 'error' }),
        },
      );
    },
    [inspectOrder, enqueueSnackbar],
  );

  const handleDropQueue = useCallback(
    (id: number) => {
      dropQueue.mutate(id, {
        onSuccess: (order) => enqueueSnackbar(`Dropped ${order.name} from the queue`, { variant: 'info' }),
        onError: (err) =>
          enqueueSnackbar(actionErrorMessage(err, 'Could not drop that order'), { variant: 'error' }),
      });
    },
    [dropQueue, enqueueSnackbar],
  );

  const handleSendBack = async ({ note, reason }: { note: string; reason?: string }) => {
    if (!selectedJob) return;
    try {
      await flushWorkSessionSave();
      await moveBack.mutateAsync({ id: selectedJob.id, note, reason });
      setSendBackOpen(false);
      setSelectedRowKey(null);
      setStudioLocation('home');
      enqueueSnackbar('Sent back to the queue', { variant: 'info' });
      focusScanInput();
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Move back failed', { variant: 'error' });
    }
  };

  /** Wrong row. Delete the action. */
  const handleUndoAction = useCallback(() => {
    if (!displayJob) return;
    undoAction.mutate(displayJob.id, {
      onError: (err) =>
        enqueueSnackbar(err instanceof Error ? err.message : 'Could not undo that', {
          variant: 'warning',
        }),
    });
  }, [displayJob, undoAction, enqueueSnackbar]);

  /** Drop a row from the log. */
  const handleDeleteAction = useCallback(
    (actionId: number) => {
      if (!displayJob) return;
      deleteAction.mutate(
        { id: displayJob.id, actionId },
        {
          onError: (err) =>
            enqueueSnackbar(err instanceof Error ? err.message : 'Could not delete that row', {
              variant: 'warning',
            }),
        },
      );
    },
    [displayJob, deleteAction, enqueueSnackbar],
  );

  const handleForgetWords = useCallback(
    (eventId: number) => {
      if (!displayJob) return;
      forgetWords.mutate(
        { jobId: displayJob.id, eventId },
        {
          onError: (err) =>
            enqueueSnackbar(err instanceof Error ? err.message : 'Could not clear that', {
              variant: 'warning',
            }),
        },
      );
    },
    [displayJob, forgetWords, enqueueSnackbar],
  );

  const handleResetNote = useCallback(
    (eventId: number) => {
      if (!displayJob) return;
      resetNote.mutate(
        { jobId: displayJob.id, eventId },
        {
          onError: (err) =>
            enqueueSnackbar(err instanceof Error ? err.message : 'Could not reset that note', {
              variant: 'warning',
            }),
        },
      );
    },
    [displayJob, resetNote, enqueueSnackbar],
  );

  const handleHoldSubmit = async (info: TarsHoldSubmit) => {
    if (!selectedJob) return;

    try {
      await flushWorkSessionSave();
      await holdJob.mutateAsync({
        id: selectedJob.id,
        payload: {
          wait_for: info.waitFor,
          storage_location: info.storageLocation,
        },
      });

      setHoldOpen(false);
      enqueueSnackbar('Item placed on hold', { variant: 'info' });
      setStudioLocation('home', selectedJob.id);
      focusScanInput();
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Hold failed', { variant: 'error' });
    }
  };

  const handleDoneSubmit = (payload: Parameters<typeof completeJob.mutateAsync>[0]['payload']) => {
    if (!selectedJob) return;
    const jobId = selectedJob.id;
    setSelectedRowKey(null);
    setDoneOpen(false);
    setStudioLocation('home');
    enqueueSnackbar('Sent to Done — waiting for Processing to check it in', { variant: 'success' });
    focusScanInput();
    void flushWorkSessionSave();
    completeJob.mutate(
      { id: jobId, payload },
      {
        onError: (err) => enqueueSnackbar(actionErrorMessage(err, 'Done failed'), { variant: 'error' }),
      },
    );
  };

  const handleRejectSubmit = async (reason: string) => {
    if (!selectedJob) return;
    try {
      await rejectJob.mutateAsync({ id: selectedJob.id, reason });
      setSelectedRowKey(null);
      setRejectOpen(false);
      setStudioLocation('home');
      enqueueSnackbar('Rejected — sent to Processing', { variant: 'info' });
      focusScanInput();
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Reject failed', { variant: 'error' });
    }
  };

  const closeScanMessageDialog = useCallback(() => {
    setScanMessageDialog(null);
    focusScanInput();
  }, [focusScanInput]);

  const closeDoneDialog = useCallback(() => {
    setDoneOpen(false);
    focusScanInput();
  }, [focusScanInput]);

  const closeHoldDialog = useCallback(() => {
    setHoldOpen(false);
    focusScanInput();
  }, [focusScanInput]);

  /**
   * With nothing in hand, scanning is the only thing to do next, so the cursor
   * waits there. Once an item is on the bench the field is gone from the header
   * and the focus belongs to the work.
   */
  const benchIsClear = myActiveBenchRestorationJob(myBenchJobs, currentUserId) == null;
  useEffect(() => {
    if (studioLane !== 'home' || !benchIsClear) return;
    focusScanInput();
  }, [studioLane, benchIsClear, focusScanInput]);

  const handleLaneChange = useCallback((lane: StudioLane) => {
    if (lane === 'bench') {
      const active = myActiveBenchRestorationJob(myBenchJobs, currentUserId);
      setSelectedRowKey(active ? tarsJobRowKey(active) : null);
      setStudioLocation('bench', active?.id);
      return;
    }
    setSelectedRowKey(null);
    setStudioLocation(lane);
  }, [myBenchJobs, currentUserId, setStudioLocation]);

  /** Bring a held item back to the bench and pick up where it stopped. */
  const handleResumeHeld = useCallback(
    (job: RestorationJobDTO) => {
      void handleCheckIn(job);
    },
    [handleCheckIn],
  );

  useEffect(() => {
    if (isDashboard) return;
    if (!selectedJob) return;
    setStudioLane(selectedJob.stage === 'bench' ? 'bench' : 'home');
  }, [isDashboard, selectedJob?.id, selectedJob?.stage]);

  const studioCounts = {
    home: queueJobs.length + pendingJobs.length,
    bench: myBenchJobs.length,
  };

  const benchPlan = useMemo(() => {
    const raw = readBenchPlan(draftWorkSession);
    if (!displayJob) return raw;
    return withLowestValueStart(raw, displayJob, gradeScales[displayJob.scale] ?? []);
  }, [draftWorkSession, displayJob, gradeScales]);

  /**
   * Conditions worth knowing about, collected rather than mounted. Nothing here
   * is allowed to push the work surface around, so it all reads from a badge.
   */
  const notices = useMemo<StudioNotice[]>(() => {
    const list: StudioNotice[] = [];
    if (ambiguousBenchJobs.length > 0) {
      list.push({
        id: 'ownership',
        tone: 'error',
        title: `${ambiguousBenchJobs.length} bench item${ambiguousBenchJobs.length === 1 ? '' : 's'} with unclear ownership`,
        detail: 'Left over from an earlier version. Move them back to the queue or finish them before claiming another.',
      });
    }
    if (foreignBench && displayJob) {
      const whose = benchOwnerGivenName(displayJob.bench_owner_name) || 'another technician';
      list.push({
        id: 'foreign-bench',
        tone: isSuperuser ? 'info' : 'warning',
        title: `This is ${whose}'s bench`,
        detail: isSuperuser
          ? 'You can work any bench.'
          : 'You can still work it. Tell them if you are taking over.',
      });
    }
    const unpriced = queueJobs.filter((j) => !j.scale).length;
    if (unpriced > 0) {
      list.push({
        id: 'unpriced',
        tone: 'info',
        title: `${unpriced} queued item${unpriced === 1 ? '' : 's'} without a grade scale`,
        detail: 'They cannot go on a bench until someone prices their grades. Open Details on the card to add them.',
      });
    }
    const openOrders = jobOrders.filter(isOpenPartsOrder);
    if (openOrders.length > 0) {
      list.push({
        id: 'open-parts-orders',
        tone: 'warning',
        title: 'Parts are on order',
        detail: FINISH_BLOCKED_MESSAGE,
      });
    }
    return list;
  }, [ambiguousBenchJobs.length, queueJobs, foreignBench, displayJob, jobOrders, isSuperuser]);

  const liveJob = useMemo(() => {
    if (!displayJob) return null;
    return {
      ...displayJob,
      work_session: (draftWorkSession ?? displayJob.work_session) as RestorationJobDTO['work_session'],
    };
  }, [displayJob, draftWorkSession]);

  const updateBenchPlan = useCallback(
    (plan: TarsBenchPlan) => {
      if (!draftWorkSession) return;
      replaceWorkSession({ ...draftWorkSession, benchPlan: plan });
    },
    [draftWorkSession, replaceWorkSession],
  );

  useEffect(() => {
    if (!displayJob || !draftWorkSession) return;
    const raw = readBenchPlan(draftWorkSession);
    if (raw.startingGrade || raw.currentGrade) return;
    if (!benchPlan.startingGrade) return;
    updateBenchPlan(benchPlan);
  }, [displayJob, draftWorkSession, benchPlan, updateBenchPlan]);

  const handleDescribeAction = useCallback(
    (actionId: number, patch: { description?: string; category?: RestorationActionCategory }) => {
      if (!displayJob) return;
      describeAction.mutate(
        { id: displayJob.id, payload: { action_id: actionId, ...patch } },
        {
          onError: (err) =>
            enqueueSnackbar(actionErrorMessage(err, 'Could not save that'), {
              variant: 'error',
            }),
        },
      );
    },
    [displayJob, describeAction, enqueueSnackbar],
  );

  const handleEnterAction = useCallback(
    async (description: string) => {
      if (!displayJob) return;
      const current =
        actions.data?.results.find((row) => row.id === actions.data?.current_action_id) ?? null;
      if (!current) return;
      const plan = fileCurrentActionPlan(current, description);
      try {
        if (plan.describe != null) {
          await describeAction.mutateAsync({
            id: displayJob.id,
            payload: { action_id: current.id, description: plan.describe },
          });
        }
        if (plan.blockedReason) {
          enqueueSnackbar(plan.blockedReason, { variant: 'warning' });
          return;
        }
        if (plan.startNext) {
          await startAction.mutateAsync({ id: displayJob.id, payload: { force_new: true } });
        }
      } catch (err) {
        enqueueSnackbar(actionErrorMessage(err, 'Could not save that'), { variant: 'error' });
      }
    },
    [displayJob, actions.data, describeAction, startAction, enqueueSnackbar],
  );

  const handleChangeActionCategory = useCallback(
    (category: RestorationActionCategory) => {
      if (!displayJob) return;
      const current =
        actions.data?.results.find((row) => row.id === actions.data?.current_action_id) ?? null;
      if (!current) return;
      if (categoryChangeStartsNewSitting(current, category)) {
        startAction.mutate(
          { id: displayJob.id, payload: { force_new: true, category } },
          {
            onError: (err) =>
              enqueueSnackbar(actionErrorMessage(err, 'Could not start that'), {
                variant: 'error',
              }),
          },
        );
        return;
      }
      handleDescribeAction(current.id, { category });
    },
    [displayJob, actions.data, startAction, handleDescribeAction, enqueueSnackbar],
  );

  const floorRate = TARS_DEFAULT_HOURLY_RATE;
  const benchmarkRate = null;

  const hasBenchJob = displayJob?.stage === 'bench';
  const partsRanges = partsRangeByGrade(jobOrders);
  const finishBlocked = jobOrders.some(isOpenPartsOrder);
  const remainingGrade = displayJob
    ? bestRemainingGrade(displayJob, benchPlan, gradeScales[displayJob.scale] ?? [])
    : null;
  const remainingParts = remainingGrade ? (partsRanges[remainingGrade]?.max ?? 0) : 0;
  const partsSummary = summarizePartsList(jobParts);

  const noticeSlot = (
    <StudioNoticeButton
      notices={notices}
      onOpen={() => setNoticesOpen(true)}
      tone={isDashboard ? 'light' : 'dark'}
    />
  );

  const benchConsole = hasBenchJob && liveJob ? (
    <TarsBenchConsole
      job={liveJob}
      plan={benchPlan}
      scaleGrades={gradeScales[liveJob.scale] ?? []}
      busy={holdJob.isPending || moveBack.isPending}
      notices={notices}
      onPlanChange={updateBenchPlan}
      onOpenNotices={() => setNoticesOpen(true)}
      onHold={() => {
        if (!displayJob || displayJob.stage !== 'bench') return;
        setHoldOpen(true);
      }}
      onSendBack={() => {
        if (!displayJob || displayJob.stage !== 'bench') return;
        setSendBackOpen(true);
      }}
      onReject={() => {
        if (!displayJob || displayJob.stage !== 'bench') return;
        setRejectOpen(true);
      }}
      spentParts={spentPartsCost(jobOrders)}
      remainingParts={remainingParts}
      finishBlocked={finishBlocked}
      onDone={() => {
        if (!displayJob || displayJob.stage !== 'bench') return;
        if (finishBlocked) {
          setScanMessageDialog({ title: 'Parts are on order', message: FINISH_BLOCKED_MESSAGE });
          return;
        }
        setDoneOpen(true);
      }}
    />
  ) : null;

  const benchBody = !hasBenchJob || !displayJob ? null : (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        p: { xs: 0.35, md: 0.4 },
        display: 'grid',
        gridTemplateColumns: BENCH_SPLIT_COLUMNS,
        gridTemplateRows: { xs: 'auto auto 1fr 1fr 1fr', lg: 'auto 1fr 1fr' },
        gap: { xs: 0.75, lg: BENCH_SPLIT_GAP },
      }}
    >
      {benchConsole}
        <Box sx={{ minWidth: 0, minHeight: 0, overflow: 'hidden', gridColumn: '1', gridRow: { xs: '3', lg: '2' } }}>
          <TarsGradeTable
            job={liveJob ?? displayJob}
            plan={benchPlan}
            scaleGrades={gradeScales[displayJob.scale] ?? []}
            floorRate={floorRate}
            benchmarkRate={benchmarkRate}
            partsRangeByGrade={partsRanges}
            onPlanChange={updateBenchPlan}
          />
        </Box>
        <Box sx={{ minWidth: 0, minHeight: 0, overflow: 'hidden', gridColumn: '1', gridRow: { xs: '4', lg: '3' } }}>
          <TarsPurchaseDesk
            jobId={displayJob?.id ?? null}
            parts={jobParts}
            orders={jobOrders}
            gradeOptions={gradeOptions}
            currentGrade={currentGradeOf(benchPlan)}
            gradeValues={displayJob?.grade_values ?? {}}
            plan={benchPlan}
            busy={partsBusy}
            onCreatePart={handleCreatePart}
            onUpdatePart={handleUpdatePart}
            onDeletePart={handleDeletePart}
            onSaveOrder={handleSaveOrder}
            onCancelOrder={handleCancelOrder}
            onRequestOrder={handleRequestOrder}
            onWithdrawOrder={handleWithdrawOrder}
            onRequestCancel={handleRequestCancel}
            onReceiveOrder={handleReceiveOrder}
            onInspectOrder={handleInspectOrder}
            onDropQueue={handleDropQueue}
          />
        </Box>
        <Box
          sx={{
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            gridColumn: { xs: '1', lg: '2' },
            gridRow: { xs: '5', lg: '2 / -1' },
          }}
        >
          <TarsActionHistory
            jobId={displayJob?.id ?? null}
            actions={actions.data}
            events={timeline.data ?? []}
            currentUserId={currentUserId}
            busy={
              describeAction.isPending ||
              startAction.isPending ||
              undoAction.isPending ||
              deleteAction.isPending ||
              forgetWords.isPending ||
              resetNote.isPending
            }
            onDescribe={handleDescribeAction}
            onEnter={handleEnterAction}
            onStartAction={() => {
              if (!displayJob) return;
              startAction.mutate(
                { id: displayJob.id, payload: { force_new: true } },
                {
                  onError: (err) =>
                    enqueueSnackbar(actionErrorMessage(err, 'Could not start that'), {
                      variant: 'error',
                    }),
                },
              );
            }}
            onChangeCategory={handleChangeActionCategory}
            onUndo={handleUndoAction}
            onDeleteAction={handleDeleteAction}
            onForgetWords={handleForgetWords}
            onResetNote={handleResetNote}
          />
        </Box>
    </Box>
  );

  if (isLoading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: studio.canvas }}>
        <CircularProgress size={36} sx={{ color: studio.accent }} />
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
      {isDashboard ? (
        <TarsDashboardShell
          title="Bench"
          subtitle="Scan on Overview, or open a priced row"
          hideHeader={hasBenchJob}
          noticeSlot={hasBenchJob ? undefined : noticeSlot}
        >
          {!hasBenchJob || !displayJob ? (
            <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 2, color: '#526177' }}>
              <Stack alignItems="center" spacing={1}>
                <Typography variant="h6" sx={{ color: '#172033', fontWeight: 950 }}>Bench is clear</Typography>
                <Typography variant="body2">Scan on Overview, or open a priced row.</Typography>
                <Button
                  variant="contained"
                  onClick={() => navigate(RESTORATION_OVERVIEW_PATH)}
                  sx={{ bgcolor: studio.accentDark }}
                >
                  Open Overview
                </Button>
              </Stack>
            </Box>
          ) : benchBody}
        </TarsDashboardShell>
      ) : (
      <TarsStudioShell
        lane={studioLane}
        onLaneChange={handleLaneChange}
        counts={studioCounts}
        scanValue={benchScanInput}
        onScanChange={setBenchScanInput}
        onScanSubmit={() => void submitBenchScan()}
        scanInputRef={scanInputRef}
        onBack={handleBackToDashboard}
        noticeSlot={studioLane === 'bench' && hasBenchJob ? null : noticeSlot}
      >
        {studioLane === 'home' ? (
          <TarsHome
            board={scoreboard.data}
            queueJobs={queueJobs}
            holdingJobs={pendingJobs}
            occupyingBenchJob={myActiveBenchRestorationJob(myBenchJobs, currentUserId)}
            busy={checkIn.isPending}
            onStart={(job) => void handleCheckIn(job)}
            onResume={handleResumeHeld}
          />
        ) : !displayJob || displayJob.stage !== 'bench' ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 2, color: '#526177' }}>
            <Stack alignItems="center" spacing={1}>
              <Typography variant="h6" sx={{ color: '#172033', fontWeight: 950 }}>Bench is clear</Typography>
              <Typography variant="body2">Scan an item, or pick one from Home.</Typography>
              <Button variant="contained" onClick={() => handleLaneChange('home')} sx={{ bgcolor: studio.accentDark }}>
                Open Home
              </Button>
            </Stack>
          </Box>
        ) : benchBody}
      </TarsStudioShell>
      )}

      <StudioNoticeDrawer open={noticesOpen} notices={notices} onClose={() => setNoticesOpen(false)} />

      <TarsSendBackDialog
        open={sendBackOpen}
        itemLabel={displayJob?.items[0]?.sku ?? displayJob?.sku ?? 'this item'}
        jobId={displayJob?.id ?? null}
        busy={moveBack.isPending}
        onCancel={() => setSendBackOpen(false)}
        onSubmit={(note) => void handleSendBack(note)}
      />

      <TarsRejectDialog
        open={rejectOpen}
        itemLabel={displayJob?.items[0]?.sku ?? displayJob?.sku ?? 'this item'}
        jobId={displayJob?.id ?? null}
        busy={rejectJob.isPending}
        onCancel={() => setRejectOpen(false)}
        onSubmit={(reason) => void handleRejectSubmit(reason)}
      />

      <TarsDoneDialog
        open={doneOpen}
        job={doneOpen ? selectedJob : null}
        evaluation={evaluation}
        session={displayItem?.workSession}
        partsCost={{
          parts: partsSummary.parts.cost,
          supplies: partsSummary.supplies.cost,
          ffe: partsSummary.ffe.cost,
        }}
        onClose={closeDoneDialog}
        onSubmit={(payload) => void handleDoneSubmit(payload)}
      />

      {selectedJob && (selectedJob.stage === 'bench' || selectedJob.stage === 'pending') ?
        <TarsHoldDialog
          open={holdOpen}
          title="Place on hold"
          itemLabel={displayJob?.items[0]?.sku ?? displayJob?.sku ?? 'this item'}
          jobId={selectedJob.id}
          itemId={displayJob?.items[0]?.id ?? null}
          initial={displayItem?.workSession?.pending}
          requesting={holdJob.isPending}
          onClose={closeHoldDialog}
          onSubmit={(info) => void handleHoldSubmit(info)}
        />
      : null}

      <TarsScanMessageDialog
        open={scanMessageDialog != null}
        title={scanMessageDialog?.title ?? ''}
        message={scanMessageDialog?.message ?? ''}
        onClose={closeScanMessageDialog}
      />

      <Dialog open={holdSuggest != null} onClose={() => setHoldSuggest(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Request sent</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {holdSuggest ? `${holdSuggest} is with the owner now.` : 'The order is with the owner now.'}
            {' '}Hold this item while parts are on the way? You can stay on the bench if you still have work.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button onClick={() => setHoldSuggest(null)}>Stay on bench</Button>
          <Button
            variant="contained"
            onClick={() => {
              setHoldSuggest(null);
              setHoldOpen(true);
            }}
          >
            Hold
          </Button>
        </DialogActions>
      </Dialog>
      <RequestsDrawerHost defaultArea="restoration" />
    </Box>
  );
}
