import type { CleanupJobState } from '../../../api/inventory.api';

export interface CleanupBanner {
  severity: 'success' | 'info' | 'warning' | 'error';
  message: string;
}

/** What to tell the person when an AI cleanup job ends. Null while it runs or before any job. */
export function finishedBanner(job: CleanupJobState): CleanupBanner | null {
  const saved = job.rows_saved ?? 0;
  switch (job.status) {
    case 'done': {
      const mc = job.match_candidates;
      return {
        severity: 'success',
        message:
          `Cleaned ${saved} row(s). All ${job.total_rows} row(s) are done.` +
          (mc ? ` Match candidates generated for ${mc.rows_with_candidates} row(s) (${mc.auto_selected} auto-selected).` : ''),
      };
    }
    case 'done_with_gaps':
      return {
        severity: 'warning',
        message:
          `Finished with gaps: ${saved} row(s) saved, ${job.remaining_rows} still uncleaned` +
          (job.failed_batches ? ` (${job.failed_batches} failed batch(es))` : '') +
          `.${job.last_error ? ` Last error: ${job.last_error}` : ''} Click Resume to retry just those rows.`,
      };
    case 'stopped':
      return { severity: 'info', message: `Stopped. ${saved} row(s) saved this run; ${job.remaining_rows} left. Click Resume to continue.` };
    case 'cancelled':
      return { severity: 'warning', message: job.message || 'Cleanup was undone while it ran, so it stopped.' };
    case 'failed':
      return { severity: 'error', message: `${job.message || 'The cleanup job failed.'}${job.last_error ? ` (${job.last_error})` : ''}` };
    default:
      return null;
  }
}
