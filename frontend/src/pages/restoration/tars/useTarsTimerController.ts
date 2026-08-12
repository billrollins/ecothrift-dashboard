import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAdjustRestorationJobTimer,
  useMarkRestorationJobMeaningfulAction,
  usePauseRestorationJobTimer,
  useStartRestorationJobTimer,
} from '../../../hooks/useRestorationBench';
import { useCurrentEntry } from '../../../hooks/useTimeClock';
import type { RestorationJobDTO, TarsTimerMode } from '../../../types/inventory.types';

export const TARS_IDLE_PROMPT_MS = 5 * 60 * 1000;

export interface TarsIdlePrompt {
  jobId: number;
  itemLabel: string;
  elapsedAtPrompt: number;
  keepThroughSeconds: number;
  lastActionLabel: string;
  /** Wall-clock time the screen went quiet, so the question can be answered. */
  idleSince: string;
}

export function useTarsTimerController(job: RestorationJobDTO | null) {
  const startMutation = useStartRestorationJobTimer();
  const pauseMutation = usePauseRestorationJobTimer();
  const adjustMutation = useAdjustRestorationJobTimer();
  const meaningfulMutation = useMarkRestorationJobMeaningfulAction();
  const currentEntry = useCurrentEntry();
  const [idlePrompt, setIdlePrompt] = useState<TarsIdlePrompt | null>(null);
  const openingIdlePromptRef = useRef(false);
  const mountedRef = useRef(true);
  const jobRef = useRef(job);
  const currentEntryRef = useRef(currentEntry.data);
  const pauseTimerRef = useRef(pauseMutation.mutateAsync);
  const timerQueueRef = useRef<Promise<void>>(Promise.resolve());
  jobRef.current = job;
  currentEntryRef.current = currentEntry.data;
  pauseTimerRef.current = pauseMutation.mutateAsync;

  const serializeTimer = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const queued = timerQueueRef.current.catch(() => undefined).then(operation);
    timerQueueRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const canTrackTime = Boolean(currentEntry.data && !currentEntry.data.on_break);
  const hrLabel =
    currentEntry.isLoading ? 'Checking shift…'
    : !currentEntry.data ? 'Not clocked in'
    : currentEntry.data.on_break ? 'On break'
    : 'Clocked in';

  /**
   * Start the clock, optionally aimed at a grade.
   *
   * Aiming is the decision: pointing the clock at a grade is what records that
   * the grade was chosen, so there is no separate commit to forget.
   */
  const start = useCallback(async (aim?: { mode?: TarsTimerMode; grade?: string }) => {
    if (!job) return;
    if (!currentEntry.data) throw new Error('Clock in before starting restoration time.');
    if (currentEntry.data.on_break) throw new Error('End your break before resuming restoration time.');
    await serializeTimer(() => startMutation.mutateAsync({ id: job.id, ...aim }));
  }, [currentEntry.data, job, serializeTimer, startMutation]);

  const pause = useCallback(async () => {
    if (!job) return;
    await serializeTimer(() => pauseMutation.mutateAsync(job.id));
  }, [job, pauseMutation, serializeTimer]);

  const markMeaningful = useCallback(async (label: string) => {
    if (!job || job.stage !== 'bench') return;
    await serializeTimer(() => meaningfulMutation.mutateAsync({ id: job.id, label }));
  }, [job, meaningfulMutation, serializeTimer]);

  useEffect(() => {
    if (
      currentEntry.isLoading
      || !job?.timer_is_running
      || (currentEntry.data && !currentEntry.data.on_break)
      || pauseMutation.isPending
    ) {
      return;
    }
    void serializeTimer(
      () => pauseTimerRef.current({ id: job.id, reason: 'hr_state_sync' }),
    ).catch(() => undefined);
  }, [
    currentEntry.data,
    currentEntry.isLoading,
    job?.id,
    job?.timer_is_running,
    pauseMutation.isPending,
    serializeTimer,
  ]);

  useEffect(() => {
    if (!job?.timer_is_running || idlePrompt) return;
    let idleTimeout: number | undefined;
    const timerJobId = job.id;

    const openIdlePrompt = async () => {
      const activeJob = jobRef.current;
      if (
        !mountedRef.current
        || !activeJob?.timer_is_running
        || activeJob.id !== timerJobId
        || openingIdlePromptRef.current
      ) {
        return;
      }
      const entry = currentEntryRef.current;
      if (!entry || entry.on_break) return;
      openingIdlePromptRef.current = true;
      try {
        const paused = await serializeTimer(
          () => pauseTimerRef.current({ id: timerJobId, reason: 'idle_prompt' }),
        );
        if (!mountedRef.current || jobRef.current?.id !== timerJobId) return;
        setIdlePrompt({
          jobId: timerJobId,
          itemLabel: activeJob.items[0]?.sku ?? activeJob.sku ?? activeJob.name,
          elapsedAtPrompt: paused.elapsed_seconds,
          keepThroughSeconds: Math.min(
            paused.elapsed_seconds,
            activeJob.last_meaningful_active_seconds ?? activeJob.active_seconds,
          ),
          lastActionLabel: activeJob.last_meaningful_action_label || 'the last recorded action',
          idleSince: new Date(Date.now() - TARS_IDLE_PROMPT_MS).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          }),
        });
      } finally {
        openingIdlePromptRef.current = false;
      }
    };

    const reset = () => {
      if (idleTimeout != null) window.clearTimeout(idleTimeout);
      idleTimeout = window.setTimeout(() => void openIdlePrompt(), TARS_IDLE_PROMPT_MS);
    };
    const activityEvents: Array<keyof WindowEventMap> = [
      'keydown',
      'pointerdown',
      'mousemove',
      'touchstart',
    ];
    activityEvents.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();

    return () => {
      if (idleTimeout != null) window.clearTimeout(idleTimeout);
      activityEvents.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [
    Boolean(idlePrompt),
    job?.id,
    job?.timer_is_running,
    serializeTimer,
  ]);

  const resolveIdle = useCallback(async (worked: boolean) => {
    const prompt = idlePrompt;
    if (!prompt) return;
    if (worked) {
      if (!currentEntry.data || currentEntry.data.on_break) {
        setIdlePrompt(null);
        return;
      }
      await serializeTimer(() => startMutation.mutateAsync(prompt.jobId));
    } else {
      await serializeTimer(() => adjustMutation.mutateAsync({
        id: prompt.jobId,
        activeSeconds: prompt.keepThroughSeconds,
        reason: 'idle_not_working',
      }));
    }
    setIdlePrompt(null);
  }, [adjustMutation, currentEntry.data, idlePrompt, serializeTimer, startMutation]);

  return {
    currentEntry: currentEntry.data,
    canTrackTime,
    hrLabel,
    idlePrompt,
    start,
    pause,
    markMeaningful,
    resolveIdle,
    busy:
      startMutation.isPending
      || pauseMutation.isPending
      || adjustMutation.isPending
      || meaningfulMutation.isPending,
  };
}

