/**
 * The grade table's arithmetic.
 *
 * Ashley owns what each grade sells for. Mike owns how long the work takes.
 * Parts dollars come from the orders that target that grade — min to max
 * across paths, or one number when they agree. Each order is its own path.
 * The app does one subtraction and one division:
 *
 *     ( sells for this grade − Parts − min sells-for on the scale ) ÷ hours left
 *
 * Hours are minutes / 60. Only what is left counts. Minutes already spent —
 * looking or working — never enter this, because they cannot be recovered by
 * any choice made now. They are counted in what the item *earned*, which is a
 * different question asked later.
 *
 * Investigation is charged to the item, never to a grade: one teardown informs
 * every row at once, so dividing it between them would be a fiction.
 */
import type { RestorationJobDTO } from '../../../types/inventory.types';
import type { TarsPartsRange } from './tarsPartsOrders';

export interface TarsGradeEstimate {
  /** Minutes of work left to reach this grade. The only bench estimate. */
  minutes?: number;
  /** Kept when old sessions still have it. Ignored — parts come from orders. */
  parts?: number;
}

export interface TarsBenchPlan {
  /** The grade the item arrived at. Finish and value-added still record it. */
  startingGrade: string;
  /** The grade the item is at now. Empty until claimed; economics fall back to Original. */
  currentGrade: string;
  estimates: Record<string, TarsGradeEstimate>;
}

export interface TarsGradeRow {
  grade: string;
  price: number | null;
  estimate: TarsGradeEstimate;
  /** Expected gain at the cheaper parts path. Null when unpriced. */
  expected: number | null;
  /** Expected gain at the dearer parts path. Same as expected when there is one number. */
  expectedMax: number | null;
  /** $/hr at the cheaper parts path. bestGrade uses this. Null when unanswerable. */
  rate: number | null;
  /** $/hr at the dearer parts path. The WORTH band uses this. */
  rateLow: number | null;
  /** True where this is the grade the item is now. */
  isStart: boolean;
  /** Cheapest live-order path for this grade. $0 when none. */
  partsDollars: number;
  /** Dearest live-order path for this grade. */
  partsDollarsMax: number;
  /** True when a live order targets this grade. */
  partsFromList: boolean;
  /** True when the live-order paths disagree. */
  hasPartsRange: boolean;
}

export const EMPTY_PLAN: TarsBenchPlan = { startingGrade: '', currentGrade: '', estimates: {} };

/**
 * A plan as it comes back from the server, checked field by field.
 *
 * The work session is a JSON blob, so nothing about its shape is guaranteed by
 * the time it returns. Anything unrecognised becomes "unanswered" rather than
 * being trusted into the arithmetic.
 */
export function normalizeBenchPlan(value: unknown): TarsBenchPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_PLAN;
  const raw = value as Partial<TarsBenchPlan> & {
    estimates?: Record<string, { parts?: unknown; minutes?: unknown }>;
  };
  const estimates: Record<string, TarsGradeEstimate> = {};
  if (raw.estimates && typeof raw.estimates === 'object' && !Array.isArray(raw.estimates)) {
    for (const [grade, estimate] of Object.entries(raw.estimates)) {
      if (!estimate || typeof estimate !== 'object') continue;
      const { parts, minutes } = estimate;
      estimates[grade] = {
        ...(typeof parts === 'number' && Number.isFinite(parts) ? { parts } : {}),
        ...(typeof minutes === 'number' && Number.isFinite(minutes) ? { minutes } : {}),
      };
    }
  }
  return {
    startingGrade: typeof raw.startingGrade === 'string' ? raw.startingGrade : '',
    currentGrade: typeof raw.currentGrade === 'string' ? raw.currentGrade : '',
    estimates,
  };
}

/** Current if claimed, otherwise Original — the grade work is measured from. */
export function currentGradeOf(plan: TarsBenchPlan): string {
  return plan.currentGrade || plan.startingGrade;
}

