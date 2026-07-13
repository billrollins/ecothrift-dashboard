import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  Drawer,
  Stack,
  Typography,
} from '@mui/material';

import ExpandMore from '@mui/icons-material/ExpandMore';
import Done from '@mui/icons-material/Done';
import PauseCircle from '@mui/icons-material/PauseCircle';
import ShoppingCart from '@mui/icons-material/ShoppingCart';
import Undo from '@mui/icons-material/Undo';

import { useSnackbar } from 'notistack';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../../hooks/useAuth';

import {

  useCheckInRestorationJob,

  useAdjustRestorationJobTimer,

  useCompleteRestorationJob,

  useMoveRestorationJobBackToQueue,

  usePatchRestorationJobWorkSession,

  usePauseRestorationJobTimer,

  useStartRestorationJobTimer,

  useTarsBenchJobs,

  useUpsertRestorationPartsRequest,

  useHoldRestorationJob,

} from '../../../hooks/useRestorationBench';

import type { RestorationJobDTO } from '../../../types/inventory.types';

import { TARS_DEFAULT_HOURLY_RATE, TARS_DEFAULT_TIME_PREMIUM } from './tarsConstants';

import { TarsWorkBenchTable } from './TarsWorkBenchTable';
import { decisionGates } from './tarsDecisionEngine';
import { TarsTimerSwitchDialog } from './TarsTimerSwitchDialog';
import { TarsDoneDialog } from './TarsDoneDialog';
import { TarsScanMessageDialog } from './TarsScanMessageDialog';
import { TarsHoldDialog } from './TarsHoldDialog';
import { TarsPartsListPanel, collectSessionParts } from './TarsPartsListPanel';
import { PARTS_DRAWER_WIDTH } from './tarsPartsListSession';
import { TarsDecisionWizard } from './studio/TarsDecisionWizard';
import {
  TarsStudioShell,
  TarsStudioJobCard,
  TarsStudioItemHero,
  type StudioLane,
} from './studio/TarsStudioShell';
import { TarsStudioQueueView } from './studio/TarsStudioQueueView';
import { studio } from './studio/tarsStudioTheme';

import { jobMatchesScan, myActiveBenchRestorationJob, myRunningRestorationJob, restorationJobToTarsItem, tarsJobRowKey } from './tarsJobAdapter';
import { isBenchIdleWithoutTimer, timerGuardKey, type TimerGuardAction } from './tarsTimerWarnings';
import { useWorkSessionDraft } from './useWorkSessionDraft';
import { useGradeScales } from '../../../hooks/useGradeScales';

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

/** TARS workstation — backend-backed evaluation + action log. */

