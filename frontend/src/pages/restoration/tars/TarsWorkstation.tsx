import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import Menu from '@mui/icons-material/Menu';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';

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

import { TarsGradeDirectionCards } from './TarsGradeDirectionCards';

import { TarsActionLogPanel } from './TarsActionLogPanel';

import { TarsBenchItemCard } from './TarsBenchItemCard';
import { TarsBenchTimer } from './TarsBenchTimer';
import { TarsTimerSwitchDialog } from './TarsTimerSwitchDialog';

import { TarsDoneDialog } from './TarsDoneDialog';
import { TarsQueuePreviewContent } from './TarsQueuePreviewContent';
import { TarsScanMessageDialog } from './TarsScanMessageDialog';
import { TarsHoldDialog } from './TarsHoldDialog';
import { TarsPartsListPanel, collectSessionParts } from './TarsPartsListPanel';
import { PARTS_DRAWER_WIDTH } from './tarsPartsListSession';
import { TarsWorkstationRail, RAIL_DEFAULT_WIDTH, RAIL_MAX_WIDTH, RAIL_MIN_WIDTH, type RailSectionKey } from './TarsWorkstationRail';

import { jobMatchesScan, myActiveBenchRestorationJob, myRunningRestorationJob, restorationJobToTarsItem, tarsJobRowKey } from './tarsJobAdapter';
import { isBenchIdleWithoutTimer, timerGuardKey, type TimerGuardAction } from './tarsTimerWarnings';
import { useWorkSessionDraft } from './useWorkSessionDraft';

import { createEmptyWorkSession, evaluateWorkSession } from './tarsWorkRollup';

import type { TarsPendingInfo, TarsWorkSession } from './tarsWorkTypes';

export type TarsWorkstationNavState = {
  selectJobId?: number;
  focusSection?: 'queue' | 'bench' | 'pending';
};

function timeValue(iso: string | null | undefined): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : 0;
}

function benchSortValue(job: RestorationJobDTO): number {
  return timeValue(job.bench_started_at ?? job.sent_at ?? job.created_at);
}

function sessionHasRepairParts(session: TarsWorkSession): boolean {
  return session.actions.some(
    (a) => a.type === 'repair' && a.options.some((o) => o.parts.length > 0),
  );
}

export type TarsWorkstationLayout = 'split' | 'drawer';

export type TarsWorkstationProps = {
  /** split = inline left rail (classic TARS); drawer = rail in pop-out panel (TARS 2). */
  railLayout?: TarsWorkstationLayout;
};

/** TARS workstation — backend-backed evaluation + action log. */

