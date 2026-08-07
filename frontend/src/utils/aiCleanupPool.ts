/**
 * Browser-side worker pool for web AI cleanup batches.
 *
 * Architecture: workspace/ai-cleanup-grok/FABLE_REVIEW_offline_vs_webui_ai_cleanup.md
 * § Fable 5 verdict - parallelism lives in the browser as many small POSTs
 * (concurrency default 4, cap 8), never inside one long Django request.
 * Mirrors runPool() + per-batch retry from the offline Grok harness.
 */

// Smaller batches stay under the 25s API timeout for slower models (e.g. gemini-3.5-flash).
export const AI_CLEANUP_DEFAULT_BATCH_SIZE = 10;
export const AI_CLEANUP_BATCH_SIZE_OPTIONS = [5, 10, 20] as const;
/** @deprecated Use AI_CLEANUP_DEFAULT_BATCH_SIZE - kept for tests/imports */
export const AI_CLEANUP_BATCH_SIZE = AI_CLEANUP_DEFAULT_BATCH_SIZE;
export const AI_CLEANUP_DEFAULT_CONCURRENCY = 4;
export const AI_CLEANUP_MAX_CONCURRENCY = 8;
export const AI_CLEANUP_MAX_BATCH_RETRIES = 2;

export interface CleanupBatchResult {
  rowIds: number[];
  rowsSaved: number;
  /** Server discarded these rows (bad echo / empty title); they stay uncleaned. */
  discarded: number;
  /** Generation bump (undo/cancel) - pool must stop. */
  cancelled: boolean;
  error?: string;
}

export interface CleanupPoolProgress {
  batchesDone: number;
  batchesTotal: number;
  rowsSaved: number;
  rowsDiscarded: number;
  failedBatches: number;
}

export interface CleanupPoolOutcome {
  completed: boolean;
  stoppedByGeneration: boolean;
  stoppedByPause: boolean;
  rowsSaved: number;
  rowsDiscarded: number;
  failedBatches: { rowIds: number[]; error: string }[];
}

export function partitionRowIds(rowIds: number[], batchSize: number = AI_CLEANUP_BATCH_SIZE): number[][] {
  const batches: number[][] = [];
  for (let i = 0; i < rowIds.length; i += batchSize) {
    batches.push(rowIds.slice(i, i + batchSize));
  }
  return batches;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run cleanup batches through a shared-index worker pool.
 *
 * - `runBatch` posts one batch and resolves to its result; it should throw on
 *   network/5xx errors (the pool retries up to AI_CLEANUP_MAX_BATCH_RETRIES with backoff).
 * - `isPaused()` is checked before each batch claim - in-flight batches finish,
 *   no new ones start (client-side pause; nothing to undo server-side).
 * - A `cancelled: true` result (ai_cleanup_generation bump) stops the whole pool.
 */
export async function runCleanupPool(
  batches: number[][],
  concurrency: number,
  runBatch: (rowIds: number[]) => Promise<CleanupBatchResult>,
  options?: {
    isPaused?: () => boolean;
    onProgress?: (progress: CleanupPoolProgress) => void;
    sleepFn?: (ms: number) => Promise<void>;
  },
): Promise<CleanupPoolOutcome> {
  const isPaused = options?.isPaused ?? (() => false);
  const doSleep = options?.sleepFn ?? sleep;
  const workers = Math.max(1, Math.min(concurrency, AI_CLEANUP_MAX_CONCURRENCY));

  let next = 0;
  let batchesDone = 0;
  let rowsSaved = 0;
  let rowsDiscarded = 0;
  let stopAll = false;
  let stoppedByGeneration = false;
  let stoppedByPause = false;
  const failedBatches: { rowIds: number[]; error: string }[] = [];

  const report = () => {
    options?.onProgress?.({
      batchesDone,
      batchesTotal: batches.length,
      rowsSaved,
      rowsDiscarded,
      failedBatches: failedBatches.length,
    });
  };

  async function worker(): Promise<void> {
    while (!stopAll) {
      if (isPaused()) {
        stoppedByPause = true;
        return;
      }
      const index = next;
      next += 1;
      if (index >= batches.length) return;
      const rowIds = batches[index];

      let lastError = '';
      let settled = false;
      for (let attempt = 0; attempt <= AI_CLEANUP_MAX_BATCH_RETRIES && !stopAll; attempt += 1) {
        try {
          const result = await runBatch(rowIds);
          if (result.cancelled) {
            stopAll = true;
            stoppedByGeneration = true;
            return;
          }
          rowsSaved += result.rowsSaved;
          rowsDiscarded += result.discarded;
          settled = true;
          break;
        } catch (err: unknown) {
          lastError = err instanceof Error ? err.message : String(err);
          if (attempt < AI_CLEANUP_MAX_BATCH_RETRIES) {
            await doSleep(1000 * 2 ** attempt);
          }
        }
      }
      if (!settled && !stopAll) {
        failedBatches.push({ rowIds, error: lastError || 'unknown error' });
      }
      batchesDone += 1;
      report();
    }
  }

  report();
  await Promise.all(Array.from({ length: workers }, () => worker()));

  // One salvage pass for likely-transient failures (timeouts/502s), not hard errors.
  const salvageable = failedBatches.some((f) =>
    /timeout|timed out|502|503|gateway|network|reset|econnreset/i.test(f.error),
  );
  if (!stoppedByGeneration && !stoppedByPause && failedBatches.length > 0 && salvageable) {
    const salvageIds = failedBatches.flatMap((f) => f.rowIds);
    failedBatches.length = 0;
    const salvageBatches = partitionRowIds(salvageIds);
    for (const rowIds of salvageBatches) {
      if (isPaused()) {
        stoppedByPause = true;
        failedBatches.push({ rowIds, error: 'paused during salvage' });
        continue;
      }
      let lastError = '';
      let settled = false;
      for (let attempt = 0; attempt <= AI_CLEANUP_MAX_BATCH_RETRIES && !settled; attempt += 1) {
        try {
          const result = await runBatch(rowIds);
          if (result.cancelled) {
            stopAll = true;
            stoppedByGeneration = true;
            return {
              completed: false,
              stoppedByGeneration: true,
              stoppedByPause: false,
              rowsSaved,
              rowsDiscarded,
              failedBatches,
            };
          }
          rowsSaved += result.rowsSaved;
          rowsDiscarded += result.discarded;
          settled = true;
        } catch (err: unknown) {
          lastError = err instanceof Error ? err.message : String(err);
          if (attempt < AI_CLEANUP_MAX_BATCH_RETRIES) {
            await doSleep(1000 * 2 ** attempt);
          }
        }
      }
      if (!settled) {
        failedBatches.push({ rowIds, error: lastError || 'unknown error' });
      }
      batchesDone += 1;
      report();
    }
  }

  return {
    // A late pause click after the last batch was claimed still counts as completed.
    completed: !stoppedByGeneration && batchesDone >= batches.length,
    stoppedByGeneration,
    stoppedByPause,
    rowsSaved,
    rowsDiscarded,
    failedBatches,
  };
}
