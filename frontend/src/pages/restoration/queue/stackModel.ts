/**
 * Stacks: one job holding several units of the same product.
 *
 * Every decision on the job (destination, scale, prices, note) already covers
 * every unit, so a stack is just a job whose quantity is more than one. These
 * helpers plan splits and decide which cards sit together on a list.
 */
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { jobStake } from './restorationQueueModel';

export function isStack(job: Pick<RestorationJobDTO, 'quantity' | 'items'>): boolean {
  return Math.max(job.quantity ?? 0, job.items?.length ?? 0) > 1;
}

export function unitCount(job: Pick<RestorationJobDTO, 'quantity' | 'items'>): number {
  return Math.max(job.quantity ?? 0, job.items?.length ?? 0, 1);
}

/** What is riding on the whole stack: per-unit stake (done minus as-is, else the grade spread) times the units. */
export function stackStake(job: RestorationJobDTO): number | null {
  const each = jobStake(job);
  return each == null ? null : each * unitCount(job);
}

export type SplitMode = 'equal' | 'pull' | 'groupsOf';

export const SPLIT_MODES: ReadonlyArray<{ id: SplitMode; label: string; ask: string }> = [
  { id: 'equal', label: 'Equal groups', ask: 'How many groups?' },
  { id: 'pull', label: 'Pull out', ask: 'How many to pull out?' },
  { id: 'groupsOf', label: 'Groups of', ask: 'How many in each group?' },
];

export interface SplitPlan {
  /** Units that stay on this job. */
  keep: number[];
  /** Each becomes a new group. */
  groups: number[][];
}

/**
 * Turn a choice into groups of unit ids. The stack keeps the first group; the
 * rest are new. Picked units (ticked in the open stack) are what Pull out takes.
 * Returns null when the choice would not change anything.
 */
export function planSplit(
  unitIds: number[],
  mode: SplitMode,
  n: number,
  picked: number[] = [],
): SplitPlan | null {
  const total = unitIds.length;
  const count = Math.floor(n);
  if (total < 2 || !Number.isFinite(count) || count < 1) return null;

  if (mode === 'pull') {
    const chosen = picked.length > 0 ? unitIds.filter((id) => picked.includes(id)) : unitIds.slice(total - count);
    if (chosen.length < 1 || chosen.length >= total) return null;
    return { keep: unitIds.filter((id) => !chosen.includes(id)), groups: [chosen] };
  }

  const sizes: number[] = [];
  if (mode === 'equal') {
    if (count < 2 || count > total) return null;
    const base = Math.floor(total / count);
    const extra = total % count;
    for (let i = 0; i < count; i += 1) sizes.push(base + (i < extra ? 1 : 0));
  } else {
    if (count >= total) return null;
    for (let left = total; left > 0; left -= count) sizes.push(Math.min(count, left));
  }

  const chunks: number[][] = [];
  let at = 0;
  for (const size of sizes) {
    chunks.push(unitIds.slice(at, at + size));
    at += size;
  }
  return { keep: chunks[0], groups: chunks.slice(1) };
}

/** Sizes in the order they will show: the stack first, then the new groups. */
export function planSizes(plan: SplitPlan): number[] {
  return [plan.keep.length, ...plan.groups.map((g) => g.length)];
}

export type QueueEntry =
  | { kind: 'job'; job: RestorationJobDTO }
  | { kind: 'cluster'; key: string; jobs: RestorationJobDTO[]; family: boolean };

/**
 * Groups split from one stack, or loose jobs of the same product from the same
 * order, sit together where the first of them sorts. Only on the Queue, where
 * they can be stacked back.
 */
export function clusterQueue(ordered: RestorationJobDTO[], enabled: boolean): QueueEntry[] {
  if (!enabled) return ordered.map((job) => ({ kind: 'job', job }));
  const keyOf = (job: RestorationJobDTO): string | null => {
    if (job.stack_family != null) return `family:${job.stack_family}`;
    if (job.product_id == null || job.purchase_order_id == null) return null;
    return `same:${job.product_id}:${job.purchase_order_id}:${job.stage}`;
  };
  const members = new Map<string, RestorationJobDTO[]>();
  for (const job of ordered) {
    const key = keyOf(job);
    if (key == null) continue;
    members.set(key, [...(members.get(key) ?? []), job]);
  }
  const out: QueueEntry[] = [];
  const placed = new Set<string>();
  for (const job of ordered) {
    const key = keyOf(job);
    const group = key == null ? undefined : members.get(key);
    if (key == null || group == null || group.length < 2) {
      out.push({ kind: 'job', job });
      continue;
    }
    if (placed.has(key)) continue;
    placed.add(key);
    out.push({ kind: 'cluster', key, jobs: group, family: key.startsWith('family:') });
  }
  return out;
}

/** Groups of a family that are on other tabs, by stage. */
export function familyElsewhere(
  family: number,
  allJobs: RestorationJobDTO[],
  shownIds: Set<number>,
): RestorationJobDTO[] {
  return allJobs.filter((job) => job.stack_family === family && !shownIds.has(job.id));
}

/** Combine needs one stage; groups split from a sent stack may sit beside queued ones. */
export function combinable(jobs: RestorationJobDTO[]): RestorationJobDTO[] {
  if (jobs.length < 2) return [];
  const stage = jobs[0].stage;
  const same = jobs.filter((job) => job.stage === stage);
  return same.length >= 2 ? same : [];
}
