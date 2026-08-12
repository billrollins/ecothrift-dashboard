/**
 * What the parts list adds up to, and what it is for.
 *
 * The count alone does not tell you whether to look: three washers and three
 * mainboards are the same number and a very different decision. The money is
 * the part that changes what you do, so it travels with the count.
 */
import type { TarsPartLine } from './tarsWorkTypes';

/** Statuses that mean the part is no longer part of the plan. */
const DROPPED = new Set(['skipped']);

export interface PartsSummary {
  /** How many part lines are still in the plan. */
  count: number;
  /** What they come to, at actual price where known and estimate otherwise. */
  cost: number;
}

/** The price a line is charged at: what it actually cost, else the guess. */
export function partLineCost(part: TarsPartLine): number {
  const unit = part.unitPriceActual > 0 ? part.unitPriceActual : part.unitPriceEstimate;
  const qty = Number.isFinite(part.qty) && part.qty > 0 ? part.qty : 1;
  return (Number.isFinite(unit) ? unit : 0) * qty;
}

export function summarizeParts(parts: TarsPartLine[] | undefined): PartsSummary {
  const live = (parts ?? []).filter((p) => !DROPPED.has(p.status));
  return {
    count: live.length,
    cost: live.reduce((sum, part) => sum + partLineCost(part), 0),
  };
}

/** The grades a part is for, ignoring anything blank. */
export function partGrades(part: TarsPartLine): string[] {
  return (part.grades ?? []).filter((g) => typeof g === 'string' && g.trim() !== '');
}

/**
 * Whether this part claims to buy the grade the item is already at.
 *
 * Worth pointing out, never worth refusing: parts are bought to move an item,
 * so naming where it already is usually means a mis-tap, but it can also mean
 * something real that the grade scale has no way to say.
 */
export function pointsAtCurrentGrade(part: TarsPartLine, currentGrade: string): boolean {
  if (!currentGrade) return false;
  return partGrades(part).includes(currentGrade);
}

/** Parts needed on the way to one grade. */
export function partsForGrade(parts: TarsPartLine[] | undefined, grade: string): TarsPartLine[] {
  return (parts ?? []).filter((p) => partGrades(p).includes(grade));
}

/** What the parts for one grade come to. */
export function partsCostForGrade(parts: TarsPartLine[] | undefined, grade: string): number {
  return partsForGrade(parts, grade).reduce((sum, part) => sum + partLineCost(part), 0);
}
