import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  Stack,
  Typography,
} from '@mui/material';

import { useSnackbar } from 'notistack';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../hooks/useAuth';

import {

  useCheckInRestorationJob,

  useCompleteRestorationJob,

  useMoveRestorationJobBackToQueue,

  usePatchRestorationJobWorkSession,

  usePauseRestorationJobTimer,

  useRestorationScoreboard,

  useRestorationActions,
  useStartRestorationAction,
  useDescribeRestorationAction,
  useUndoRestorationAction,
  ActionNeedsDescriptionError,

  useTarsBenchJobs,

  useUpsertRestorationPartsRequest,
  useHoldRestorationJob,
} from '../../../hooks/useRestorationBench';
import { useGradeScales } from '../../../hooks/useGradeScales';
import type {
  RestorationActionCategory,
  RestorationActionsDTO,
  RestorationJobDTO,
} from '../../../types/inventory.types';
import { TarsWorkPanel } from './TarsWorkPanel';
import { TarsBenchStatus } from './TarsBenchStatus';
import { TarsSendBackDialog } from './TarsSendBackDialog';
import { actionScopeLabel, blockingAction } from './tarsActions';
import { TARS_DEFAULT_HOURLY_RATE, TARS_DEFAULT_TIME_PREMIUM } from './tarsConstants';
import { TarsTimerSwitchDialog } from './TarsTimerSwitchDialog';
import { TarsDoneDialog } from './TarsDoneDialog';
import { TarsScanMessageDialog } from './TarsScanMessageDialog';
import { TarsHoldDialog } from './TarsHoldDialog';
import { TarsPartsListPanel } from './TarsPartsListPanel';
import { PARTS_DRAWER_WIDTH } from './tarsPartsListSession';
import {
  TarsStudioShell,
  type StudioLane,
} from './studio/TarsStudioShell';
import { TarsStudioTimerControl } from './studio/TarsStudioTimerControl';
import {
  StudioNoticeButton,
  StudioNoticeDrawer,
  type StudioNotice,
} from './studio/StudioNotices';
import { TarsHome } from './TarsHome';
import { TarsGradeTable } from './TarsGradeTable';
import { readBenchPlan, type TarsBenchPlan } from './tarsBenchPlan';
import { TarsActionLog } from './TarsActionLog';
import { TarsDispositionBar } from './TarsDispositionBar';
import { summarizeParts } from './tarsPartsSummary';
import { studio } from './studio/tarsStudioTheme';

import { jobMatchesScan, myActiveBenchRestorationJob, myRunningRestorationJob, restorationJobToTarsItem, tarsJobRowKey } from './tarsJobAdapter';
import { timerGuardKey, type TimerGuardAction } from './tarsTimerWarnings';
import { useWorkSessionDraft } from './useWorkSessionDraft';
import { useTarsTimerController } from './useTarsTimerController';

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

/**
 * The record of this item: what is being done, and what has been.
 *
 * Work leads because it is what someone is standing here to do, and it shows
 * one scope at a time — whichever row is selected in the grade table. The log
 * is the same actions across every scope, one line each, read when a question
 * comes up rather than while working.
 */
