/**
 * Scan finds an item. It does not check one in — except one rule that
 * trumps the rest: a queue item plus an empty bench goes on the bench.
 */
import { lookupRestorationScan } from '../../api/inventory.api';
import type {
  RestorationJobDTO,
  RestorationScanItemDTO,
  RestorationScanLookupDTO,
} from '../../types/inventory.types';
import { jobMatchesScan } from './tars/tarsJobAdapter';

export type RestorationScanFind =
  | { kind: 'job'; job: RestorationJobDTO }
  | { kind: 'item'; item: RestorationScanItemDTO }
  | { kind: 'none'; query: string };

export type BenchScanDecision =
  | { action: 'stay'; job: RestorationJobDTO }
  | { action: 'pickup'; job: RestorationJobDTO }
  | { action: 'overview'; jobId: number }
  | { action: 'lookup'; query: string };

export function isQueueStage(stage: string): boolean {
  return stage === 'queued' || stage === 'sent';
}

/** Empty bench + a queue item: scan puts it on the bench. This trumps find. */
export function shouldPickupOnScan(job: RestorationJobDTO, benchEmpty: boolean): boolean {
  return benchEmpty && isQueueStage(job.stage);
}

export async function fetchRestorationScanLookup(q: string): Promise<RestorationScanLookupDTO> {
  const { data } = await lookupRestorationScan(q);
  return data;
}

export async function resolveRestorationScan(
  query: string,
  jobs: RestorationJobDTO[],
  lookup: (q: string) => Promise<RestorationScanLookupDTO> = fetchRestorationScanLookup,
): Promise<RestorationScanFind> {
  const v = query.trim();
  const local = jobs.find((job) => jobMatchesScan(job, v));
  if (local) return { kind: 'job', job: local };
  const looked = await lookup(v);
  if (looked.found === 'job' && looked.job) return { kind: 'job', job: looked.job };
  if (looked.found === 'item' && looked.item) return { kind: 'item', item: looked.item };
  return { kind: 'none', query: v };
}

/** Bench scan: stay if it is already yours; empty bench + queue is pickup. */
export function decideBenchScan(
  query: string,
  myBenchJob: RestorationJobDTO | null | undefined,
  jobs: RestorationJobDTO[],
): BenchScanDecision {
  const v = query.trim();
  if (myBenchJob && jobMatchesScan(myBenchJob, v)) return { action: 'stay', job: myBenchJob };
  const local = jobs.find((job) => jobMatchesScan(job, v));
  if (local) {
    if (local.stage === 'bench') return { action: 'stay', job: local };
    if (shouldPickupOnScan(local, myBenchJob == null)) return { action: 'pickup', job: local };
    return { action: 'overview', jobId: local.id };
  }
  return { action: 'lookup', query: v };
}

export function axiosStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

export function isOccupiedBenchError(err: unknown): boolean {
  return axiosStatus(err) === 409;
}
