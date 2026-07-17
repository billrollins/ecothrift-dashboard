import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { TARS_IDLE_PROMPT_MS, useTarsTimerController } from './useTarsTimerController';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  pause: vi.fn(),
  adjust: vi.fn(),
  meaningful: vi.fn(),
}));

vi.mock('../../../hooks/useRestorationBench', () => ({
  useStartRestorationJobTimer: () => ({ mutateAsync: mocks.start, isPending: false }),
  usePauseRestorationJobTimer: () => ({ mutateAsync: mocks.pause, isPending: false }),
  useAdjustRestorationJobTimer: () => ({ mutateAsync: mocks.adjust, isPending: false }),
  useMarkRestorationJobMeaningfulAction: () => ({ mutateAsync: mocks.meaningful, isPending: false }),
}));

vi.mock('../../../hooks/useTimeClock', () => ({
  useCurrentEntry: () => ({
    data: { id: 7, on_break: false },
    isLoading: false,
  }),
}));

const runningJob = {
  id: 41,
  stage: 'bench',
  name: 'Bench item',
  sku: 'TARS-41',
  items: [{ sku: 'TARS-41' }],
  timer_is_running: true,
  active_seconds: 600,
  elapsed_seconds: 900,
  last_meaningful_active_seconds: 620,
  last_meaningful_action_label: 'Recorded test result',
} as RestorationJobDTO;

describe('useTarsTimerController idle confirmation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.start.mockReset().mockResolvedValue(runningJob);
    mocks.pause.mockReset().mockResolvedValue({
      ...runningJob,
      timer_is_running: false,
      elapsed_seconds: 900,
    });
    mocks.adjust.mockReset().mockResolvedValue(runningJob);
    mocks.meaningful.mockReset().mockResolvedValue(runningJob);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('pauses after five minutes even when query data rerenders', async () => {
    const { result, rerender } = renderHook(
      ({ job }) => useTarsTimerController(job),
      { initialProps: { job: runningJob } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TARS_IDLE_PROMPT_MS - 60_000);
    });
    rerender({ job: { ...runningJob, items: [...runningJob.items] } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(mocks.pause).toHaveBeenCalledWith({ id: 41, reason: 'idle_prompt' });
    expect(result.current.idlePrompt).toMatchObject({
      jobId: 41,
      keepThroughSeconds: 620,
      lastActionLabel: 'Recorded test result',
    });
  });

  it('resets the five-minute window after browser activity', async () => {
    const { result } = renderHook(() => useTarsTimerController(runningJob));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TARS_IDLE_PROMPT_MS - 30_000);
      window.dispatchEvent(new MouseEvent('mousemove'));
      await vi.advanceTimersByTimeAsync(TARS_IDLE_PROMPT_MS - 1);
    });
    expect(mocks.pause).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.idlePrompt?.jobId).toBe(41);
  });

  it('removes time after the durable meaningful-action baseline on No', async () => {
    const { result } = renderHook(() => useTarsTimerController(runningJob));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TARS_IDLE_PROMPT_MS);
    });

    await act(async () => {
      await result.current.resolveIdle(false);
    });

    expect(mocks.adjust).toHaveBeenCalledWith({
      id: 41,
      activeSeconds: 620,
      reason: 'idle_not_working',
    });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(result.current.idlePrompt).toBeNull();
  });
});