function BenchRecord({
  actions,
  running,
  busy,
  scope,
  onDescribe,
  onNewAction,
  onUndo,
}: {
  actions: RestorationActionsDTO | undefined;
  running: boolean;
  busy?: boolean;
  scope: string;
  onDescribe: (actionId: number, patch: { description?: string; category?: RestorationActionCategory }) => void;
  onNewAction: (grade: string) => void;
  onUndo: () => void;
}) {
  const [tab, setTab] = useState<'work' | 'log'>('work');

  return (
    <Box sx={{ flex: 1, minHeight: 340, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Tabs sitting on the edge of the panel they open, not buttons above it. */}
      <Stack direction="row" spacing={0.25} sx={{ borderBottom: `1px solid ${studio.panelBorder}` }}>
        {(['work', 'log'] as const).map((id) => {
          const selected = id === tab;
          return (
            <Box
              key={id}
              component="button"
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(id)}
              sx={{
                px: 1.6,
                pt: 0.5,
                pb: 0.55,
                mb: '-1px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 900,
                borderRadius: '8px 8px 0 0',
                border: '1px solid',
                borderColor: selected ? studio.panelBorder : 'transparent',
                borderBottomColor: selected ? studio.panel : 'transparent',
                bgcolor: selected ? studio.panel : 'transparent',
                color: selected ? studio.accentDark : '#8593a5',
                '&:hover': { color: selected ? studio.accentDark : '#475569' },
              }}
            >
              {id === 'work' ? 'Work' : 'Log'}
            </Box>
          );
        })}
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, pt: 1 }}>
        {tab === 'work' ? (
          <TarsWorkPanel
            data={actions}
            running={running}
            busy={busy}
            scope={scope}
            onDescribe={onDescribe}
            onNewAction={onNewAction}
            onUndo={onUndo}
          />
        ) : (
          <TarsActionLog data={actions} />
        )}
      </Box>
    </Box>
  );
}

/** TARS workstation - backend-backed evaluation + action log. */