/** The $0 grade, or the cheapest priced one. Last on the scale if nothing is priced. */
export function lowestValueGrade(job: RestorationJobDTO, scaleGrades: string[]): string {
  const grades = scaleGrades.length > 0 ? scaleGrades : Object.keys(job.grade_values ?? {});
  let pick = '';
  let pickPrice: number | null = null;
  for (const grade of grades) {
    const price = priceOf(job, grade);
    if (price == null) continue;
    if (pickPrice == null || price <= pickPrice) {
      pick = grade;
      pickPrice = price;
    }
  }
  return pick || grades[grades.length - 1] || '';
}

/** Empty Original/Current start at the floor. A claimed plan is left alone. */
export function withLowestValueStart(
  plan: TarsBenchPlan,
  job: RestorationJobDTO,
  scaleGrades: string[],
): TarsBenchPlan {
  if (plan.startingGrade || plan.currentGrade) return plan;
  const grade = lowestValueGrade(job, scaleGrades);
  if (!grade) return plan;
  return { ...plan, startingGrade: grade, currentGrade: grade };
}

/**
 * First claim on either empty selector fills both. After that they are independent.
 */
export function claimBenchGrade(
  plan: TarsBenchPlan,
  field: 'original' | 'current',
  grade: string,
): TarsBenchPlan {
  const next = grade.trim();
  if (!plan.startingGrade && !plan.currentGrade) {
    return { ...plan, startingGrade: next, currentGrade: next };
  }
  if (field === 'original') return { ...plan, startingGrade: next };
  return { ...plan, currentGrade: next };
}

export function readBenchPlan(session: { benchPlan?: TarsBenchPlan } | null | undefined): TarsBenchPlan {
  return normalizeBenchPlan(session?.benchPlan);
}

function priceOf(job: RestorationJobDTO, grade: string): number | null {
  const value = job.grade_values?.[grade];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Lowest finite Ashley price among the grades the table is showing. */
export function minSellsFor(job: RestorationJobDTO, grades: string[]): number | null {
  let min: number | null = null;
  for (const grade of grades) {
    const price = priceOf(job, grade);
    if (price == null) continue;
    if (min == null || price < min) min = price;
  }
  return min;
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
  minSells?: number | null,
  partsRange?: TarsPartsRange | null,
): TarsGradeRow {
  const price = priceOf(job, grade);
  const floor = minSells !== undefined
    ? minSells
    : minSellsFor(job, Object.keys(job.grade_values ?? {}));
  const estimate = plan.estimates[grade] ?? {};
  const nowAt = currentGradeOf(plan);
  const isStart = Boolean(nowAt) && grade === nowAt;
  const partsFromList = partsRange != null;
  const partsDollars = partsRange?.min ?? 0;
  const partsDollarsMax = partsRange?.max ?? partsDollars;
  const hasPartsRange = partsDollarsMax - partsDollars > 0.005;

  const expected = price != null && floor != null ? price - partsDollars - floor : null;
  const expectedMax = price != null && floor != null ? price - partsDollarsMax - floor : null;

  const minutes = estimate.minutes ?? 0;
  const hours = minutes / 60;
  const rate = expected != null && minutes > 0 ? expected / hours : null;
  const rateLow = expectedMax != null && minutes > 0 ? expectedMax / hours : null;

  return {
    grade,
    price,
    estimate,
    expected,
    expectedMax,
    rate,
    rateLow,
    isStart,
    partsDollars,
    partsDollarsMax,
    partsFromList,
    hasPartsRange,
  };
}

/**
 * Every grade on the scale, in the order the scale lists them.
 *
 * Rows stay in that order so a grade is always in the same place on the
 * screen. Ranking is a mark, not a sort.
 */
export function buildGradeRows(
  job: RestorationJobDTO,
  plan: TarsBenchPlan,
  scaleGrades: string[],
  partsRangeByGrade: Record<string, TarsPartsRange> = {},
): TarsGradeRow[] {
  const grades = scaleGrades.length > 0 ? scaleGrades : Object.keys(job.grade_values ?? {});
  const minSells = minSellsFor(job, grades);
  return grades.map((grade) =>
    evaluateGrade(
      job,
      plan,
      grade,
      minSells,
      Object.prototype.hasOwnProperty.call(partsRangeByGrade, grade) ? partsRangeByGrade[grade] : null,
    ),
  );
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

export const MINUTES_CHOICES = [0, 5, 10, 15, 30, 45, 60, 90, 120];