export function TarsWorkstation({ railLayout = 'split' }: TarsWorkstationProps) {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const currentUserId = user?.id;
  const { data: jobs = [], isLoading, refetch } = useTarsBenchJobs();



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

  const [holdDialogMode, setHoldDialogMode] = useState<'new' | 'update'>('new');
  const [scanMessageDialog, setScanMessageDialog] = useState<{ title: string; message: string } | null>(null);
  const timerSwitchAckRef = useRef<Set<string>>(new Set());
  const [timerSwitchDialog, setTimerSwitchDialog] = useState<{
    runningJob: RestorationJobDTO;
    targetJob: RestorationJobDTO;
    action: TimerGuardAction;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<RailSectionKey, boolean>>({
    queue: false,
    bench: false,
    pending: false,
  });
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT_WIDTH);
  const [selectionDrawerOpen, setSelectionDrawerOpen] = useState(false);
  const [partsDrawerOpen, setPartsDrawerOpen] = useState(false);
  const railDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const selectionDrawerWidth = RAIL_MAX_WIDTH;

  const toggleRailSection = useCallback((key: RailSectionKey) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleRailResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      railDragRef.current = { startX: e.clientX, startWidth: railWidth };
    },
    [railWidth],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!railDragRef.current) return;
      const delta = e.clientX - railDragRef.current.startX;
      const next = Math.min(
        RAIL_MAX_WIDTH,
        Math.max(RAIL_MIN_WIDTH, railDragRef.current.startWidth + delta),
      );
      setRailWidth(next);
    };
    const onUp = () => {
      railDragRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const appliedInitialSelectionRef = useRef(false);

  const focusScanInput = useCallback(() => {
    requestAnimationFrame(() => {
      if (railLayout === 'drawer') {
        setSelectionDrawerOpen(true);
      }
      scanInputRef.current?.focus();
    });
  }, [railLayout]);



  const queueJobs = useMemo(
    () => jobs.filter((j) => j.stage === 'queued' || j.stage === 'sent'),
    [jobs],
  );

  const benchJobs = useMemo(() => {
    const bench = jobs.filter((j) => j.stage === 'bench');
    return [...bench].sort((a, b) => {
      const aTimerStarted = timeValue(a.timer_started_at);
      const bTimerStarted = timeValue(b.timer_started_at);
      if (aTimerStarted || bTimerStarted) {
        if (aTimerStarted !== bTimerStarted) return bTimerStarted - aTimerStarted;
        return benchSortValue(a) - benchSortValue(b);
      }
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

  const syncPartsRequest = useCallback(
    async (job: RestorationJobDTO, evalSnapshot: ReturnType<typeof evaluateWorkSession> | null) => {
      const session = (job.work_session as unknown as TarsWorkSession | undefined) ?? createEmptyWorkSession('bench');

      if (!sessionHasRepairParts(session)) return;

      try {
        await upsertParts.mutateAsync({
          jobId: job.id,
          evalSnapshot: evalSnapshot ? { ...evalSnapshot } : undefined,
        });
      } catch {
        // Non-blocking — parts sync is best-effort during bench work.
      }
    },
    [upsertParts],
  );

  const persistWorkSession = useCallback(
    async (jobId: number, session: TarsWorkSession) => {
      const job = jobById.get(jobId);
      if (!job) return;

      try {
        const updated = await patchWorkSession.mutateAsync({
          id: jobId,
          workSession: session as unknown as Record<string, unknown>,
        });

        const item = restorationJobToTarsItem(updated);
        const evalResult = evaluateWorkSession(
          item,
          session,
          TARS_DEFAULT_HOURLY_RATE,
          TARS_DEFAULT_TIME_PREMIUM,
        );

        await syncPartsRequest(updated, evalResult);
      } catch (err) {
        enqueueSnackbar(err instanceof Error ? err.message : 'Failed to save work session', {
          variant: 'error',
        });
      }
    },
    [jobById, patchWorkSession, syncPartsRequest, enqueueSnackbar],
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

    );

  }, [displayItem]);



  useEffect(() => {
    if (isLoading || authLoading) return;
    if (appliedInitialSelectionRef.current) return;

    if (navState?.selectJobId) {
      const match = jobs.find((j) => j.id === navState.selectJobId);
      if (match) {
        setSelectedRowKey(tarsJobRowKey(match));
        appliedInitialSelectionRef.current = true;
        focusScanInput();
        window.history.replaceState({}, document.title);
      }
      return;
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
  }, [isLoading, authLoading, jobs, benchJobs, navState?.selectJobId, focusScanInput, currentUserId]);

  const actionsBusy =
    checkIn.isPending
    || moveBack.isPending
    || holdJob.isPending
    || completeJob.isPending;



  const timerBusy = startTimer.isPending || pauseTimer.isPending || adjustTimer.isPending || timerSwitchDialog != null;

  const runWithTimerGuard = useCallback(
    (targetJob: RestorationJobDTO, action: TimerGuardAction, proceed: () => void | Promise<void>) => {
      const activeRunning = myRunningRestorationJob(jobs, currentUserId);
      if (!activeRunning || tarsJobRowKey(activeRunning) === tarsJobRowKey(targetJob)) {
        void proceed();
        return;
      }
      const key = timerGuardKey(action, tarsJobRowKey(targetJob));
      if (timerSwitchAckRef.current.has(key)) {
        void (async () => {
          await pauseTimer.mutateAsync(activeRunning.id);
          await proceed();
        })();
        return;
      }
      setTimerSwitchDialog({
        runningJob: activeRunning,
        targetJob,
        action,
        onConfirm: async () => {
          timerSwitchAckRef.current.add(key);
          setTimerSwitchDialog(null);
          await pauseTimer.mutateAsync(activeRunning.id);
          await proceed();
          focusScanInput();
        },
      });
    },
    [jobs, currentUserId, pauseTimer, focusScanInput],
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
        navigate('/restoration/queue', {
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
  }, [benchScanInput, benchJobs, pendingJobs, queueJobs, handleCheckIn, navigate, focusScanInput]);



  const updateWorkSession = useCallback(
    async (jobId: number, session: TarsWorkSession) => {
      if (displayJob?.id === jobId) {
        await replaceWorkSessionImmediate(session);
        return;
      }
      await persistWorkSession(jobId, session);
    },
    [displayJob?.id, persistWorkSession, replaceWorkSessionImmediate],
  );



  const selectDirectionGrade = useCallback(

    async (jobId: number, grade: string) => {

      const job = jobById.get(jobId);

      if (!job) return;

      const session = (job.work_session as unknown as TarsWorkSession | undefined) ?? createEmptyWorkSession('bench');

      await updateWorkSession(jobId, { ...session, selectedGrade: grade });

    },

    [jobById, updateWorkSession],

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



  const handleHoldSubmit = async (info: Omit<TarsPendingInfo, 'pendingStartedAt'> & { pendingStartedAt?: string }) => {
    if (!selectedJob) return;

    if (holdDialogMode === 'update') {
      const session = (selectedJob.work_session as unknown as TarsWorkSession | undefined) ?? createEmptyWorkSession('pending');

      await updateWorkSession(selectedJob.id, {
        ...session,
        workState: 'pending',
        pending: {
          reason: info.reason,
          notes: info.notes,
          storageLocation: info.storageLocation,
          expectedResumeAt: info.expectedResumeAt ?? '',
          pendingStartedAt: info.pendingStartedAt ?? selectedJob.pending_started_at ?? new Date().toISOString(),
        },
      });

      setHoldOpen(false);
      enqueueSnackbar('Pending info updated', { variant: 'success' });
      focusScanInput();
      return;
    }

    try {
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

  const handleSelectRailJob = useCallback(
    (job: RestorationJobDTO) => {
      setSelectedRowKey(tarsJobRowKey(job));
      if (railLayout === 'drawer') {
        setSelectionDrawerOpen(false);
      } else {
        focusScanInput();
      }
    },
    [focusScanInput, railLayout],
  );

  const queueItemCount = queueJobs.length + benchJobs.length + pendingJobs.length;

  const railPanel = (
    <Stack
      spacing={0.65}
      sx={{
        minHeight: 0,
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        p: railLayout === 'drawer' ? 1 : 0,
        boxSizing: 'border-box',
      }}
    >
      <Card sx={{ bgcolor: 'grey.900', color: 'grey.100', flexShrink: 0 }}>
        <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
          <Stack spacing={0.75}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <QrCodeScanner fontSize="small" />
              <Typography variant="caption" fontWeight={800}>
                Scan item tag
              </Typography>
            </Stack>
            <TextField
              fullWidth
              size="small"
              placeholder="Scan SKU..."
              value={benchScanInput}
              onChange={(e) => setBenchScanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitBenchScan();
              }}
              slotProps={{
                input: {
                  inputRef: scanInputRef,
                  sx: {
                    fontFamily: 'monospace',
                    bgcolor: 'grey.800',
                    color: 'grey.100',
                    '& fieldset': { border: 'none' },
                  },
                },
              }}
            />
          </Stack>
        </CardContent>
      </Card>

      <TarsWorkstationRail
        queueJobs={queueJobs}
        benchJobs={benchJobs}
        pendingJobs={pendingJobs}
        selectedRowKey={selectedRowKey}
        runningRowKey={runningRowKey}
        activeBenchRowKey={activeBenchRowKey}
        collapsed={collapsedSections}
        railWidth={railLayout === 'drawer' ? selectionDrawerWidth : railWidth}
        onToggleSection={toggleRailSection}
        onSelectJob={handleSelectRailJob}
      />
    </Stack>
  );

  const emptySelectionMessage =
    railLayout === 'drawer'
      ? 'Open Item list and pick an item, or scan a tag to start work.'
      : 'Select an item from the rail, or scan a tag to start work.';
  const partsListCount =
    displayItem?.workSession ? collectSessionParts(displayItem.workSession).length : 0;
  const partsListLabel = displayItem?.skuLabel ?? displayItem?.sku;

  const workstationMain =
    displayItem && evaluation && displayJob ? (
    <>
      {showIdleTimerWarning && !isPendingSelected ?
        <Alert severity="warning" sx={{ py: 0.75, flexShrink: 0 }}>
          This item has been on the bench for a while with no timer time recorded. Start the timer when work begins.
        </Alert>
      : null}

      <Box sx={{ flexShrink: 0, minWidth: 0, width: '100%' }}>
        <TarsBenchItemCard
          item={displayItem}
          isSelected={Boolean(selectedJob)}
          timerItemStatus={selectedTimerItemStatus}
          showActions={Boolean(selectedJob)}
          actionsBusy={actionsBusy || checkIn.isPending}
          onCheckIn={
            isQueueSelected && selectedJob && !selectedJob.needs_setup
              ? () => void handleCheckIn(selectedJob, { startTimer: false })
              : undefined
          }
          onMoveBack={selectedJob?.stage === 'bench' ? () => void handleMoveBack() : undefined}
          onHold={
            selectedJob?.stage === 'bench'
              ? () => {
                  runWithTimerGuard(selectedJob, 'hold', () => {
                    setHoldDialogMode('new');
                    setHoldOpen(true);
                  });
                }
              : undefined
          }
          onDone={
            selectedJob?.stage === 'bench'
              ? () => {
                  runWithTimerGuard(selectedJob, 'done', () => setDoneOpen(true));
                }
              : undefined
          }
          onResume={
            isPendingSelected && selectedJob
              ? () => void handleCheckIn(selectedJob)
              : undefined
          }
        />
      </Box>

      {isQueueSelected && selectedJob ?
        <>
          <Box sx={{ flexShrink: 0, minWidth: 0, width: '100%' }}>
            <TarsGradeDirectionCards directions={evaluation.directions} readOnly />
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto' }}>
            <TarsQueuePreviewContent job={selectedJob} />
          </Box>
        </>
      : <>
          <Box sx={{ flexShrink: 0, minWidth: 0, width: '100%' }}>
            <TarsGradeDirectionCards
              directions={evaluation.directions}
              readOnly={isPendingSelected}
              onSelect={
                isPendingSelected
                  ? undefined
                  : (grade) => {
                      void selectDirectionGrade(displayJob.id, grade);
                    }
              }
            />
          </Box>

          <Card
            variant="outlined"
            sx={{
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <CardContent
              sx={{
                p: 1,
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                scrollbarGutter: 'stable',
                '&:last-child': { pb: 1 },
              }}
            >
              <TarsActionLogPanel
                session={displayItem.workSession ?? createEmptyWorkSession(isPendingSelected ? 'pending' : 'bench')}
                selectedGrade={displayItem.workSession?.selectedGrade ?? null}
                readOnly={isPendingSelected}
                onSessionChange={replaceWorkSession}
              />
            </CardContent>
          </Card>
        </>
      }
    </>
  ) : null;



  if (isLoading) {

    return (

      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

        <CircularProgress size={32} />

      </Box>

    );

  }



  return (

    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
          alignItems: 'center',
          gap: 1,
          mb: 0.25,
          minHeight: 42,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={0.75} minWidth={0}>
          {railLayout === 'drawer' ?
            <>
              <Tooltip title={`Item list (${queueItemCount})`}>
                <IconButton
                  size="small"
                  aria-label="Open item list"
                  onClick={() => setSelectionDrawerOpen(true)}
                  sx={{ flexShrink: 0 }}
                >
                  <Menu fontSize="small" />
                </IconButton>
              </Tooltip>
              <Typography variant="h5" fontWeight={600} noWrap>
                Item list
              </Typography>
            </>
          : <Typography variant="h5" fontWeight={600} noWrap>
              TARS Workstation
            </Typography>
          }
        </Stack>
        <Box sx={{ justifySelf: 'center', alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>
          {headerTimerJob ?
            <TarsBenchTimer
              compact
              job={headerTimerJob}
              detached={timerDetached}
              busy={timerBusy}
              onStart={() => runWithTimerGuard(headerTimerJob, 'startTimer', () => void startTimer.mutateAsync(headerTimerJob.id))}
              onPause={() => void pauseTimer.mutateAsync(headerTimerJob.id)}
              onAdjustSeconds={(activeSeconds) => adjustTimer.mutateAsync({ id: headerTimerJob.id, activeSeconds })}
              onSelectRunningItem={
                timerDetached && headerTimerRowKey
                  ? () => {
                      setSelectedRowKey(headerTimerRowKey);
                      focusScanInput();
                    }
                  : undefined
              }
            />
          : null}
        </Box>
        {railLayout === 'drawer' ?
          <Stack direction="row" alignItems="center" spacing={0.75} justifyContent="flex-end" minWidth={0}>
            <Typography variant="h5" fontWeight={600} noWrap>
              Parts List
            </Typography>
            <Tooltip title={partsListCount > 0 ? `${partsListCount} parts` : 'Open parts list'}>
              <IconButton
                size="small"
                aria-label="Open parts list"
                onClick={() => setPartsDrawerOpen(true)}
                sx={{ flexShrink: 0 }}
              >
                <Menu fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        : <Box />}
      </Box>



      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          minWidth: 0,
        }}
      >
        {railLayout === 'split' ?
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: { xs: 'column', lg: 'row' },
              alignItems: 'stretch',
              gap: { xs: 1, lg: 0 },
            }}
          >
            <Stack
              spacing={0.65}
              sx={{
                minHeight: 0,
                height: { xs: 'auto', lg: '100%' },
                width: { xs: '100%', lg: railWidth },
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {railPanel}
            </Stack>

            <Box
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize queue panel"
              onMouseDown={handleRailResizeStart}
              sx={{
                display: { xs: 'none', lg: 'flex' },
                alignItems: 'center',
                justifyContent: 'center',
                width: 8,
                flexShrink: 0,
                cursor: 'col-resize',
                bgcolor: 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
                '&::after': {
                  content: '""',
                  width: 3,
                  height: 48,
                  borderRadius: 999,
                  bgcolor: '#cbd5e1',
                },
              }}
            />

            <Stack
              spacing={0.85}
              sx={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                overflow: 'hidden',
                pb: 0.5,
              }}
            >
              {!displayItem || !evaluation || !displayJob ?
                <Card variant="outlined">
                  <CardContent sx={{ py: 6, textAlign: 'center' }}>
                    <Typography color="text.secondary">{emptySelectionMessage}</Typography>
                    <Button size="small" sx={{ mt: 1 }} onClick={() => void refetch()}>
                      Refresh
                    </Button>
                  </CardContent>
                </Card>
              : <>
                  {workstationMain}
                </>
              }
            </Stack>
          </Box>
        : <>
            <Stack
              spacing={0.85}
              sx={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                overflow: 'hidden',
                pb: 0.5,
                width: '100%',
              }}
            >
              {!displayItem || !evaluation || !displayJob ?
                <Card variant="outlined">
                  <CardContent sx={{ py: 6, textAlign: 'center' }}>
                    <Typography color="text.secondary">{emptySelectionMessage}</Typography>
                    <Button size="small" sx={{ mt: 1, mr: 0.75 }} onClick={() => setSelectionDrawerOpen(true)}>
                      Item list
                    </Button>
                    <Button size="small" sx={{ mt: 1 }} onClick={() => void refetch()}>
                      Refresh
                    </Button>
                  </CardContent>
                </Card>
              : <>
                  {workstationMain}
                </>
              }
            </Stack>

            <Drawer
              anchor="left"
              open={selectionDrawerOpen}
              onClose={() => setSelectionDrawerOpen(false)}
              PaperProps={{
                sx: {
                  width: selectionDrawerWidth,
                  maxWidth: '92vw',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                },
              }}
            >
              <Box
                sx={{
                  px: 1.25,
                  py: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  flexShrink: 0,
                }}
              >
                <Typography variant="subtitle2" fontWeight={800}>
                  Item list
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Scan, queue, bench & pending
                </Typography>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
                {railPanel}
              </Box>
            </Drawer>

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
              <Box
                sx={{
                  px: 1.25,
                  py: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  flexShrink: 0,
                }}
              >
                <Typography variant="subtitle2" fontWeight={800}>
                  Parts List
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Parts from repair actions on this item
                </Typography>
              </Box>
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <TarsPartsListPanel
                  session={displayItem?.workSession}
                  itemLabel={partsListLabel}
                  readOnly={isPendingSelected}
                  onSessionChange={replaceWorkSession}
                />
              </Box>
            </Drawer>
          </>
        }
      </Box>



      <TarsDoneDialog

        open={doneOpen}

        job={selectedJob?.stage === 'bench' ? selectedJob : null}

        evaluation={evaluation}

        onClose={closeDoneDialog}

        onSubmit={(payload) => void handleDoneSubmit(payload)}

        timerBusy={timerBusy}

        onTimerStart={() => {
          if (selectedJob) runWithTimerGuard(selectedJob, 'startTimer', () => void startTimer.mutateAsync(selectedJob.id));
        }}

        onTimerPause={() => {

          if (selectedJob?.stage === 'bench') void pauseTimer.mutateAsync(selectedJob.id);

        }}

      />



      {selectedJob && (selectedJob.stage === 'bench' || selectedJob.stage === 'pending') ?
        <TarsHoldDialog
          open={holdOpen}
          title={holdDialogMode === 'update' ? 'Update pending shelf' : 'Place on hold'}
          initial={displayItem?.workSession?.pending}
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


