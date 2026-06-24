import type { TarsCostField, TarsItem, TarsPath, TarsPathEvaluation, TarsPathRow, TarsVerb } from './tarsTypes';
import {
  TARS_DEFAULT_HOURLY_RATE,
  TARS_DEFAULT_TIME_PREMIUM,
  TARS_GRADE_SCALES,
  TARS_PAYROLL_MULTIPLIER,
} from './tarsConstants';
import { costField, knownCost, resolveCostAmount } from './tarsCostUtils';

export function effectiveLaborRate(
  hourlyRate = TARS_DEFAULT_HOURLY_RATE,
  timePremium = TARS_DEFAULT_TIME_PREMIUM,
): number {
  return hourlyRate * TARS_PAYROLL_MULTIPLIER * timePremium;
}

export function resolvePathValue(path: TarsPath, item: TarsItem): number {
  const fromField = resolveCostAmount(path.value);
  if (fromField !== null) return fromField;
  return item.values[path.grade] ?? 0;
}

export function evaluatePaths(
  item: TarsItem,
  selectedIdx: number | undefined,
  hourlyRate: number,
  timePremium: number,
): TarsPathEvaluation {
  const eff = effectiveLaborRate(hourlyRate, timePremium);
  const rows: TarsPathRow[] = (item.paths ?? []).map((p, idx) => {
    const resolvedValue = resolvePathValue(p, item);
    const partsAmt = resolveCostAmount(p.parts);
    const hoursAmt = resolveCostAmount(p.hours);
    const hasUnknownCost = partsAmt === null || hoursAmt === null;
    const labor = hoursAmt !== null ? hoursAmt * eff : null;
    const cost = hasUnknownCost ? null : (partsAmt ?? 0) + (labor ?? 0);
    const profit = cost !== null ? resolvedValue - cost : null;
    return {
      ...p,
      idx,
      resolvedValue,
      labor,
      cost,
      profit,
      hasUnknownCost,
    };
  });

  const rankable = rows.filter((r) => r.profit !== null);
  let bestIdx = rows[0]?.idx ?? 0;
  if (rankable.length > 0) {
    bestIdx = rankable.reduce((best, r) => (r.profit! > (rows[best].profit ?? -Infinity) ? r.idx : best), rankable[0].idx);
  }

  const resolvedSelected =
    selectedIdx != null && rows.some((r) => r.idx === selectedIdx) ? selectedIdx : bestIdx;

  const maxAbsProfit = Math.max(
    1,
    ...rows.map((r) => (r.profit !== null ? Math.abs(r.profit) : 0)),
  );

  return { rows, bestIdx, selectedIdx: resolvedSelected, maxAbsProfit };
}

export function itemNeedsSetup(item: TarsItem, scales: Record<string, string[]>): boolean {
  if (!item.scale) return true;
  const grades = scales[item.scale] ?? [];
  if (grades.length === 0) return true;
  return !grades.every((g) => (item.values[g] ?? 0) > 0);
}

