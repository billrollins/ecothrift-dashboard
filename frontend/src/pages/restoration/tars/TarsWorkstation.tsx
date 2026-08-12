import {
  Alert,
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

  useTarsBenchJobs,

  useUpsertRestorationPartsRequest,
  useHoldRestorationJob,
  useRequestRestorationJobValuation,
} from '../../../hooks/useRestorationBench';
import { useGradeScales } from '../../../hooks/useGradeScales';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { TARS_DEFAULT_HOURLY_RATE, TARS_DEFAULT_TIME_PREMIUM } from './tarsConstants';
import { TarsTimerSwitchDialog } from './TarsTimerSwitchDialog';
import { TarsDoneDialog } from './TarsDoneDialog';
import { TarsScanMessageDialog } from './TarsScanMessageDialog';
import { TarsHoldDialog } from './TarsHoldDialog';
import { TarsPartsListPanel } from './TarsPartsListPanel';
import { PARTS_DRAWER_WIDTH } from './tarsPartsListSession';
import { TarsItemCockpit } from './studio/TarsItemCockpit';
import {
  TarsStudioShell,
  type StudioLane,
} from './studio/TarsStudioShell';
import { TarsStudioTimerControl } from './studio/TarsStudioTimerControl';
import { TarsItemStateBar } from './studio/TarsItemStateBar';
import { TarsLaneList } from './studio/TarsLaneList';
import { TarsScoreboard } from './TarsScoreboard';
import { TarsRestorationTimeline } from './studio/TarsRestorationTimeline';
import { studio } from './studio/tarsStudioTheme';

import { jobMatchesScan, myActiveBenchRestorationJob, myRunningRestorationJob, restorationJobToTarsItem, tarsJobRowKey } from './tarsJobAdapter';
import { timerGuardKey, type TimerGuardAction } from './tarsTimerWarnings';
import { useWorkSessionDraft } from './useWorkSessionDraft';
import { useTarsTimerController } from './useTarsTimerController';

