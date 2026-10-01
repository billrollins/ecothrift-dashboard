import { describe, expect, it } from 'vitest';
import type { CleanupJobState } from '../../../api/inventory.api';
import { finishedBanner } from './cleanupJobBanner';

const job = (over: Partial<CleanupJobState>): CleanupJobState => ({
  status: 'done',
  total_rows: 50,
  cleaned_rows: 50,
  remaining_rows: 0,
  elapsed_seconds: 120,
  rows_saved: 50,
  ...over,
});

describe('finishedBanner', () => {
  it('says nothing while a job runs or before any job', () => {
    expect(finishedBanner(job({ status: 'running' }))).toBeNull();
    expect(finishedBanner(job({ status: 'stopping' }))).toBeNull();
    expect(finishedBanner(job({ status: 'idle' }))).toBeNull();
  });

  it('reports a clean finish with the match candidates', () => {
    const b = finishedBanner(job({ match_candidates: { rows_with_candidates: 12, auto_selected: 7 } as CleanupJobState['match_candidates'] }));
    expect(b?.severity).toBe('success');
    expect(b?.message).toContain('Cleaned 50 row(s)');
    expect(b?.message).toContain('12 row(s) (7 auto-selected)');
  });

  it('reports gaps with the last error and how to retry', () => {
    const b = finishedBanner(job({ status: 'done_with_gaps', remaining_rows: 6, rows_saved: 44, failed_batches: 2, last_error: 'Read timed out' }));
    expect(b?.severity).toBe('warning');
    expect(b?.message).toContain('6 still uncleaned (2 failed batch(es))');
    expect(b?.message).toContain('Read timed out');
    expect(b?.message).toContain('Resume');
  });

  it('reports a stop, an undo and a crash', () => {
    expect(finishedBanner(job({ status: 'stopped', remaining_rows: 20, rows_saved: 30 }))?.message).toContain('30 row(s) saved this run; 20 left');
    expect(finishedBanner(job({ status: 'cancelled', message: 'Cleanup was undone while it ran, so it stopped.' }))?.severity).toBe('warning');
    const failed = finishedBanner(job({ status: 'failed', message: 'The cleanup job crashed.', last_error: 'KeyError: x' }));
    expect(failed?.severity).toBe('error');
    expect(failed?.message).toContain('KeyError: x');
  });
});