export function canSendItem(item: TarsItem, scales: Record<string, string[]>): boolean {
  return !itemNeedsSetup(item, scales);
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

export function syncPathValuesFromGrades(item: TarsItem): TarsItem {
  return {
    ...item,
    paths: item.paths.map((p) => ({
      ...p,
      value: knownCost(item.values[p.grade] ?? p.value.amount),
    })),
  };
}

function makePath(
  verb: TarsVerb,
  grade: string,
  parts: TarsCostField,
  hours: TarsCostField,
  valueAmount = 0,
): TarsPath {
  return {
    verb,
    grade,
    parts,
    hours,
    value: valueAmount > 0 ? knownCost(valueAmount) : costField('unknown', 0),
  };
}

export function fmtUsd(n: number): string {
  const rounded = Math.round(n);
  const prefix = rounded < 0 ? '-$' : '$';
  return prefix + Math.abs(rounded).toLocaleString('en-US');
}

export function fmtProfit(n: number | null): string {
  if (n === null) return '—';
  return fmtUsd(n);
}

export function createInitialMockItems(): TarsItem[] {
  const items: TarsItem[] = [
    {
      sku: 'TGT-4821',
      name: 'Xbox Controller',
      brand: 'Microsoft',
      productNumber: 'PRD-CTRL-1',
      source: 'Target',
      category: 'Electronics',
      condition: 'good',
      retail: 49.99,
      price: 19.99,
      stage: 'workstation',
      scale: 'Functional',
      values: { Working: 19.99, Repairable: 12, 'Parts-only': 5 },
      paths: [
        makePath('Test', 'Working', costField('zero', 0), costField('estimate', 0.2), 19.99),
        makePath('As-is', 'Repairable', costField('zero', 0), knownCost(0.1), 12),
        makePath('Salvage', 'Parts-only', costField('zero', 0), costField('estimate', 0.2), 5),
      ],
    },
    {
      sku: 'AMZ-7733',
      name: 'Claw hammer',
      brand: 'Amazon Basics',
      productNumber: 'B0DZ6HYYLT',
      source: 'Amazon',
      category: 'Building & Hardware',
      condition: 'used',
      retail: 19.99,
      price: 7.99,
      stage: 'sent',
      scale: 'Functional',
      values: { Working: 7.99, Repairable: 4, 'Parts-only': 1 },
      paths: [
        makePath('Test', 'Working', costField('zero', 0), knownCost(0.1), 7.99),
        makePath('As-is', 'Repairable', costField('zero', 0), knownCost(0.05), 4),
        makePath('Salvage', 'Parts-only', costField('zero', 0), knownCost(0.05), 1),
      ],
    },
    {
      sku: 'WMT-1290',
      name: 'Samsung Galaxy S8 phone case',
      brand: 'WM Vendor',
      model: 'Samsung Galaxy S8',
      upc: '76611962486',
      productNumber: '930837711-100010',
      source: 'Walmart',
      category: 'Cell Phone Accessories',
      condition: 'like_new',
      retail: 12.50,
      price: 4.99,
      stage: 'sent',
      scale: 'Condition',
      values: { New: 6, 'Like-new': 4.99, Good: 3.5, Fair: 2, Salvage: 0.5 },
      paths: [
        makePath('As-is', 'Like-new', costField('zero', 0), knownCost(0.05), 4.99),
        makePath('As-is', 'Good', costField('zero', 0), knownCost(0.05), 3.5),
        makePath('Salvage', 'Salvage', costField('zero', 0), knownCost(0.05), 0.5),
      ],
    },
    {
      sku: 'TGT-9015',
      name: 'Example product title',
      brand: 'Acme Toys',
      upc: '194735235797',
      productNumber: 'LPJY383340',
      source: 'Target',
      category: 'Toys',
      condition: 'new',
      retail: 49.99,
      price: 19.99,
      stage: 'intake',
      scale: 'Completeness',
      values: { Complete: 19.99, Incomplete: 9.99 },
      paths: [
        makePath('Test', 'Complete', costField('zero', 0), costField('estimate', 0.15), 19.99),
        makePath('As-is', 'Incomplete', costField('zero', 0), knownCost(0.05), 9.99),
      ],
    },
    {
      sku: 'WMT-3367',
      name: 'Mixer B',
      productNumber: 'PRD-WS-2',
      upc: '222',
      source: 'Walmart',
      category: 'Kitchen',
      condition: 'good',
      retail: 50,
      price: 18,
      stage: 'intake',
      scale: '',
      values: {},
      paths: [
        makePath('Repair', 'Working', costField('unknown', 0), costField('unknown', 0)),
        makePath('As-is', 'Repairable', costField('zero', 0), knownCost(0.1)),
        makePath('Salvage', 'Parts-only', costField('zero', 0), knownCost(0.2)),
      ],
    },
    {
      sku: 'AMZ-5540',
      name: 'Crayons bulk',
      brand: 'Crayola',
      source: 'Amazon',
      category: 'Toys',
      condition: 'good',
      retail: 12,
      price: 4.99,
      stage: 'done',
      scale: 'Completeness',
      values: { Complete: 4.99, Incomplete: 2 },
      paths: [
        makePath('As-is', 'Complete', costField('zero', 0), knownCost(0.05), 4.99),
        makePath('Salvage', 'Incomplete', costField('zero', 0), knownCost(0.05), 2),
      ],
      chosen: { verb: 'As-is', grade: 'Complete' },
    },
  ];
  return items.map(syncPathValuesFromGrades);
}

export { TARS_GRADE_SCALES as defaultScales };
