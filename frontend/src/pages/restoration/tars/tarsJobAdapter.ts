import type { RestorationJobDTO } from '../../../types/inventory.types';
import { normalizeBenchPlan } from './tarsBenchPlan';
import { normalizeDecisionWork } from './tarsDecisionEngine';
import { createEmptyWorkSession } from './tarsWorkRollup';
import type { TarsItem, TarsDisplaySource } from './tarsTypes';
import { normalizePending } from './tarsHold';
import { normalizePurchaseSection } from './tarsPurchase';
import type {
  TarsPartLine,
  TarsPendingInfo,
  TarsWorkSession,
  TarsWorkState,
} from './tarsWorkTypes';

function normalizeSource(source: string | null): TarsDisplaySource {
  if (source === 'Amazon' || source === 'Walmart' || source === 'Target') return source;
  if (!source?.trim()) return 'Other' as TarsDisplaySource;
  const raw = source.trim();
  // Display-only value: don't mislabel unknown sources as a known retailer.
  return (raw.charAt(0).toUpperCase() + raw.slice(1)) as TarsDisplaySource;
}

function parseMoney(value: string | null | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function pendingFromJob(job: RestorationJobDTO): TarsPendingInfo | undefined {
  if (job.stage !== 'pending') return undefined;
  const raw = (job.work_session as { pending?: unknown } | null | undefined)?.pending;
  return normalizePending(
    raw,
    job.pending_reason ?? '',
    job.pending_notes ?? '',
    job.pending_storage_location ?? '',
    job.pending_started_at ?? '',
  );
}

export function normalizeWorkSession(
  value: unknown,
  fallbackWorkState: TarsWorkState = 'queue',
): TarsWorkSession {
  const empty = createEmptyWorkSession(fallbackWorkState);
  const raw = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Partial<TarsWorkSession>
    : {};
  const workState: TarsWorkState =
    raw.workState === 'bench' ||
    raw.workState === 'pending' ||
    raw.workState === 'done' ||
    raw.workState === 'returned'
      ? raw.workState
      : fallbackWorkState;
  return {
    workState,
    selectedGrade: typeof raw.selectedGrade === 'string' ? raw.selectedGrade : null,
    parts: Array.isArray(raw.parts)
      ? raw.parts.flatMap((part) => {
          if (!part || typeof part !== 'object') return [];
          const line = part as TarsPartLine;
          return [{ ...line, section: normalizePurchaseSection(line.section) }];
        })
      : [],
    orders: Array.isArray(raw.orders) ? raw.orders : [],
    gradePlans:
      typeof raw.gradePlans === 'object' && raw.gradePlans !== null && !Array.isArray(raw.gradePlans)
        ? raw.gradePlans
        : {},
    benchRows: Array.isArray(raw.benchRows) ? raw.benchRows : [],
    benchPlan: normalizeBenchPlan(raw.benchPlan),
    decisionWork: normalizeDecisionWork(raw.decisionWork ?? empty.decisionWork),
    pending: raw.pending,
  };
}

function mergeWorkSession(job: RestorationJobDTO): TarsWorkSession {
  const base = normalizeWorkSession(job.work_session, 'queue');
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
    benchPlan: base.benchPlan,
    decisionWork: base.decisionWork,
  };
}

export function jobSkuLabel(job: RestorationJobDTO): string {
  return job.items[0]?.sku ?? job.sku ?? `JOB-${job.id}`;
}

/** Stable row key for TARS lists - one row per physical item when stacks are expanded. */
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

export function isForeignBench(
  job: Pick<RestorationJobDTO, 'stage' | 'bench_owner_id'> | null | undefined,
  userId: number | undefined,
): boolean {
  return Boolean(
    job?.stage === 'bench' &&
      job.bench_owner_id != null &&
      userId != null &&
      job.bench_owner_id !== userId,
  );
}

/** Most recent on-bench job this user owns. */
export function myActiveBenchRestorationJob(
  benchJobs: RestorationJobDTO[],
  userId: number | undefined,
): RestorationJobDTO | null {
  if (userId == null) return null;
  let best: RestorationJobDTO | null = null;
  let bestStarted = 0;
  for (const job of benchJobs) {
    if (job.stage !== 'bench' || job.bench_owner_id !== userId) continue;
    const started = new Date(job.bench_started_at ?? job.updated_at).getTime();
    if (!Number.isFinite(started)) {
      if (best == null) best = job;
      continue;
    }
    if (started > bestStarted) {
      bestStarted = started;
      best = job;
    }
  }
  return best;
}