export function TarsWorkstation() {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const currentUserId = user?.id;
  const { data: jobs = [], isLoading, refetch } = useTarsBenchJobs();
  const { scales: gradeScales } = useGradeScales();



  const checkIn = useCheckInRestorationJob();

  const moveBack = useMoveRestorationJobBackToQueue();

  const holdJob = useHoldRestorationJob();

  const completeJob = useCompleteRestorationJob();

  const startTimer = useStartRestorationJobTimer();

  const pauseTimer = usePauseRestorationJobTimer();

  const adjustTimer = useAdjustRestorationJobTimer();

  const patchWorkSession = usePatchRestorationJobWorkSession();

  const upsertParts = useUpsertRestorationPartsRequest();



  const location = useLocation();
  const navState = location.state as TarsWorkstationNavState | null;

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
  const [studioLane, setStudioLane] = useState<StudioLane>('bench');
  const [partsDrawerOpen, setPartsDrawerOpen] = useState(false);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const appliedInitialSelectionRef = useRef(false);

  const focusScanInput = useCallback(() => {
    requestAnimationFrame(() => scanInputRef.current?.focus());
  }, []);



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

  const isQueueSelected = Boolean(
    selectedJob && (selectedJob.stage === 'queued' || selectedJob.stage === 'sent'),
  );

  const isPendingSelected = selectedJob?.stage === 'pending';

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

  const activeBenchRowKey = useMemo(() => {
    const activeJob = myActiveBenchRestorationJob(benchJobs, currentUserId);
    return activeJob ? tarsJobRowKey(activeJob) : null;
  }, [benchJobs, currentUserId]);
  const activeTimerJob = useMemo(() => {
    if (runningJob) return runningJob;
    return myActiveBenchRestorationJob(benchJobs, currentUserId);
  }, [runningJob, benchJobs, currentUserId]);
  const headerTimerJob = useMemo(() => {
    if (activeTimerJob) return activeTimerJob;
    if (selectedJob && (selectedJob.stage === 'bench' || selectedJob.stage === 'pending')) {
      return selectedJob;
    }
    return null;
  }, [activeTimerJob, selectedJob]);
  const headerTimerRowKey = headerTimerJob ? tarsJobRowKey(headerTimerJob) : null;
  const timerDetached = Boolean(headerTimerJob && selectedRowKey && headerTimerRowKey !== selectedRowKey);
  const showIdleTimerWarning = Boolean(selectedJob && isBenchIdleWithoutTimer(selectedJob));
  const selectedTimerItemStatus: 'running' | 'paused' | 'mismatch' | null =
    selectedJob && selectedRowKey && activeBenchRowKey ?
      selectedRowKey === activeBenchRowKey ?
        selectedJob.timer_is_running ? 'running' : 'paused'
      : 'mismatch'
    : null;



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

    if (navState?.selectJobId) {
      const match = jobs.find((j) => j.id === navState.selectJobId);
      navigate(location.pathname, { replace: true, state: {} });
      if (match) {
        setSelectedRowKey(tarsJobRowKey(match));
        appliedInitialSelectionRef.current = true;
        focusScanInput();
        return;
      }
      // No matching job — fall through to normal selection.
    }

    const active =
      myRunningRestorationJob(jobs, currentUserId)
      ?? myActiveBenchRestorationJob(benchJobs, currentUserId)
      ?? null;
    if (active) {
      setSelectedRowKey(tarsJobRowKey(active));
    }
    appliedInitialSelectionRef.current = true;
    focusScanInput();
  }, [isLoading, authLoading, jobs, benchJobs, navState?.selectJobId, focusScanInput, currentUserId, navigate, location.pathname]);

  const actionsBusy =
    checkIn.isPending
    || moveBack.isPending
    || holdJob.isPending
    || completeJob.isPending;



  const timerBusy = startTimer.isPending || pauseTimer.isPending || adjustTimer.isPending || timerSwitchDialog != null;

  const startTimerSafe = useCallback(
    async (jobId: number) => {
      try {
        await startTimer.mutateAsync(jobId);
      } catch (err) {
        enqueueSnackbar(err instanceof Error ? err.message : 'Could not start the timer', {
          variant: 'error',
        });
      }
    },
    [startTimer, enqueueSnackbar],
  );

  const pauseTimerSafe = useCallback(
    async (jobId: number) => {
      try {
        await pauseTimer.mutateAsync(jobId);
      } catch (err) {
        enqueueSnackbar(err instanceof Error ? err.message : 'Could not pause the timer', {
          variant: 'error',
        });
      }
    },
    [pauseTimer, enqueueSnackbar],
  );

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
          setBenchScanInput('');
          focusScanInput();
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Could not check in to the bench.';
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
    [checkIn, focusScanInput, runWithTimerGuard],
  );

  const submitBenchScan = useCallback(async () => {
    const v = benchScanInput.trim();
    if (!v) return;

    const benchMatch = benchJobs.find((j) => jobMatchesScan(j, v));
    if (benchMatch) {
      setSelectedRowKey(tarsJobRowKey(benchMatch));
      setBenchScanInput('');
      setScanMessageDialog({
        title: 'Already on bench',
        message: `Item ${benchMatch.sku ?? v.toUpperCase()} is already on the bench and has been selected.`,
      });
      return;
    }

    const pendingMatch = pendingJobs.find((j) => jobMatchesScan(j, v));
    if (pendingMatch) {
      await handleCheckIn(pendingMatch);
      return;
    }

    const queueMatch = queueJobs.find((j) => jobMatchesScan(j, v));
    if (queueMatch) {
      setBenchScanInput('');
      if (queueMatch.needs_setup) {
        navigate('/restoration/tars', {
          state: { selectJobId: queueMatch.id, showNeedsPricesDialog: true },
        });
        return;
      }
      await handleCheckIn(queueMatch);
      return;
    }

    setBenchScanInput('');
    setScanMessageDialog({
      title: 'No matching item',
      message: `No queue, bench, or pending item found for ${v.toUpperCase()}.`,
    });
  }, [benchScanInput, benchJobs, pendingJobs, queueJobs, handleCheckIn, navigate]);



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
          enqueueSnackbar(`Parts request submitted for ${grade} — item moved to Pending`, {
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
    [displayJob, evaluation, flushWorkSessionSave, upsertParts, holdJob, enqueueSnackbar, focusScanInput],
  );

  const handleMoveBack = async () => {
    if (!selectedJob) return;
    runWithTimerGuard(selectedJob, 'moveBack', async () => {
      try {
        await flushWorkSessionSave();
        await moveBack.mutateAsync(selectedJob.id);
        setSelectedRowKey(null);
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
      if (info.requestParts) {
        // Hold already parked it in Pending — don't double-hold.
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

  const handleSelectRailJob = useCallback((job: RestorationJobDTO) => {
    setSelectedRowKey(tarsJobRowKey(job));
    if (job.stage === 'queued' || job.stage === 'sent') setStudioLane('inbox');
    else if (job.stage === 'pending') setStudioLane('pending');
    else setStudioLane('bench');
  }, []);

  useEffect(() => {
    if (!selectedJob) return;
    if (selectedJob.stage === 'queued' || selectedJob.stage === 'sent') setStudioLane('inbox');
    else if (selectedJob.stage === 'pending') setStudioLane('pending');
    else if (selectedJob.stage === 'bench') setStudioLane('bench');
  }, [selectedJob?.id, selectedJob?.stage]);

  const laneJobs =
    studioLane === 'inbox' ? queueJobs
    : studioLane === 'pending' ? pendingJobs
      : benchJobs;

  const studioCounts = {
    inbox: queueJobs.length,
    bench: benchJobs.length,
    pending: pendingJobs.length,
  };

  const emptySelectionMessage = 'Select an item from the lane or scan a tag to begin.';
  const partsListCount =
    displayItem?.workSession ? collectSessionParts(displayItem.workSession).length : 0;
  const partsListLabel = displayItem?.skuLabel ?? displayItem?.sku;

  const heroActions = selectedJob && displayJob ? (
    <Stack direction="row" gap={0.5} flexWrap="wrap">
      {isQueueSelected && !selectedJob.needs_setup ?
        <Button variant="contained" size="small" disabled={actionsBusy}
          onClick={() => void handleCheckIn(selectedJob, { startTimer: true })}
          sx={{ bgcolor: studio.accent, fontWeight: 800, minHeight: 28, py: 0 }}>
          Check in
        </Button>
      : null}
      {selectedJob.stage === 'bench' ?
        <>
          <Button size="small" startIcon={<Undo />} onClick={() => void handleMoveBack()} sx={{ minHeight: 28, py: 0 }}>Queue</Button>
          <Button size="small" startIcon={<PauseCircle />}
            onClick={() => runWithTimerGuard(selectedJob, 'hold', () => setHoldOpen(true))} sx={{ minHeight: 28, py: 0 }}>Hold</Button>
          <Button size="small" startIcon={<ShoppingCart />} onClick={() => setPartsDrawerOpen(true)} sx={{ minHeight: 28, py: 0 }}>Parts</Button>
          <Button size="small" variant="contained" color="success" startIcon={<Done />}
            onClick={() => {
              const gates = decisionGates(displayItem?.workSession ?? createEmptyWorkSession('bench'));
              if (!gates.canFinalize) {
                enqueueSnackbar('Complete the guided decision wizard first.', { variant: 'warning' });
                return;
              }
              runWithTimerGuard(selectedJob, 'done', () => setDoneOpen(true));
            }} sx={{ minHeight: 28, py: 0 }}>Done</Button>
        </>
      : null}
      {isPendingSelected ?
        <Button variant="contained" size="small" onClick={() => void handleCheckIn(selectedJob)} sx={{ minHeight: 28, py: 0 }}>Resume</Button>
      : null}
    </Stack>
  ) : null;

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
        onLaneChange={setStudioLane}
        counts={studioCounts}
        scanValue={benchScanInput}
        onScanChange={setBenchScanInput}
        onScanSubmit={() => void submitBenchScan()}
        scanInputRef={scanInputRef}
      >
        <Box
          sx={{
            width: { xs: '100%', md: 220 },
            flexShrink: 0,
            borderRight: `1px solid ${studio.railBorder}`,
            overflowY: 'auto',
            bgcolor: studio.panel,
            p: 0.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.25,
          }}
        >
          {laneJobs.length === 0 ?
            <Typography variant="body2" sx={{ color: studio.railTextMuted, px: 1, py: 2 }}>
              No items in this lane.
            </Typography>
          : laneJobs.map((job) => (
            <TarsStudioJobCard
              key={tarsJobRowKey(job)}
              job={job}
              selected={selectedRowKey === tarsJobRowKey(job)}
              running={runningRowKey === tarsJobRowKey(job)}
              onClick={() => handleSelectRailJob(job)}
            />
          ))}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {!displayItem || !evaluation || !displayJob ?
            <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', color: studio.subOnDark }}>
              <Stack alignItems="center" spacing={0.75}>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>{emptySelectionMessage}</Typography>
                <Button size="small" variant="outlined" onClick={() => void refetch()}>Refresh</Button>
              </Stack>
            </Box>
          : <>
              {showIdleTimerWarning && !isPendingSelected ?
                <Alert severity="warning" sx={{ py: 0, '& .MuiAlert-message': { py: 0.5 } }}>
                  Start the timer when bench work begins.
                </Alert>
              : null}
              <TarsStudioItemHero
                job={displayJob}
                elapsedSeconds={displayJob.elapsed_seconds ?? 0}
                timerRunning={Boolean(displayJob.timer_is_running)}
                onStartTimer={
                  displayJob.stage === 'bench'
                    ? () => runWithTimerGuard(displayJob, 'startTimer', () => startTimerSafe(displayJob.id))
                    : undefined
                }
                onPauseTimer={
                  displayJob.stage === 'bench' ? () => void pauseTimerSafe(displayJob.id) : undefined
                }
                actions={heroActions}
              />
              {isQueueSelected && selectedJob ?
                <TarsStudioQueueView
                  job={selectedJob}
                  busy={checkIn.isPending}
                  onCheckIn={() => void handleCheckIn(selectedJob, { startTimer: true })}
                />
              : <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <TarsDecisionWizard
                      item={displayItem}
                      session={displayItem.workSession ?? createEmptyWorkSession(isPendingSelected ? 'pending' : 'bench')}
                      processingHandoff={displayJob.processing_handoff}
                      editable={selectedJob?.stage === 'bench'}
                      onSessionChange={replaceWorkSession}
                      onOpenParts={() => setPartsDrawerOpen(true)}
                      onOpenHold={
                        selectedJob?.stage === 'bench'
                          ? () => runWithTimerGuard(selectedJob, 'hold', () => setHoldOpen(true))
                          : undefined
                      }
                      onRequestComplete={
                        selectedJob?.stage === 'bench'
                          ? (session) => {
                              runWithTimerGuard(selectedJob, 'done', async () => {
                                await replaceWorkSessionImmediate(session);
                                setDoneOpen(true);
                              });
                            }
                          : undefined
                      }
                    />
                  </Box>
                  <Accordion disableGutters sx={{ bgcolor: studio.panel, borderRadius: `${studio.radius.sm}px`, border: `1px solid ${studio.panelBorder}`, '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                      <Typography variant="body2" fontWeight={800}>Execution log</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0, px: 1, pb: 1 }}>
                      <TarsWorkBenchTable
                        session={displayItem.workSession ?? createEmptyWorkSession(isPendingSelected ? 'pending' : 'bench')}
                        readOnly={isPendingSelected}
                        onSessionChange={replaceWorkSession}
                      />
                    </AccordionDetails>
                  </Accordion>
                </Box>
              }
            </>
          }
        </Box>
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
            readOnly={isPendingSelected}
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

        timerBusy={timerBusy}

        onTimerStart={() => {
          if (selectedJob) runWithTimerGuard(selectedJob, 'startTimer', () => startTimerSafe(selectedJob.id));
        }}

        onTimerPause={() => {

          if (selectedJob?.stage === 'bench') void pauseTimerSafe(selectedJob.id);

        }}

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
    </Box>

  );

}


