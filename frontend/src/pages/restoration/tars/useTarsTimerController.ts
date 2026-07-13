import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAdjustRestorationJobTimer,
  useMarkRestorationJobMeaningfulAction,
  usePauseRestorationJobTimer,
  useStartRestorationJobTimer,
} from '../../../hooks/useRestorationBench';
import { useCurrentEntry } from '../../../hooks/useTimeClock';
import type { RestorationJobDTO } from '../../../types/inventory.types';

export const TARS_IDLE_PROMPT_MS = 5 * 60 * 1000;

export interface TarsIdlePrompt {
  jobId: number;
  itemLabel: string;
  elapsedAtPrompt: number;
  keepThroughSeconds: number;
  lastActionLabel: string;
}

export function useTarsTimerController(job: RestorationJobDTO | null) {
  const startMutation = useStartRestorationJobTimer();
  const pauseMutation = usePauseRestorationJobTimer();
  const adjustMutation = useAdjustRestorationJobTimer();
  const meaningfulMutation = useMarkRestorationJobMeaningfulAction();
  const currentEntry = useCurrentEntry();
  const [idlePrompt, setIdlePrompt] = useState<TarsIdlePrompt | null>(null);
  const openingIdlePromptRef = useRef(false);

  const canTrackTime = Boolean(currentEntry.data && !currentEntry.data.on_break);
  const hrLabel =
    currentEntry.isLoading ? 'Checking shift…'
    : !currentEntry.data ? 'Not clocked in'
    : currentEntry.data.on_break ? 'On break'
    : 'Clocked in';

  const start = useCallback(async () => {
    if (!job) return;
    if (!currentEntry.data) throw new Error('Clock in before starting restoration time.');
    if (currentEntry.data.on_break) throw new Error('End your break before resuming restoration time.');
    await startMutation.mutateAsync(job.id);
  }, [currentEntry.data, job, startMutation]);

  const pause = useCallback(async () => {
    if (!job) return;
    await pauseMutation.mutateAsync(job.id);
  }, [job, pauseMutation]);

  const markMeaningful = useCallback(async (label: string) => {
    if (!job || job.stage !== 'bench') return;
    await meaningfulMutation.mutateAsync({ id: job.id, label });
  }, [job, meaningfulMutation]);

  useEffect(() => {
    if (
      currentEntry.isLoading
      || !job?.timer_is_running
      || (currentEntry.data && !currentEntry.data.on_break)
      || pauseMutation.isPending
    ) {
      return;
    }
    void pauseMutation.mutateAsync({ id: job.id, reason: 'hr_state_sync' });
  }, [
    currentEntry.data,
    currentEntry.isLoading,
    job?.id,
    job?.timer_is_running,
    pauseMutation,
  ]);

  useEffect(() => {
    if (!job?.timer_is_running || idlePrompt) return;
    let idleTimeout: number | undefined;
    let disposed = false;

    const openIdlePrompt = async () => {
      if (disposed || openingIdlePromptRef.current) return;
      openingIdlePromptRef.current = true;
      try {
        const paused = await pauseMutation.mutateAsync({ id: job.id, reason: 'idle_prompt' });
        if (disposed) return;
        setIdlePrompt({
          jobId: job.id,
          itemLabel: job.items[0]?.sku ?? job.sku ?? job.name,
          elapsedAtPrompt: paused.elapsed_seconds,
          keepThroughSeconds: Math.min(
            paused.elapsed_seconds,
            job.last_meaningful_active_seconds ?? job.active_seconds,
          ),
          lastActionLabel: job.last_meaningful_action_label || 'the last recorded action',
        });
      } finally {
        openingIdlePromptRef.current = false;
      }
    };

    const reset = () => {
      if (disposed) return;
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
      disposed = true;
      if (idleTimeout != null) window.clearTimeout(idleTimeout);
      activityEvents.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [
    idlePrompt,
    job?.active_seconds,
    job?.id,
    job?.items,
    job?.last_meaningful_action_label,
    job?.last_meaningful_active_seconds,
    job?.name,
    job?.sku,
    job?.timer_is_running,
    pauseMutation,
  ]);

  const resolveIdle = useCallback(async (worked: boolean) => {
    const prompt = idlePrompt;
    if (!prompt) return;
    if (worked) {
      if (!currentEntry.data || currentEntry.data.on_break) {
        setIdlePrompt(null);
        return;
      }
      await startMutation.mutateAsync(prompt.jobId);
    } else {
      await adjustMutation.mutateAsync({
        id: prompt.jobId,
        activeSeconds: prompt.keepThroughSeconds,
        reason: 'idle_not_working',
      });
    }
    setIdlePrompt(null);
  }, [adjustMutation, currentEntry.data, idlePrompt, startMutation]);

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

