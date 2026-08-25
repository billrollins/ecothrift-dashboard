/** In-dashboard restoration paths. The old studio lives at `tars-legacy`. */

export const RESTORATION_OVERVIEW_PATH = '/restoration/overview';
export const RESTORATION_BENCH_PATH = '/restoration/bench';
export const RESTORATION_PARTS_PATH = '/restoration/parts-requests';
export const RESTORATION_TARS_LEGACY_PATH = '/restoration/tars-legacy';

export function restorationOverviewPath(jobId?: number | null): string {
  if (jobId == null) return RESTORATION_OVERVIEW_PATH;
  return `${RESTORATION_OVERVIEW_PATH}?job=${jobId}`;
}

export function restorationOverviewAddPath(sku: string): string {
  return `${RESTORATION_OVERVIEW_PATH}?add=${encodeURIComponent(sku)}`;
}

export function restorationBenchPath(jobId?: number | null, pickup = false): string {
  const params = new URLSearchParams();
  if (jobId != null) params.set('job', String(jobId));
  if (pickup) params.set('pickup', '1');
  const qs = params.toString();
  return `${RESTORATION_BENCH_PATH}${qs ? `?${qs}` : ''}`;
}

/**
 * Old TARS Studio bookmarks: a job or an explicit bench view lands on the
 * in-dashboard bench; everything else lands on Overview.
 */
export function tarsStudioRedirectTarget(job: string | null, view: string | null): string {
  if (job || view === 'bench') {
    const next = new URLSearchParams();
    if (job) next.set('job', job);
    const qs = next.toString();
    return `${RESTORATION_BENCH_PATH}${qs ? `?${qs}` : ''}`;
  }
  return RESTORATION_OVERVIEW_PATH;
}
