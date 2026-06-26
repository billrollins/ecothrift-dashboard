import type { RestorationJobDTO } from '../../../types/inventory.types';
import { createEmptyWorkSession } from './tarsWorkRollup';
import type { TarsItem, TarsDisplaySource } from './tarsTypes';
import type { TarsPendingInfo, TarsPendingReason, TarsWorkSession } from './tarsWorkTypes';

function normalizeSource(source: string | null): TarsDisplaySource {
  if (source === 'Amazon' || source === 'Walmart' || source === 'Target') return source;
  return 'Target';
}

function parseMoney(value: string | null | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function pendingFromJob(job: RestorationJobDTO): TarsPendingInfo | undefined {
  if (job.stage !== 'pending' || !job.pending_reason) return undefined;
  return {
    reason: job.pending_reason as TarsPendingReason,
    notes: job.pending_notes ?? '',
    storageLocation: job.pending_storage_location ?? '',
    pendingStartedAt: job.pending_started_at ?? '',
  };
}

function mergeWorkSession(job: RestorationJobDTO): TarsWorkSession {
  const base = (job.work_session as Partial<TarsWorkSession> | undefined) ?? createEmptyWorkSession();
  const pending = pendingFromJob(job);
  const workState =
    job.stage === 'bench' ? 'bench'
    : job.stage === 'pending' ? 'pending'
    : job.stage === 'sent' ? 'queue'
    : base.workState ?? 'queue';

  return {
    workState,
    pending: pending ?? base.pending,
    selectedGrade: base.selectedGrade ?? null,
    parts: base.parts ?? [],
    orders: base.orders ?? [],
    gradePlans: base.gradePlans ?? {},
    benchRows: base.benchRows ?? [],
    benchStartedAt: base.benchStartedAt,
  };
}

export function jobSkuLabel(job: RestorationJobDTO): string {
  return job.items[0]?.sku ?? job.sku ?? `JOB-${job.id}`;
}

/** Stable row key for TARS lists — one row per physical item when stacks are expanded. */
export function tarsJobRowKey(job: RestorationJobDTO): string {
  const itemId = job.items[0]?.id;
  return itemId != null ? `${job.id}:${itemId}` : String(job.id);
}

/** Expand multi-item queue stacks into one restoration row per item for TARS. */
export function expandRestorationJobsForTars(jobs: RestorationJobDTO[]): RestorationJobDTO[] {
  const expanded: RestorationJobDTO[] = [];
  for (const job of jobs) {
    const items = job.items?.length ? job.items : [];
    if (job.quantity <= 1 || items.length <= 1) {
      expanded.push(job);
      continue;
    }
    for (const item of items) {
      expanded.push({
        ...job,
        quantity: 1,
        sku: item.sku,
        items: [item],
      });
    }
  }
  return expanded;
}

export function jobMatchesScan(job: RestorationJobDTO, scan: string): boolean {
  const v = scan.trim().toUpperCase();
  if (!v) return false;
  if (job.sku?.toUpperCase() === v) return true;
  return job.items.some((item) => item.sku.toUpperCase() === v);
}

export function restorationJobToTarsItem(job: RestorationJobDTO): TarsItem {
  const firstItem = job.items[0];
  return {
    jobId: job.id,
    sku: job.sku ?? `JOB-${job.id}`,
    skuLabel: jobSkuLabel(job),
    catalogItemId: firstItem?.id,
    productId: job.product_id ?? undefined,
    orderId: job.purchase_order_id ?? undefined,
    orderNumber: job.purchase_order_number ?? undefined,
    sentAt: job.sent_at ?? undefined,
    name: job.name,
    brand: job.brand,
    model: job.model,
    upc: job.upc,
    productNumber: job.product_number,
    source: normalizeSource(job.source),
    category: job.category,
    condition: job.condition,
    retail: parseMoney(job.retail),
    price: parseMoney(job.price),
    stage: job.stage as TarsItem['stage'],
    scale: job.scale,
    values: job.grade_values ?? {},
    workSession: mergeWorkSession(job),
  };
}

export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Always HH:MM:SS — for stopwatch display. */
export function formatStopwatch(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function liveElapsedSeconds(job: RestorationJobDTO, nowMs = Date.now()): number {
  let total = job.active_seconds ?? job.elapsed_seconds ?? 0;
  if (job.timer_is_running && job.timer_started_at) {
    const started = new Date(job.timer_started_at).getTime();
    if (Number.isFinite(started)) {
      total += Math.max(0, Math.floor((nowMs - started) / 1000));
    }
  }
  return total;
}

/** Timer ownership — active/running bench state is per user; queue rails are shared. */
export function isRestorationTimerOwnedByUser(
  job: RestorationJobDTO,
  userId: number | undefined,
): boolean {
  return userId != null && job.timer_started_by_id === userId;
}

export function myRunningRestorationJob(
  jobs: RestorationJobDTO[],
  userId: number | undefined,
): RestorationJobDTO | null {
  if (userId == null) return null;
  return jobs.find((j) => j.timer_is_running && j.timer_started_by_id === userId) ?? null;
}

/** Most recent on-bench job this user had a timer on (running or paused). */
export function myActiveBenchRestorationJob(
  benchJobs: RestorationJobDTO[],
  userId: number | undefined,
): RestorationJobDTO | null {
  if (userId == null) return null;
  let best: RestorationJobDTO | null = null;
  let bestStarted = 0;
  for (const job of benchJobs) {
    if (job.stage !== 'bench' || !job.timer_started_at || job.timer_started_by_id !== userId) continue;
    const started = new Date(job.timer_started_at).getTime();
    if (!Number.isFinite(started)) continue;
    if (started > bestStarted) {
      bestStarted = started;
      best = job;
    }
  }
  return best;
}
