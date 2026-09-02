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

const BENCH_DISPOSITION_LABELS: Record<string, string> = {
  processing: 'Processing',
  storage: 'Storage',
  salvage: 'Salvage',
  online_sales: 'Online Sales',
};

/** Where a finished item actually went, as said on the Done list. */
export function benchDispositionLabel(id: string): string {
  return BENCH_DISPOSITION_LABELS[id] ?? destinationLabel(id);
}

export type DestinationPaint = {
  bgcolor: string;
  border: string;
  color: string;
  strong: string;
  onStrong: string;
};

/**
 * A glanceable colour per destination, shared by the closed chip and the menu.
 *
 * Unset stays the yellow "needs a pick" wash. A chosen location gets a pale
 * tint of its own so Shelf, Online Sales and Storage read at a glance without
 * shouting.
 */
const DESTINATION_PAINT: Record<string, DestinationPaint> = {
  shelf: { bgcolor: '#e8f5e9', border: '#81c784', color: '#1b5e20', strong: '#2e7d32', onStrong: '#ffffff' },
  online_sales: { bgcolor: '#e3f2fd', border: '#64b5f6', color: '#0d47a1', strong: '#1565c0', onStrong: '#ffffff' },
  storage: { bgcolor: '#eceff1', border: '#90a4ae', color: '#37474f', strong: '#546e7a', onStrong: '#ffffff' },
  staff_pick: { bgcolor: '#fff8e1', border: '#ffc107', color: '#e65100', strong: '#ef6c00', onStrong: '#ffffff' },
  processing: { bgcolor: '#e0f2f1', border: '#4db6ac', color: '#00695c', strong: '#00897b', onStrong: '#ffffff' },
  salvage: { bgcolor: '#fce4ec', border: '#e57373', color: '#b71c1c', strong: '#c62828', onStrong: '#ffffff' },
};

export function destinationPaint(id: string): DestinationPaint | undefined {
  return DESTINATION_PAINT[id];
}

/**
 * Which list an item is in, and the colour that says so.
 *
 * Queue, Bench, Holding and Done hold the same kind of row, so the left edge
 * carries the distinction rather than the layout. Done stays until Processing
 * checks the item in.
 */
export const QUEUE_LISTS = [
  { id: 'queue', label: 'Queue', accent: '#2e7d32', stages: ['queued', 'sent'] },
  { id: 'bench', label: 'Bench', accent: '#1565c0', stages: ['bench'] },
  { id: 'holding', label: 'Holding', accent: '#c2410c', stages: ['pending'] },
  { id: 'done', label: 'Done', accent: '#6d4c41', stages: ['done'] },
] as const;

export type QueueListId = (typeof QUEUE_LISTS)[number]['id'];

export function queueListAccent(id: QueueListId): string {
  return QUEUE_LISTS.find((l) => l.id === id)?.accent ?? '#2e7d32';
}

export function queueListForStage(stage: string): QueueListId {
  const hit = QUEUE_LISTS.find((entry) => (entry.stages as readonly string[]).includes(stage));
  return hit?.id ?? 'queue';
}

