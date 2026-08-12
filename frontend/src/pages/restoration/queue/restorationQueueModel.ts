/**
 * What a queue card needs to know, derived once so the card only renders.
 *
 * The queue is read at a glance to decide what to pick up next, so everything
 * here answers one of two questions: how much is riding on this item, and how
 * long has it been sitting.
 */
import type { RestorationJobDTO } from '../../../types/inventory.types';

export const INTENDED_DESTINATIONS = [
  { id: 'shelf', label: 'Shelf' },
  { id: 'online_sales', label: 'Online Sales' },
  { id: 'storage', label: 'Storage' },
  { id: 'staff_pick', label: 'Staff Pick' },
] as const;

export type IntendedDestination = (typeof INTENDED_DESTINATIONS)[number]['id'];

export const DESTINATION_IDS = INTENDED_DESTINATIONS.map((d) => d.id) as readonly string[];

export function destinationLabel(id: string): string {
  return INTENDED_DESTINATIONS.find((d) => d.id === id)?.label ?? '';
}

/**
 * Which list an item is in, and the colour that says so.
 *
 * Queue, Bench and Holding hold the same kind of row and are edited the same
 * way, so the left edge carries the distinction rather than the layout.
 */
export const QUEUE_LISTS = [
  { id: 'queue', label: 'Queue', accent: '#0f8a7e', stages: ['queued', 'sent'] },
  { id: 'bench', label: 'Bench', accent: '#4f46e5', stages: ['bench'] },
  { id: 'holding', label: 'Holding', accent: '#b45309', stages: ['pending'] },
] as const;

export type QueueListId = (typeof QUEUE_LISTS)[number]['id'];

export function queueListAccent(id: QueueListId): string {
  return QUEUE_LISTS.find((l) => l.id === id)?.accent ?? '#0f8a7e';
}

/**
 * The spread between the best and worst a grade scale allows.
 *
 * Doing nothing is treated as the floor even when the item would really land
 * somewhere above it — this is a prioritising number, not an estimate. It says
 * how much is on the table, which is what decides whether an item is worth
 * picking up before another.
 */
export function valuePotential(job: RestorationJobDTO): number | null {
  const values = Object.values(job.grade_values ?? {}).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (values.length < 2) return null;
  return Math.max(...values) - Math.min(...values);
}

/** The grades on the scale with no price against them yet. */
export function missingGrades(job: RestorationJobDTO, scaleGrades: string[]): string[] {
  const values = job.grade_values ?? {};
  const grades = scaleGrades.length > 0 ? scaleGrades : Object.keys(values);
  return grades.filter((grade) => {
    const value = values[grade];
    return typeof value !== 'number' || !Number.isFinite(value);
  });
}

/** True once the item has everything it needs to go on a bench. */
export function isReadyForBench(job: RestorationJobDTO, scaleGrades: string[]): boolean {
  if (!job.scale) return false;
  return missingGrades(job, scaleGrades).length === 0;
}

/** When the clock started for this item: sent if it has been, else created. */
export function queuedSince(job: RestorationJobDTO): Date | null {
  const raw = job.sent_at ?? job.created_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function hoursWaiting(job: RestorationJobDTO, now: Date = new Date()): number | null {
  const since = queuedSince(job);
  if (!since) return null;
  return Math.max((now.getTime() - since.getTime()) / 3_600_000, 0);
}

/**
 * Hours below a day, whole days above it. Nobody reading a queue needs to know
 * an item has been waiting 74 hours; they need to know it has been three days.
 */
export function formatWaiting(job: RestorationJobDTO, now: Date = new Date()): string {
  const hours = hoursWaiting(job, now);
  if (hours == null) return '—';
  if (hours < 1) return 'just in';
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Waiting long enough to be worth noticing in a glance across the room. */
export function isStale(job: RestorationJobDTO, now: Date = new Date()): boolean {
  const hours = hoursWaiting(job, now);
  return hours != null && hours >= 72;
}

/**
 * Most worth picking up first.
 *
 * Items that cannot go on a bench sort to the top — not because they are urgent
 * but because they are the only ones a passer-by can fix, and they block
 * everything behind them. After that, the most money on the table wins, and age
 * breaks the tie so nothing sits forever.
 */
export function sortQueue(
  jobs: RestorationJobDTO[],
  scales: Record<string, string[]>,
): RestorationJobDTO[] {
  return [...jobs].sort((a, b) => {
    const aReady = isReadyForBench(a, scales[a.scale] ?? []);
    const bReady = isReadyForBench(b, scales[b.scale] ?? []);
    if (aReady !== bReady) return aReady ? 1 : -1;

    const aValue = valuePotential(a) ?? -1;
    const bValue = valuePotential(b) ?? -1;
    if (aValue !== bValue) return bValue - aValue;

    const aSince = queuedSince(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bSince = queuedSince(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aSince - bSince;
  });
}

/** One line of what Processing saw, for the card body. */
export function handoffSummary(job: RestorationJobDTO): string {
  const evidence = job.processing_handoff?.condition_evidence?.trim();
  if (evidence) return evidence;
  const parts = [job.brand, job.category].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'No handoff notes';
}