import { createEmptyWorkSession, evaluateWorkSession } from './tarsWorkRollup';

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
  const requestValuation = useRequestRestorationJobValuation();

  const location = useLocation();
  const navState = location.state as TarsWorkstationNavState | null;
  const [searchParams, setSearchParams] = useSearchParams();
  const queryJobId = Number(searchParams.get('job')) || null;
  const queryView = searchParams.get('view');

  const [benchScanInput, setBenchScanInput] = useState('');

  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const [doneOpen, setDoneOpen] = useState(false);

  const [holdOpen, setHoldOpen] = useState(false);

  const [scanMessageDialog, setScanMessageDialog] = useState<{ title: string; message: string } | null>(null);
  const timerSwitchAckRef = useRef<Set<string>>(new Set());
  const [timerSwitchDialog, setTimerSwitchDialog] = useState<{
    runningJob: RestorationJobDTO;
    targetJob: RestorationJobDTO;
    action: TimerGuardAction;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [studioLane, setStudioLane] = useState<StudioLane>(
    queryView === 'inbox' || queryView === 'pending' || queryView === 'bench'
      ? queryView
      : 'bench',
  );
  const [partsDrawerOpen, setPartsDrawerOpen] = useState(false);

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
    replaceSessionImmediate: replaceWorkSessionImmediate,
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
        const lane: StudioLane =
          match.stage === 'pending' ? 'pending'
          : match.stage === 'bench' ? 'bench'
          : 'inbox';
        setStudioLocation(lane, match.id);
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
    } else if (queryView === 'inbox' || queryView === 'pending' || queryView === 'bench') {
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
          setStudioLocation('pending', displayJob.id);
          enqueueSnackbar(`Parts request submitted for ${grade} - item moved to Pending`, {
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

  const handleMoveBack = async () => {
    if (!selectedJob) return;
    runWithTimerGuard(selectedJob, 'moveBack', async () => {
      try {
        await flushWorkSessionSave();
        await moveBack.mutateAsync(selectedJob.id);
        setSelectedRowKey(null);
        setStudioLocation('inbox');
        enqueueSnackbar('Moved back to queue', { variant: 'info' });
        focusScanInput();
      } catch (err) {
        enqueueSnackbar(err instanceof Error ? err.message : 'Move back failed', { variant: 'error' });
      }
    });
  };



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
      setStudioLocation('pending', selectedJob.id);
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
      setStudioLocation('inbox');
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

  useEffect(() => {
    if (!selectedJob) return;
    if (selectedJob.stage === 'queued' || selectedJob.stage === 'sent') setStudioLane('inbox');
    else if (selectedJob.stage === 'pending') setStudioLane('pending');
    else if (selectedJob.stage === 'bench') setStudioLane('bench');
  }, [selectedJob?.id, selectedJob?.stage]);

  const studioCounts = {
    inbox: queueJobs.length,
    bench: myBenchJobs.length,
    pending: pendingJobs.length,
  };

  const partsListLabel = displayItem?.skuLabel ?? displayItem?.sku;

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
        {studioLane === 'inbox' ? (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {scoreboard.data ? <TarsScoreboard board={scoreboard.data} /> : null}
            <TarsLaneList
              lane="inbox"
              jobs={queueJobs}
              busy={checkIn.isPending}
              onOpen={(job) => void handleCheckIn(job, { startTimer: timerController.canTrackTime })}
            />
          </Box>
        ) : studioLane === 'pending' ? (
          <TarsLaneList
            lane="pending"
            jobs={pendingJobs}
            busy={checkIn.isPending}
            onOpen={(job) => void handleCheckIn(job, { startTimer: timerController.canTrackTime })}
          />
        ) : !displayItem || !evaluation || !displayJob || displayJob.stage !== 'bench' ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 2, color: '#526177' }}>
            <Stack alignItems="center" spacing={1}>
              <Typography variant="h6" sx={{ color: '#172033', fontWeight: 950 }}>Your Bench is clear</Typography>
              <Typography variant="body2">Scan an item or choose one from Inbox or Pending.</Typography>
              <Button variant="contained" onClick={() => handleLaneChange('inbox')} sx={{ bgcolor: '#087b6f' }}>
                Open Inbox
              </Button>
            </Stack>
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              overflow: 'hidden',
              p: { xs: 0.75, md: 1.25 },
              display: 'flex',
              flexDirection: 'column',
              gap: 0.8,
            }}
          >
            {ambiguousBenchJobs.length ? (
              <Alert severity="error" sx={{ py: 0, '& .MuiAlert-message': { py: 0.45 } }}>
                {ambiguousBenchJobs.length} legacy Bench item{ambiguousBenchJobs.length === 1 ? '' : 's'}{' '}
                {ambiguousBenchJobs.length === 1 ? 'has' : 'have'} unresolved ownership. This item is shown
                conservatively; move it to Inbox or Pending before claiming another.
              </Alert>
            ) : null}
            {!timerController.canTrackTime ? (
              <Alert severity="warning" sx={{ py: 0, '& .MuiAlert-message': { py: 0.45 } }}>
                Restoration time is paused. Clock in or end your break before resuming.
              </Alert>
            ) : null}
            <TarsItemStateBar
              job={displayJob}
              session={displayItem.workSession ?? createEmptyWorkSession('bench')}
              hourlyRate={TARS_DEFAULT_HOURLY_RATE}
              scaleGrades={gradeScales[displayJob.scale] ?? []}
              requesting={requestValuation.isPending}
              onRequestValuation={(grades) => {
                void requestValuation.mutateAsync({ id: displayJob.id, grades, notes: '' });
              }}
            />
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.15fr) minmax(470px, 0.85fr)' },
                gap: 0.8,
                overflow: { xs: 'auto', xl: 'hidden' },
              }}
            >
              <Box sx={{ minHeight: { xs: 440, xl: 0 }, minWidth: 0 }}>
                <TarsRestorationTimeline jobId={displayJob.id} editable />
              </Box>
              <Box sx={{ minHeight: { xs: 500, xl: 0 }, minWidth: 0 }}>
                <TarsItemCockpit
                  item={displayItem}
                  job={displayJob}
                  session={displayItem.workSession ?? createEmptyWorkSession('bench')}
                  processingHandoff={displayJob.processing_handoff}
                  editable
                  scaleRecord={gradeScales}
                  onSessionChange={replaceWorkSession}
                  onOpenParts={() => setPartsDrawerOpen(true)}
                  onOpenHold={() => runWithTimerGuard(displayJob, 'hold', () => setHoldOpen(true))}
                  onMoveToInbox={() => void handleMoveBack()}
                  onRequestComplete={(session) => {
                    runWithTimerGuard(displayJob, 'done', async () => {
                      await replaceWorkSessionImmediate(session);
                      setDoneOpen(true);
                    });
                  }}
                />
              </Box>
            </Box>
          </Box>
        )}
      </TarsStudioShell>

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
            No activity was detected for five minutes while the timer was running on{' '}
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


