/** Ad results dump (Dash #182): the categories-to-watch rules the dialog keeps. Weights sum to 100, or are ALL. */
import { AD_ALL, AD_SEP } from '../../../api/marketing.api';

export interface WeightRow {
  key: string;
  pct: string;
}

export function toRows(weights: Record<string, number>): WeightRow[] {
  if (!Object.keys(weights).length || AD_ALL in weights) return [];
  return Object.entries(weights).map(([key, pct]) => ({ key, pct: String(pct) }));
}

/** [] means ALL. */
export function fromRows(rows: WeightRow[]): Record<string, number> {
  if (!rows.length) return { [AD_ALL]: 100 };
  const out: Record<string, number> = {};
  rows.forEach((r) => {
    if (r.key) out[r.key] = (out[r.key] ?? 0) + (Number(r.pct) || 0);
  });
  return out;
}

export function weightTotal(rows: WeightRow[]): number {
  return rows.reduce((sum, r) => sum + (Number(r.pct) || 0), 0);
}

/** What stops a save, or '' when the weights are fine. */
export function weightProblem(rows: WeightRow[]): string {
  if (!rows.length) return '';
  if (rows.some((r) => !r.key)) return 'Pick a category on every row.';
  if (rows.some((r) => !/^\d+$/.test(r.pct.trim()) || Number(r.pct) <= 0)) return 'Each category needs a whole percent.';
  if (new Set(rows.map((r) => r.key)).size !== rows.length) return 'A category is there twice.';
  const total = weightTotal(rows);
  return total === 100 ? '' : `The categories add up to ${total}%. Make them 100%, or watch ALL.`;
}

/** Every category and "Category › Subcategory" the owner can pick. */
export function weightOptions(categories: { name: string; subcategories: string[] }[]): string[] {
  return categories
    .filter((c) => !c.name.startsWith('Mixed lots'))
    .flatMap((c) => [c.name, ...c.subcategories.map((s) => `${c.name}${AD_SEP}${s}`)]);
}

/** A new row takes what is left of 100. */
export function addRow(rows: WeightRow[]): WeightRow[] {
  return [...rows, { key: '', pct: String(Math.max(0, 100 - weightTotal(rows))) }];
}

/** "Toys & games › Board games & puzzles" reads as "Board games & puzzles". */
export function shortKey(key: string): string {
  if (key === AD_ALL) return 'Whole store';
  return key.split(AD_SEP).pop() ?? key;
}
