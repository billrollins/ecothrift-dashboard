/**
 * A line on the purchase list is Parts, Supplies, or FFE.
 *
 * Only Parts enter cost-to-repair. The other two still get bought and can
 * hold a job; they just do not enter WORTH or value-added.
 */
import type { TarsPartLine } from './tarsWorkTypes';
import type { PartsSummary } from './tarsPartsSummary';

export const PURCHASE_SECTIONS = ['ffe', 'supplies', 'parts'] as const;
export type PurchaseSection = (typeof PURCHASE_SECTIONS)[number];

export const PURCHASE_SECTION_LABELS: Record<PurchaseSection, string> = {
  ffe: 'FFE',
  supplies: 'Supplies',
  parts: 'Parts',
};

const DROPPED = new Set(['skipped']);

function lineCost(part: TarsPartLine): number {
  const unit = part.unitPriceActual > 0 ? part.unitPriceActual : part.unitPriceEstimate;
  const qty = Number.isFinite(part.qty) && part.qty > 0 ? part.qty : 1;
  return (Number.isFinite(unit) ? unit : 0) * qty;
}

function gradeChips(part: TarsPartLine): string[] {
  return (part.grades ?? []).filter((grade) => typeof grade === 'string' && grade.trim() !== '');
}

export function normalizePurchaseSection(value: unknown): PurchaseSection {
  return value === 'ffe' || value === 'supplies' || value === 'parts' ? value : 'parts';
}

export function isLivePurchaseLine(part: TarsPartLine): boolean {
  return !DROPPED.has(part.status);
}

/** A Parts line with no grade chips is for the repair as a whole. */
export function partAppliesToGrade(part: TarsPartLine, grade: string): boolean {
  const chips = gradeChips(part);
  return chips.length === 0 || chips.includes(grade);
}

export function partsLinesForRepairGrade(
  parts: TarsPartLine[] | undefined,
  grade: string,
): TarsPartLine[] {
  return (parts ?? []).filter(
    (part) =>
      isLivePurchaseLine(part) &&
      normalizePurchaseSection(part.section) === 'parts' &&
      partAppliesToGrade(part, grade),
  );
}

export function hasPartsLinesForGrade(parts: TarsPartLine[] | undefined, grade: string): boolean {
  return partsLinesForRepairGrade(parts, grade).length > 0;
}

export function summarizeBySection(parts: TarsPartLine[] | undefined): Record<PurchaseSection, PartsSummary> & {
  all: PartsSummary;
} {
  const empty = (): PartsSummary => ({ count: 0, cost: 0 });
  const bySection: Record<PurchaseSection, PartsSummary> = {
    parts: empty(),
    supplies: empty(),
    ffe: empty(),
  };
  const all = empty();
  for (const part of parts ?? []) {
    if (!isLivePurchaseLine(part)) continue;
    const cost = lineCost(part);
    const section = normalizePurchaseSection(part.section);
    bySection[section].count += 1;
    bySection[section].cost += cost;
    all.count += 1;
    all.cost += cost;
  }
  return { ...bySection, all };
}

export function sessionPartsFromJob(job: { work_session?: unknown } | null | undefined): TarsPartLine[] {
  const session = job?.work_session;
  if (!session || typeof session !== 'object' || Array.isArray(session)) return [];
  const parts = (session as { parts?: unknown }).parts;
  return Array.isArray(parts) ? (parts as TarsPartLine[]) : [];
}