export function TarsWorkstation() {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const currentUserId = user?.id;
  const { data: jobs = [], isLoading, refetch } = useTarsBenchJobs();
  const { scales: gradeScales } = useGradeScales();
  const scoreboard = useRestorationScoreboard();



  const checkIn = useCheckInRestorationJob();

  const moveBack = useMoveRestorationJobBackToQueue();

  const holdJob = useHoldRestorationJob();

  const completeJob = useCompleteRestorationJob();

  const pauseTimer = usePauseRestorationJobTimer();

  const patchWorkSession = usePatchRestorationJobWorkSession();
  const upsertParts = useUpsertRestorationPartsRequest();

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

  const [scanMessageDialog, setScanMessageDialog] = useState<{ title: string; message: string } | null>(null);
  const timerSwitchAckRef = useRef<Set<string>>(new Set());
  const [timerSwitchDialog, setTimerSwitchDialog] = useState<{
    runningJob: RestorationJobDTO;
    targetJob: RestorationJobDTO;
    action: TimerGuardAction;
    onConfirm: () => Promise<void>;
  } | null>(null);
  // Home unless asked for otherwise. An active bench item pulls the view to
  // Bench a moment later; with nothing in progress, Home is the useful landing.
  const [studioLane, setStudioLane] = useState<StudioLane>(
    queryView === 'bench' ? 'bench' : 'home',
  );
  const [partsDrawerOpen, setPartsDrawerOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  /**
   * Which row's activity the Work panel is reading.
   *
   * Null means "whatever the clock is on", which is right almost always — you
   * are looking at what you are doing. Clicking a row pins it instead, so you
   * can check what was already tried on a grade without moving the clock off
   * the work in front of you.
   */
  const [pinnedScope, setPinnedScope] = useState<string | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const appliedInitialSelectionRef = useRef(false);

  const focusScanInput = useCallback(() => {
    requestAnimationFrame(() => scanInputRef.current?.focus());
  }, []);

  const setStudioLocation = useCallback(
    (lane: StudioLane, jobId?: number | null) => {
      setStudioLane(lane);
      const next = new URLSearchParams();
      next.set('view', lane);
      if (jobId != null) next.set('job', String(jobId));
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
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
    return [...bench].sort((a, b) => {
      const aTimerStarted = timeValue(a.timer_started_at);
      const bTimerStarted = timeValue(b.timer_started_at);
      if (aTimerStarted !== bTimerStarted) return bTimerStarted - aTimerStarted;
      return benchSortValue(a) - benchSortValue(b);
    });
  }, [jobs]);
  const myBenchJobs = useMemo(
    () => benchJobs.filter((job) => (
      job.bench_owner_id === currentUserId
      || (job.bench_owner_id == null && job.timer_started_by_id === currentUserId)
    )),
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

  const runningJob = useMemo(
    () => myRunningRestorationJob(jobs, currentUserId),
    [jobs, currentUserId],
  );
  const runningRowKey = runningJob ? tarsJobRowKey(runningJob) : null;

  // Timer-switch confirmations are only good for the timer that was running
  // when the user acknowledged them.
  useEffect(() => {
    timerSwitchAckRef.current.clear();
  }, [runningRowKey]);

  const activeTimerJob = useMemo(() => {
    if (runningJob) return runningJob;
    return myActiveBenchRestorationJob(myBenchJobs, currentUserId);
  }, [runningJob, myBenchJobs, currentUserId]);
  const headerTimerJob = useMemo(() => {
    if (activeTimerJob) return activeTimerJob;
    if (selectedJob?.stage === 'bench') {
      return selectedJob;
    }
    return null;
  }, [activeTimerJob, selectedJob]);
  const timerController = useTarsTimerController(headerTimerJob);

  // What is being done to the item on the bench, and what already has been.
  const actions = useRestorationActions(displayJob?.id ?? null);
  const startAction = useStartRestorationAction();
  const describeAction = useDescribeRestorationAction();
  const undoAction = useUndoRestorationAction();

  // Work cannot be moved off an action nobody described. Surfaced on the
  // buttons it would block, so the rule is seen before it is hit.
  const workBlockedReason = useMemo(() => {
    const blocking = blockingAction(
      actions.data?.results ?? [],
      actions.data?.current_action_id ?? null,
    );
    if (!blocking) return undefined;
    return `Say what you did on ${actionScopeLabel(blocking.grade)} before starting something else.`;
  }, [actions.data]);


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

    const requestedJobId = queryJobId ?? navState?.selectJobId ?? null;
    if (requestedJobId) {
      const match = jobs.find((j) => j.id === requestedJobId);
      if (navState?.selectJobId) navigate(location.pathname + location.search, { replace: true, state: {} });
      if (match) {
        setSelectedRowKey(tarsJobRowKey(match));
        setStudioLocation(match.stage === 'bench' ? 'bench' : 'home', match.id);
        appliedInitialSelectionRef.current = true;
        focusScanInput();
        return;
      }
      // No matching job - fall through to normal selection.
    }

    const active =
      myRunningRestorationJob(jobs, currentUserId)
      ?? myActiveBenchRestorationJob(myBenchJobs, currentUserId)
      ?? null;
    if (active) {
      setSelectedRowKey(tarsJobRowKey(active));
      setStudioLocation('bench', active.id);
    } else if (queryView === 'home' || queryView === 'bench') {
      setStudioLane(queryView);
    }
    appliedInitialSelectionRef.current = true;
    focusScanInput();
  }, [
    isLoading,
    authLoading,
    jobs,
    myBenchJobs,
    navState?.selectJobId,
    queryJobId,
    queryView,
    focusScanInput,
    currentUserId,
    navigate,
    location.pathname,
    location.search,
    setStudioLocation,
  ]);

  const timerBusy = pauseTimer.isPending || timerSwitchDialog != null;

  const runWithTimerGuard = useCallback(
    (targetJob: RestorationJobDTO, action: TimerGuardAction, proceed: () => void | Promise<void>) => {
      const activeRunning = myRunningRestorationJob(jobs, currentUserId);
      if (!activeRunning || tarsJobRowKey(activeRunning) === tarsJobRowKey(targetJob)) {
        void proceed();
        return;
      }
      const key = timerGuardKey(action, tarsJobRowKey(activeRunning), tarsJobRowKey(targetJob));
      const pauseThenProceed = async () => {
        try {
          await pauseTimer.mutateAsync(activeRunning.id);
        } catch (err) {
          enqueueSnackbar(err instanceof Error ? err.message : 'Could not pause the running timer', {
            variant: 'error',
          });
          return false;
        }
        try {
          await proceed();
        } catch (err) {
          enqueueSnackbar(err instanceof Error ? err.message : 'Action failed', {
            variant: 'error',
          });
          return false;
        }
        return true;
      };
      if (timerSwitchAckRef.current.has(key)) {
        void pauseThenProceed();
        return;
      }
      setTimerSwitchDialog({
        runningJob: activeRunning,
        targetJob,
        action,
        onConfirm: async () => {
          setTimerSwitchDialog(null);
          const ok = await pauseThenProceed();
          if (!ok) return;
          timerSwitchAckRef.current.add(key);
          focusScanInput();
        },
      });
    },
    [jobs, currentUserId, pauseTimer, enqueueSnackbar, focusScanInput],
  );

  const handleCheckIn = useCallback(
    async (job: RestorationJobDTO, options?: { startTimer?: boolean }) => {
      const startTimerOnCheckIn = options?.startTimer !== false;
      const perform = async () => {
        try {
          const itemId = job.items[0]?.id;
          const updated = await checkIn.mutateAsync({ id: job.id, itemId, startTimer: startTimerOnCheckIn });
          setSelectedRowKey(tarsJobRowKey(updated));
          setStudioLocation('bench', updated.id);
          setBenchScanInput('');
          focusScanInput();
        } catch (err) {
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
      };
      if (startTimerOnCheckIn) {
        runWithTimerGuard(job, 'checkIn', perform);
        return;
      }
      await perform();
    },
    [
      checkIn,
      currentUserId,
      focusScanInput,
      refetch,
      runWithTimerGuard,
      setStudioLocation,
    ],
  );

  const submitBenchScan = useCallback(async () => {
    const v = benchScanInput.trim();
    if (!v) return;

    const benchMatch = benchJobs.find((j) => jobMatchesScan(j, v));
    if (benchMatch) {
      setSelectedRowKey(tarsJobRowKey(benchMatch));
      setStudioLocation('bench', benchMatch.id);
      setBenchScanInput('');
      setScanMessageDialog({
        title: 'Already on bench',
        message: `Item ${benchMatch.sku ?? v.toUpperCase()} is already on the bench and has been selected.`,
      });
      return;
    }

    const pendingMatch = pendingJobs.find((j) => jobMatchesScan(j, v));
    if (pendingMatch) {
      await handleCheckIn(pendingMatch, { startTimer: timerController.canTrackTime });
      return;
    }

    const queueMatch = queueJobs.find((j) => jobMatchesScan(j, v));
    if (queueMatch) {
      setBenchScanInput('');
      await handleCheckIn(queueMatch, { startTimer: timerController.canTrackTime });
      return;
    }

    setBenchScanInput('');
    setScanMessageDialog({
      title: 'No matching item',
      message: `No queue, bench, or pending item found for ${v.toUpperCase()}.`,
    });
  }, [
    benchScanInput,
    benchJobs,
    pendingJobs,
    queueJobs,
    handleCheckIn,
    setStudioLocation,
    timerController.canTrackTime,
  ]);



  const requestPartsForGrade = useCallback(
    async (grade: string | null, options?: { autoHold?: boolean }) => {
      const autoHold = options?.autoHold !== false;
      if (!displayJob) return;
      if (!grade) {
        enqueueSnackbar('Select a grade option before requesting parts.', { variant: 'warning' });
        return;
      }
      try {
        await flushWorkSessionSave();
        const snapshot = evaluation?.directions.find((d) => d.grade === grade) ?? null;
        await upsertParts.mutateAsync({
          jobId: displayJob.id,
          grade,
          submit: true,
          evalSnapshot: snapshot ? { ...snapshot } : undefined,
        });
        // "Put in order and send to pending": a parts request from the bench
        // parks the item in Pending so it leaves the active bench.
        if (autoHold && displayJob.stage === 'bench') {
          await holdJob.mutateAsync({
            id: displayJob.id,
            payload: {
              reason: 'parts_needed',
              notes: `Parts requested for grade ${grade}`,
              storage_location: '',
            },
          });
          setSelectedRowKey(null);
          setStudioLocation('home', displayJob.id);
          enqueueSnackbar(`Parts request submitted for ${grade} - item moved to Holding`, {
            variant: 'success',
          });
          focusScanInput();
        } else {
          enqueueSnackbar(`Parts request submitted for grade ${grade}`, { variant: 'success' });
        }
      } catch (err) {
        enqueueSnackbar(err instanceof Error ? err.message : 'Could not request parts', {
          variant: 'error',
        });
      }
    },
    [
      displayJob,
      evaluation,
      flushWorkSessionSave,
      upsertParts,
      holdJob,
      enqueueSnackbar,
      focusScanInput,
      setStudioLocation,
    ],
  );

  const handleSendBack = async (note: string) => {
    if (!selectedJob) return;
    try {
      await flushWorkSessionSave();
      await moveBack.mutateAsync({ id: selectedJob.id, note });
      setSendBackOpen(false);
      setSelectedRowKey(null);
      setStudioLocation('home');
      enqueueSnackbar('Sent back to the queue', { variant: 'info' });
      focusScanInput();
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Move back failed', { variant: 'error' });
    }
  };

  /** Wrong row. Delete the action and give its time back to the one before. */
  const handleUndoAction = useCallback(() => {
    if (!displayJob) return;
    undoAction.mutate(displayJob.id, {
      onError: (err) =>
        enqueueSnackbar(err instanceof Error ? err.message : 'Could not undo that', {
          variant: 'warning',
        }),
    });
  }, [displayJob, undoAction, enqueueSnackbar]);



  const handleHoldSubmit = async (info: TarsHoldSubmit) => {
    if (!selectedJob) return;

    try {
      await flushWorkSessionSave();
      await holdJob.mutateAsync({
        id: selectedJob.id,
        payload: {
          reason: info.reason,
          notes: info.notes,
          storage_location: info.storageLocation,
        },
      });

      setHoldOpen(false);
      enqueueSnackbar('Item placed on hold', { variant: 'info' });
      setStudioLocation('home', selectedJob.id);
      if (info.requestParts) {
        // Hold already parked it in Pending - don't double-hold.
        await requestPartsForGrade(info.requestGrade, { autoHold: false });
      }
      focusScanInput();
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Hold failed', { variant: 'error' });
    }
  };



  const handleDoneSubmit = async (payload: Parameters<typeof completeJob.mutateAsync>[0]['payload']) => {
    if (!selectedJob) return;

    try {
      await flushWorkSessionSave();
      await completeJob.mutateAsync({ id: selectedJob.id, payload });
      setSelectedRowKey(null);
      setDoneOpen(false);
      setStudioLocation('home');
      enqueueSnackbar('Disposition recorded', { variant: 'success' });
      focusScanInput();
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Done failed', { variant: 'error' });
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
      void handleCheckIn(job, { startTimer: timerController.canTrackTime });
    },
    [handleCheckIn, timerController.canTrackTime],
  );

  useEffect(() => {
    if (!selectedJob) return;
    setStudioLane(selectedJob.stage === 'bench' ? 'bench' : 'home');
  }, [selectedJob?.id, selectedJob?.stage]);

  const studioCounts = {
    home: queueJobs.length + pendingJobs.length,
    bench: myBenchJobs.length,
  };

  /**
   * Conditions worth knowing about, collected rather than mounted. Nothing here
   * is allowed to push the work surface around, so it all reads from a badge.
   */
  const notices = useMemo<StudioNotice[]>(() => {
    const list: StudioNotice[] = [];
    if (!timerController.canTrackTime) {
      list.push({
        id: 'clock',
        tone: 'warning',
        title: 'Restoration time is not being recorded',
        detail: 'Clock in or end your break before resuming work.',
      });
    }
    if (ambiguousBenchJobs.length > 0) {
      list.push({
        id: 'ownership',
        tone: 'error',
        title: `${ambiguousBenchJobs.length} bench item${ambiguousBenchJobs.length === 1 ? '' : 's'} with unclear ownership`,
        detail: 'Left over from an earlier version. Move them back to the queue or finish them before claiming another.',
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
    return list;
  }, [timerController.canTrackTime, ambiguousBenchJobs.length, queueJobs]);

  const benchPlan = useMemo(() => readBenchPlan(draftWorkSession), [draftWorkSession]);

  const updateBenchPlan = useCallback(
    (plan: TarsBenchPlan) => {
      if (!draftWorkSession) return;
      replaceWorkSession({ ...draftWorkSession, benchPlan: plan });
    },
    [draftWorkSession, replaceWorkSession],
  );

  /**
   * Press Work: the clock moves to that scope and an action opens for it.
   *
   * Coming back to the scope you were already on resumes that action rather
   * than splitting one piece of work in two. A new action defaults to Inspect
   * with no description, so the clock starts on the first click and the
   * writing-up happens while the work is fresh.
   */
  const workOn = useCallback(
    (grade: string) => {
      if (!displayJob) return;
      if (!timerController.canTrackTime) {
        enqueueSnackbar('Clock in before recording restoration work.', { variant: 'warning' });
        setNoticesOpen(true);
        return;
      }
      setPinnedScope(null);
      startAction.mutate(
        { id: displayJob.id, payload: { grade } },
        {
          onError: (err) => {
            if (err instanceof ActionNeedsDescriptionError) {
              enqueueSnackbar(err.message, { variant: 'warning' });
              return;
            }
            enqueueSnackbar(err instanceof Error ? err.message : 'Could not start that work', {
              variant: 'error',
            });
          },
        },
      );
    },
    [displayJob, startAction, timerController.canTrackTime, enqueueSnackbar],
  );

  /**
   * Close the current action and open a fresh one on the same scope.
   *
   * The server treats a repeat of the same scope as a resume, so a genuinely
   * new piece of work on the same grade says so by ending the old one first.
   */
  const handleNewAction = useCallback(
    (grade: string) => {
      if (!displayJob) return;
      startAction.mutate(
        { id: displayJob.id, payload: { grade, force_new: true } },
        {
          onError: (err) =>
            enqueueSnackbar(err instanceof Error ? err.message : 'Could not start a new action', {
              variant: err instanceof ActionNeedsDescriptionError ? 'warning' : 'error',
            }),
        },
      );
    },
    [displayJob, startAction, enqueueSnackbar],
  );

  const handleDescribeAction = useCallback(
    (actionId: number, patch: { description?: string; category?: RestorationActionCategory }) => {
      if (!displayJob) return;
      describeAction.mutate(
        { id: displayJob.id, payload: { action_id: actionId, ...patch } },
        {
          onError: (err) =>
            enqueueSnackbar(err instanceof Error ? err.message : 'Could not save that', {
              variant: 'error',
            }),
        },
      );
    },
    [displayJob, describeAction, enqueueSnackbar],
  );

  const floorRate = Number.parseFloat(scoreboard.data?.floor_rate ?? '') || TARS_DEFAULT_HOURLY_RATE;
  const benchmarkRate = scoreboard.data?.benchmark_ready
    ? Number.parseFloat(scoreboard.data.benchmark_rate ?? '') || null
    : null;

  const partsListLabel = displayItem?.skuLabel ?? displayItem?.sku;
  const parts = useMemo(() => summarizeParts(displayItem?.workSession?.parts), [displayItem]);

  const currentActionGrade =
    actions.data?.results.find((a) => a.id === actions.data?.current_action_id)?.grade ?? '';
  const selectedScope = pinnedScope ?? currentActionGrade;

  if (isLoading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: studio.canvas }}>
        <CircularProgress size={36} sx={{ color: studio.accent }} />
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
      <TarsStudioShell
        lane={studioLane}
        onLaneChange={handleLaneChange}
        counts={studioCounts}
        scanValue={benchScanInput}
        onScanChange={setBenchScanInput}
        onScanSubmit={() => void submitBenchScan()}
        scanInputRef={scanInputRef}
        onBack={handleBackToDashboard}
        actionSlot={
          studioLane === 'bench' && displayJob?.stage === 'bench' ? (
            <TarsDispositionBar
              busy={holdJob.isPending || moveBack.isPending}
              onHold={() => runWithTimerGuard(displayJob, 'hold', () => setHoldOpen(true))}
              onSendBack={() => runWithTimerGuard(displayJob, 'moveBack', () => setSendBackOpen(true))}
              onDone={() => runWithTimerGuard(displayJob, 'done', () => setDoneOpen(true))}
            />
          ) : null
        }
        noticeSlot={<StudioNoticeButton notices={notices} onOpen={() => setNoticesOpen(true)} />}
        hrSlot={
          <Chip
            size="small"
            label={timerController.hrLabel}
            sx={{
              height: 28,
              bgcolor: timerController.canTrackTime ? '#183f3b' : '#49323a',
              color: timerController.canTrackTime ? '#b9f0e6' : '#ffd8df',
              border: `1px solid ${timerController.canTrackTime ? '#2f6f68' : '#80505d'}`,
              fontWeight: 850,
            }}
          />
        }
        timerSlot={
          <TarsStudioTimerControl
            job={headerTimerJob}
            busy={timerBusy || timerController.busy}
            canTrackTime={timerController.canTrackTime}
            onStart={() => {
              void timerController.start().catch((err) => {
                enqueueSnackbar(err instanceof Error ? err.message : 'Could not start timer', { variant: 'warning' });
              });
            }}
            onPause={() => {
              void timerController.pause().catch((err) => {
                enqueueSnackbar(err instanceof Error ? err.message : 'Could not pause timer', { variant: 'error' });
              });
            }}
          />
        }
      >
        {studioLane === 'home' ? (
          <TarsHome
            board={scoreboard.data}
            queueJobs={queueJobs}
            holdingJobs={pendingJobs}
            busy={checkIn.isPending}
            onStart={(job) => void handleCheckIn(job, { startTimer: timerController.canTrackTime })}
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
        ) : (
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              overflow: 'auto',
              p: { xs: 0.75, md: 1.25 },
              display: 'flex',
              flexDirection: 'column',
              gap: 1.25,
            }}
          >
            {/*
              What it is on the left, what to do with it on the right. The two
              answer different questions and are read at different moments, so
              they sit side by side rather than stacking and wasting the width.
            */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: 'minmax(260px, 300px) minmax(0, 1fr)' },
                gap: 1.25,
                alignItems: 'start',
              }}
            >
              <TarsBenchStatus
                job={displayJob}
                busy={holdJob.isPending || moveBack.isPending}
                partsCount={parts.count}
                partsCost={parts.cost}
                onParts={() => setPartsDrawerOpen(true)}
              />

              <TarsGradeTable
                job={displayJob}
                plan={benchPlan}
                scaleGrades={gradeScales[displayJob.scale] ?? []}
                floorRate={floorRate}
                benchmarkRate={benchmarkRate}
                busy={timerController.busy || startAction.isPending}
                selectedScope={selectedScope}
                onSelectScope={setPinnedScope}
                onPlanChange={updateBenchPlan}
                onClaimGrade={(grade) => updateBenchPlan({ ...benchPlan, startingGrade: grade })}
                onAimTimer={workOn}
                blockedReason={workBlockedReason}
              />
            </Box>

            <BenchRecord
              actions={actions.data}
              running={displayJob.timer_is_running}
              busy={startAction.isPending || describeAction.isPending || undoAction.isPending}
              scope={selectedScope}
              onDescribe={handleDescribeAction}
              onNewAction={handleNewAction}
              onUndo={handleUndoAction}
            />
          </Box>
        )}
      </TarsStudioShell>

      <StudioNoticeDrawer open={noticesOpen} notices={notices} onClose={() => setNoticesOpen(false)} />

      <TarsSendBackDialog
        open={sendBackOpen}
        itemLabel={displayJob?.items[0]?.sku ?? displayJob?.sku ?? 'this item'}
        busy={moveBack.isPending}
        onCancel={() => setSendBackOpen(false)}
        onSubmit={(note) => void handleSendBack(note)}
      />

      <Drawer
        anchor="right"
        open={partsDrawerOpen}
        onClose={() => setPartsDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: PARTS_DRAWER_WIDTH,
            maxWidth: '96vw',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        }}
      >
        <Box sx={{ px: 1.25, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Typography variant="subtitle2" fontWeight={800}>Parts & orders</Typography>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <TarsPartsListPanel
            session={displayItem?.workSession}
            itemLabel={partsListLabel}
            readOnly={false}
            onSessionChange={replaceWorkSession}
            gradeOptions={gradeOptions}
            selectedGrade={displayItem?.workSession?.selectedGrade ?? null}
            currentGrade={benchPlan.startingGrade}
            requesting={upsertParts.isPending}
            onRequestParts={(grade) => void requestPartsForGrade(grade)}
          />
        </Box>
      </Drawer>



      <TarsDoneDialog

        open={doneOpen}

        job={selectedJob && (selectedJob.stage === 'bench' || selectedJob.stage === 'pending') ? selectedJob : null}

        evaluation={evaluation}
        session={displayItem?.workSession}

        onClose={closeDoneDialog}

        onSubmit={(payload) => void handleDoneSubmit(payload)}
      />



      {selectedJob && (selectedJob.stage === 'bench' || selectedJob.stage === 'pending') ?
        <TarsHoldDialog
          open={holdOpen}
          title="Place on hold"
          initial={displayItem?.workSession?.pending}
          canRequestParts
          gradeOptions={gradeOptions}
          selectedGrade={displayItem?.workSession?.selectedGrade ?? null}
          requesting={upsertParts.isPending}
          onClose={closeHoldDialog}
          onSubmit={(info) => void handleHoldSubmit(info)}
        />
      : null}

      <TarsTimerSwitchDialog
        open={timerSwitchDialog != null}
        runningJob={timerSwitchDialog?.runningJob ?? null}
        targetJob={timerSwitchDialog?.targetJob ?? null}
        action={timerSwitchDialog?.action ?? null}
        busy={timerBusy}
        onConfirm={() => void timerSwitchDialog?.onConfirm()}
        onCancel={() => setTimerSwitchDialog(null)}
      />

      <TarsScanMessageDialog
        open={scanMessageDialog != null}
        title={scanMessageDialog?.title ?? ''}
        message={scanMessageDialog?.message ?? ''}
        onClose={closeScanMessageDialog}
      />

      <Dialog open={timerController.idlePrompt != null} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 950 }}>Were you working on this item?</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ color: '#344258' }}>
            The screen has been quiet since{' '}
            <strong>{timerController.idlePrompt?.idleSince}</strong> while the clock kept running on{' '}
            <strong>{timerController.idlePrompt?.itemLabel}</strong>.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, color: '#65748a' }}>
            Yes keeps the elapsed time and resumes. No removes time after{' '}
            {timerController.idlePrompt?.lastActionLabel ?? 'the last recorded action'} and leaves the timer paused.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            variant="outlined"
            disabled={timerController.busy}
            onClick={() => {
              void timerController.resolveIdle(false).catch((err) => {
                enqueueSnackbar(err instanceof Error ? err.message : 'Could not adjust idle time', { variant: 'error' });
              });
            }}
            sx={{ minWidth: 150, fontWeight: 900 }}
          >
            No, remove idle time
          </Button>
          <Button
            variant="contained"
            disabled={timerController.busy || !timerController.canTrackTime}
            onClick={() => {
              void timerController.resolveIdle(true).catch((err) => {
                enqueueSnackbar(err instanceof Error ? err.message : 'Could not resume timer', { variant: 'error' });
              });
            }}
            sx={{ minWidth: 150, bgcolor: '#087b6f', fontWeight: 950 }}
          >
            Yes, keep working
          </Button>
        </DialogActions>
      </Dialog>
    </Box>

  );

}


