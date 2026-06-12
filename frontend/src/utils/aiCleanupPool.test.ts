import { describe, expect, it } from 'vitest';
import {
  AI_CLEANUP_MAX_BATCH_RETRIES,
  partitionRowIds,
  runCleanupPool,
  type CleanupBatchResult,
} from './aiCleanupPool';

const noSleep = () => Promise.resolve();

function okResult(rowIds: number[], overrides: Partial<CleanupBatchResult> = {}): CleanupBatchResult {
  return { rowIds, rowsSaved: rowIds.length, discarded: 0, cancelled: false, ...overrides };
}

describe('partitionRowIds', () => {
  it('splits into batches of the given size', () => {
    const ids = Array.from({ length: 25 }, (_, i) => i + 1);
    const batches = partitionRowIds(ids, 10);
    expect(batches.map((b) => b.length)).toEqual([10, 10, 5]);
    expect(batches.flat()).toEqual(ids);
  });

  it('returns empty for no ids', () => {
    expect(partitionRowIds([], 10)).toEqual([]);
  });
});

describe('runCleanupPool', () => {
  it('processes every batch exactly once and reports totals', async () => {
    const batches = partitionRowIds(Array.from({ length: 40 }, (_, i) => i + 1), 10);
    const seen: number[][] = [];
    const outcome = await runCleanupPool(batches, 4, async (rowIds) => {
      seen.push(rowIds);
      return okResult(rowIds);
    }, { sleepFn: noSleep });

    expect(outcome.completed).toBe(true);
    expect(outcome.rowsSaved).toBe(40);
    expect(seen.flat().sort((a, b) => a - b)).toEqual(batches.flat());
  });

  it('caps concurrent in-flight batches', async () => {
    const batches = partitionRowIds(Array.from({ length: 60 }, (_, i) => i + 1), 10);
    let inFlight = 0;
    let peak = 0;
    await runCleanupPool(batches, 4, async (rowIds) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return okResult(rowIds);
    }, { sleepFn: noSleep });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('retries a failing batch then records it as failed', async () => {
    const batches = [[1, 2], [3, 4]];
    const attempts: Record<string, number> = {};
    const outcome = await runCleanupPool(batches, 2, async (rowIds) => {
      const key = rowIds.join(',');
      attempts[key] = (attempts[key] ?? 0) + 1;
      if (key === '1,2') throw new Error('boom');
      return okResult(rowIds);
    }, { sleepFn: noSleep });

    expect(attempts['1,2']).toBe(AI_CLEANUP_MAX_BATCH_RETRIES + 1);
    expect(outcome.failedBatches).toEqual([{ rowIds: [1, 2], error: 'boom' }]);
    expect(outcome.completed).toBe(true);
    expect(outcome.rowsSaved).toBe(2);
  });

  it('stops the whole pool when a batch reports generation cancellation', async () => {
    const batches = partitionRowIds(Array.from({ length: 100 }, (_, i) => i + 1), 10);
    let calls = 0;
    const outcome = await runCleanupPool(batches, 1, async (rowIds) => {
      calls += 1;
      if (calls === 2) return okResult(rowIds, { rowsSaved: 0, cancelled: true });
      return okResult(rowIds);
    }, { sleepFn: noSleep });

    expect(outcome.stoppedByGeneration).toBe(true);
    expect(outcome.completed).toBe(false);
    expect(calls).toBe(2);
  });

  it('pause stops claiming new batches but counts finished work', async () => {
    const batches = partitionRowIds(Array.from({ length: 50 }, (_, i) => i + 1), 10);
    let done = 0;
    let paused = false;
    const outcome = await runCleanupPool(batches, 1, async (rowIds) => {
      done += 1;
      if (done === 2) paused = true;
      return okResult(rowIds);
    }, { isPaused: () => paused, sleepFn: noSleep });

    expect(outcome.stoppedByPause).toBe(true);
    expect(outcome.completed).toBe(false);
    expect(outcome.rowsSaved).toBe(20);
  });
});
