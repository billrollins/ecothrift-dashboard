/**
 * Live header money: what the move has already captured, and what is still
 * on the table if you keep going.
 *
 *     value added = sells(Current) − sells(Original) − Parts spent so far
 *     value left  = sells(best remaining) − sells(Current) − remaining Parts
 *                   (the dearer live-order path for that grade, or $0)
 *
 * Time-worth stays on the grade-table WORTH column. These two are dollars.
 */
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { currentGradeOf, type TarsBenchPlan } from './tarsBenchPlan';

function priceOf(job: RestorationJobDTO, grade: string): number | null {
  if (!grade) return null;
  const value = job.grade_values?.[grade];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scaleGradesOf(job: RestorationJobDTO, scaleGrades: string[]): string[] {
  return scaleGrades.length > 0 ? scaleGrades : Object.keys(job.grade_values ?? {});
}

/** Highest priced scale grade that is not Current. */
export function bestRemainingGrade(
  job: RestorationJobDTO,
  plan: TarsBenchPlan,
  scaleGrades: string[],
): string | null {
  const current = currentGradeOf(plan);
  let best: string | null = null;
  let bestPrice: number | null = null;
  for (const grade of scaleGradesOf(job, scaleGrades)) {
    if (grade === current) continue;
    const price = priceOf(job, grade);
    if (price == null) continue;
    if (bestPrice == null || price > bestPrice) {
      best = grade;
      bestPrice = price;
    }
  }
  return best;
}

export function valueAdded(
  job: RestorationJobDTO,
  plan: TarsBenchPlan,
  spentParts = 0,
): number | null {
  const original = priceOf(job, plan.startingGrade);
  const current = priceOf(job, currentGradeOf(plan));
  if (original == null || current == null) return null;
  return current - original - spentParts;
}

export function valueLeft(
  job: RestorationJobDTO,
  plan: TarsBenchPlan,
  scaleGrades: string[],
  remainingParts?: number,
): number | null {
  const current = priceOf(job, currentGradeOf(plan));
  if (current == null) return null;
  const remaining = bestRemainingGrade(job, plan, scaleGrades);
  if (remaining == null) return 0;
  const remainingPrice = priceOf(job, remaining);
  if (remainingPrice == null || remainingPrice <= current) return 0;
  const parts = remainingParts ?? 0;
  return remainingPrice - current - parts;
}
