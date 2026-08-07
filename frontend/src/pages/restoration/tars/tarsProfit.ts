import {
  TARS_DEFAULT_HOURLY_RATE,
  TARS_DEFAULT_TIME_PREMIUM,
  TARS_GRADE_SCALES,
  TARS_PAYROLL_MULTIPLIER,
} from './tarsConstants';

export function effectiveLaborRate(
  hourlyRate = TARS_DEFAULT_HOURLY_RATE,
  timePremium = TARS_DEFAULT_TIME_PREMIUM,
): number {
  return hourlyRate * TARS_PAYROLL_MULTIPLIER * timePremium;
}

export function gradeValuesComplete(
  scale: string,
  values: Record<string, number>,
  scales: Record<string, string[]>,
): boolean {
  if (!scale) return false;
  const grades = gradesForScale(scale, scales);
  if (grades.length === 0) return false;
  return grades.every((g) => (values[g] ?? 0) > 0);
}

export function gradesForScale(scale: string, scales: Record<string, string[]>): string[] {
  return scales[scale] ?? [];
}

export function emptyValuesForScale(
  scale: string,
  scales: Record<string, string[]>,
  prev: Record<string, number> = {},
): Record<string, number> {
  const grades = gradesForScale(scale, scales);
  const next: Record<string, number> = {};
  for (const g of grades) next[g] = prev[g] ?? 0;
  return next;
}

export function fmtUsd(n: number): string {
  const rounded = Math.round(n);
  const prefix = rounded < 0 ? '-$' : '$';
  return prefix + Math.abs(rounded).toLocaleString('en-US');
}

export function fmtProfit(n: number | null): string {
  if (n === null) return '-';
  return fmtUsd(n);
}

export { TARS_GRADE_SCALES as defaultScales };
