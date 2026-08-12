/**
 * The grade table's arithmetic.
 *
 * Ashley owns what each grade sells for. Mike owns how likely it is, what parts
 * it needs, and how long the work takes. The app does one subtraction and one
 * division:
 *
 *     (( price at target − price now ) × probability − parts) ÷ hours of work left
 *
 * Only what is left counts. Minutes already spent — looking or working — never
 * enter this, because they cannot be recovered by any choice made now. They are
 * counted in what the item *earned*, which is a different question asked later.
 *
 * Investigation is charged to the item, never to a grade: one teardown informs
 * every row at once, so dividing it between them would be a fiction.
 */
import type { RestorationJobDTO } from '../../../types/inventory.types';

export interface TarsGradeEstimate {
  /** 0–100. Unset means unanswered, which computes as zero. */
  p?: number;
  /** Dollars of parts this grade needs. */
  parts?: number;
  /** Minutes of work left to reach this grade. */
  minutes?: number;
}

export interface TarsBenchPlan {
  /** The grade the item arrived at. Every row is measured against it. */
  startingGrade: string;
  estimates: Record<string, TarsGradeEstimate>;
}

export interface TarsGradeRow {
  grade: string;
  price: number | null;
  estimate: TarsGradeEstimate;
  /** Expected gain in dollars, parts already deducted. Null when unpriced. */
  expected: number | null;
  /** Expected gain per hour of work left. Null when unanswerable. */
  rate: number | null;
  /** How many of the three estimates are still unanswered. */
  toGo: number;
  /** True where this is the grade the item is already at. */
  isStart: boolean;
}

export const EMPTY_PLAN: TarsBenchPlan = { startingGrade: '', estimates: {} };

/**
 * A plan as it comes back from the server, checked field by field.
 *
 * The work session is a JSON blob, so nothing about its shape is guaranteed by
 * the time it returns. Anything unrecognised becomes "unanswered" rather than
 * being trusted into the arithmetic.
 */
export function normalizeBenchPlan(value: unknown): TarsBenchPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_PLAN;
  const raw = value as Partial<TarsBenchPlan>;
  const estimates: Record<string, TarsGradeEstimate> = {};
  if (raw.estimates && typeof raw.estimates === 'object' && !Array.isArray(raw.estimates)) {
    for (const [grade, estimate] of Object.entries(raw.estimates)) {
      if (!estimate || typeof estimate !== 'object') continue;
      const { p, parts, minutes } = estimate as TarsGradeEstimate;
      estimates[grade] = {
        ...(typeof p === 'number' && Number.isFinite(p) ? { p } : {}),
        ...(typeof parts === 'number' && Number.isFinite(parts) ? { parts } : {}),
        ...(typeof minutes === 'number' && Number.isFinite(minutes) ? { minutes } : {}),
      };
    }
  }
  return {
    startingGrade: typeof raw.startingGrade === 'string' ? raw.startingGrade : '',
    estimates,
  };
}

export function readBenchPlan(session: { benchPlan?: TarsBenchPlan } | null | undefined): TarsBenchPlan {
  return normalizeBenchPlan(session?.benchPlan);
}

/** How many of a row's three estimates are still unanswered. */
export function estimatesToGo(estimate: TarsGradeEstimate): number {
  // A grade judged impossible needs no parts or time, so nothing is outstanding.
  if (estimate.p === 0) return 0;
  if (estimate.p == null) return 3;
  return [estimate.parts, estimate.minutes].filter((v) => v == null).length;
}

function priceOf(job: RestorationJobDTO, grade: string): number | null {
  const value = job.grade_values?.[grade];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * One row's economics.
 *
 * A grade with no work left cannot produce a rate — dividing by zero hours
 * would report an infinite return on an item nobody has to touch — so its gain
 * is shown without one.
 */
export function evaluateGrade(
  job: RestorationJobDTO,
  plan: TarsBenchPlan,
  grade: string,
): TarsGradeRow {
  const price = priceOf(job, grade);
  const now = priceOf(job, plan.startingGrade);
  const estimate = plan.estimates[grade] ?? {};
  const isStart = Boolean(plan.startingGrade) && grade === plan.startingGrade;

  let expected: number | null = null;
  if (price != null && now != null) {
    const probability = (estimate.p ?? 0) / 100;
    expected = (price - now) * probability - (estimate.parts ?? 0);
  }

  const minutes = estimate.minutes ?? 0;
  const rate = expected != null && minutes > 0 ? expected / (minutes / 60) : null;

  return { grade, price, estimate, expected, rate, toGo: estimatesToGo(estimate), isStart };
}

/**
 * Every grade on the scale, best rate first.
 *
 * The starting grade sinks to the bottom: it is the datum, not a destination.
 * Rows that cannot yet be rated follow the ones that can, so the ranked answer
 * is never buried under unanswered rows.
 */
export function buildGradeRows(
  job: RestorationJobDTO,
  plan: TarsBenchPlan,
  scaleGrades: string[],
): TarsGradeRow[] {
  const grades = scaleGrades.length > 0 ? scaleGrades : Object.keys(job.grade_values ?? {});
  return grades.map((grade) => evaluateGrade(job, plan, grade));
}

/**
 * The row worth doing, or null when nothing is rated yet.
 *
 * Found rather than sorted to the top. The rows stay in scale order so a grade
 * is always in the same place on the screen — a table that rearranges itself
 * every time an estimate changes cannot be learned, and the one row that
 * matters is easier to mark than to move.
 */
export function bestGrade(rows: TarsGradeRow[]): TarsGradeRow | null {
  let best: TarsGradeRow | null = null;
  for (const row of rows) {
    if (row.isStart || row.rate == null) continue;
    if (best?.rate == null || row.rate > best.rate) best = row;
  }
  return best;
}

export type RateBand = 'below-cost' | 'below-usual' | 'good' | 'unknown';

/**
 * Which of the three bands a rate falls in.
 *
 * The floor is what an hour costs; the benchmark is what an hour usually
 * returns. Between them the work pays but is worse than average, which only
 * matters when something better is waiting.
 */
export function rateBand(
  rate: number | null,
  floor: number,
  benchmark: number | null,
): RateBand {
  if (rate == null) return 'unknown';
  if (rate < floor) return 'below-cost';
  if (benchmark != null && rate < benchmark) return 'below-usual';
  return 'good';
}

export const PROBABILITY_CHOICES = [0, 10, 25, 50, 75, 90, 100];
export const PARTS_CHOICES = [0, 5, 10, 20, 40, 75, 150];
export const MINUTES_CHOICES = [5, 10, 15, 30, 45, 60, 90, 120];
