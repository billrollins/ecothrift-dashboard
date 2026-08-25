import { parseMoneyOpt } from './tarsMoney';
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
  return grades.every((g) => parseMoneyOpt(values[g]) != null);
}

export function gradesForScale(scale: string, scales: Record<string, string[]>): string[] {
  return scales[scale] ?? [];
}

export function emptyValuesForScale(
  _scale: string,
  _scales: Record<string, string[]>,
  prev: Record<string, number> = {},
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(prev)) {
    const amount = parseMoneyOpt(value);
    if (amount != null) next[key] = amount;
  }
  return next;
}

export function fmtUsd(n: number): string {
  const rounded = Math.round(n);
  const prefix = rounded < 0 ? '-$' : '$';
  return prefix + Math.abs(rounded).toLocaleString('en-US');
}

/** One number when the ends match; otherwise "x to y". */
export function fmtUsdRange(min: number, max: number): string {
  if (Math.abs(max - min) < 0.005) return fmtUsd(min);
  return `${fmtUsd(min)} to ${fmtUsd(max)}`;
}

export function fmtProfit(n: number | null): string {
  if (n === null) return '-';
  return fmtUsd(n);
}

export { TARS_GRADE_SCALES as defaultScales };