/**
 * The spread between the best and worst a grade scale allows.
 *
 * Doing nothing is treated as the floor even when the item would really land
 * somewhere above it - this is a prioritising number, not an estimate. It says
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

/** Vendor retail on the job, when it is a real positive amount. */
export function jobRetail(job: Pick<RestorationJobDTO, 'retail'>): number | null {
  const n = Number(job.retail);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Dollars stored on the job → percent of retail, one decimal. */
export function dollarsToRetailPercent(dollars: number, retail: number): number {
  return Math.round((dollars / retail) * 1000) / 10;
}

/** Percent of retail → dollars stored on the job, cents. */
export function retailPercentToDollars(percent: number, retail: number): number {
  return Math.round((percent / 100) * retail * 100) / 100;
}

/** A saved grade price, including $0. Null means the grade is still blank. */
export function gradePrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/** The grades on the scale with no price against them yet. $0 is a price. */
export function missingGrades(job: RestorationJobDTO, scaleGrades: string[]): string[] {
  const values = job.grade_values ?? {};
  const grades = scaleGrades.length > 0 ? scaleGrades : Object.keys(values);
  return grades.filter((grade) => gradePrice(values[grade]) == null);
}

/** True once the item has everything it needs to go on a bench. */
export function isReadyForBench(job: RestorationJobDTO, scaleGrades: string[]): boolean {
  if (!job.scale) return false;
  return missingGrades(job, scaleGrades).length === 0;
}

/** When the clock started for this item: sent if it has been, else created.
 *  Done items wait from when they were finished, until Processing takes them. */
export function queuedSince(job: RestorationJobDTO): Date | null {
  const raw =
    job.stage === 'done'
      ? (job.dispositioned_at ?? job.sent_at ?? job.created_at)
      : (job.sent_at ?? job.created_at);
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
  if (hours == null) return '-';
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

export const QUEUE_SORT_FIELDS = [
  'item',
  'note',
  'destination',
  'scale',
  'prices',
  'stake',
  'waiting',
] as const;

export type QueueSortField = (typeof QUEUE_SORT_FIELDS)[number];
export type QueueSortDir = 'asc' | 'desc';
export type QueueSort = { field: QueueSortField; dir: QueueSortDir };

/** Oldest at the top. Clicking Waiting again flips to newest first. */
export const DEFAULT_QUEUE_SORT: QueueSort = { field: 'waiting', dir: 'desc' };

export function defaultDirForQueueField(field: QueueSortField): QueueSortDir {
  return field === 'waiting' || field === 'stake' ? 'desc' : 'asc';
}

/** Click a header: that column if it was not active, otherwise flip direction. */
export function nextQueueSort(current: QueueSort, clicked: QueueSortField): QueueSort {
  if (current.field === clicked) {
    return { field: clicked, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { field: clicked, dir: defaultDirForQueueField(clicked) };
}

function queueItemSku(job: RestorationJobDTO): string {
  return job.items?.[0]?.sku ?? job.sku ?? `Job ${job.id}`;
}

function displayedDestination(job: RestorationJobDTO): string {
  if (job.stage === 'done') {
    return benchDispositionLabel(job.bench_disposition ?? '') || job.bench_disposition || '';
  }
  return destinationLabel(job.intended_destination ?? '') || job.intended_destination || '';
}

function vacancy(a: RestorationJobDTO, b: RestorationJobDTO, field: QueueSortField): number {
  const missing = (job: RestorationJobDTO): boolean => {
    switch (field) {
      case 'note':
        return !(job.queue_note ?? '').trim();
      case 'destination':
        return !displayedDestination(job).trim();
      case 'scale':
        return !(job.scale ?? '').trim();
      case 'stake':
        return valuePotential(job) == null;
      case 'waiting':
        return queuedSince(job) == null;
      default:
        return false;
    }
  };
  const aMissing = missing(a);
  const bMissing = missing(b);
  if (aMissing === bMissing) return 0;
  return aMissing ? 1 : -1;
}

function pricesSortParts(
  job: RestorationJobDTO,
  scales: Record<string, string[]>,
): { missing: number; sum: number } {
  const scaleGrades = scales[job.scale] ?? [];
  const grades = scaleGrades.length > 0 ? scaleGrades : Object.keys(job.grade_values ?? {});
  const missing = missingGrades(job, grades).length;
  let sum = 0;
  for (const value of Object.values(job.grade_values ?? {})) {
    const priced = gradePrice(value);
    if (priced != null) sum += priced;
  }
  return { missing, sum };
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Ascending order of the value the column shows. Blanks are handled separately. */
function compareQueueField(
  a: RestorationJobDTO,
  b: RestorationJobDTO,
  field: QueueSortField,
  scales: Record<string, string[]>,
): number {
  switch (field) {
    case 'item':
      return compareText(queueItemSku(a), queueItemSku(b)) || compareText(a.name ?? '', b.name ?? '');
    case 'note':
      return compareText((a.queue_note ?? '').trim(), (b.queue_note ?? '').trim());
    case 'destination':
      return compareText(displayedDestination(a), displayedDestination(b));
    case 'scale':
      return compareText(a.scale ?? '', b.scale ?? '');
    case 'prices': {
      const aP = pricesSortParts(a, scales);
      const bP = pricesSortParts(b, scales);
      if (aP.missing !== bP.missing) return aP.missing - bP.missing;
      return aP.sum - bP.sum;
    }
    case 'stake':
      return (valuePotential(a) ?? 0) - (valuePotential(b) ?? 0);
    case 'waiting': {
      const aT = queuedSince(a)?.getTime() ?? 0;
      const bT = queuedSince(b)?.getTime() ?? 0;
      return bT - aT;
    }
  }
}

function ageThenId(a: RestorationJobDTO, b: RestorationJobDTO): number {
  const aSince = queuedSince(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bSince = queuedSince(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (aSince !== bSince) return aSince - bSince;
  return a.id - b.id;
}

/**
 * Oldest at the top unless a header has been clicked.
 *
 * Age is the standing order of the queue so nothing is buried by a newer item
 * that happens to be worth more. Clicking a column sorts by what that column
 * shows; equal values fall back to oldest-first.
 */
export function sortQueue(
  jobs: RestorationJobDTO[],
  scales: Record<string, string[]>,
  sort: QueueSort = DEFAULT_QUEUE_SORT,
): RestorationJobDTO[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...jobs].sort((a, b) => {
    const vacant = vacancy(a, b, sort.field);
    if (vacant !== 0) return vacant;
    const primary = compareQueueField(a, b, sort.field, scales);
    if (primary !== 0) return primary * dir;
    return ageThenId(a, b);
  });
}

/** Category, then brand. What the item is, under the name. */
export function itemKindLine(job: RestorationJobDTO): string {
  const parts = [job.category, job.brand].filter((part) => Boolean(part?.trim()));
  return parts.length > 0 ? parts.join(' · ') : '-';
}

/** First name on the floor. Full name / email stays on the API. */
export function benchOwnerGivenName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export type BenchOwnerLine = {
  kind: 'owner' | 'unclaimed' | 'none';
  label: string;
  aria: string;
};

/** Reserved on every Overview row so a name never shoves the card. */
export function benchOwnerLine(
  job: Pick<
    RestorationJobDTO,
    'stage' | 'bench_owner_id' | 'bench_owner_name' | 'bench_ownership_ambiguous'
  >,
): BenchOwnerLine {
  if (job.stage !== 'bench') {
    return { kind: 'none', label: '-', aria: 'Not on a bench' };
  }
  if (job.bench_ownership_ambiguous || job.bench_owner_id == null) {
    return { kind: 'unclaimed', label: 'Unclaimed', aria: 'Unclaimed bench' };
  }
  const given = benchOwnerGivenName(job.bench_owner_name) || 'Someone';
  return { kind: 'owner', label: given, aria: `On ${given}'s bench` };
}
