import { describe, expect, it } from 'vitest';
import type { TarsPartLine } from './tarsWorkTypes';
import {
  hasPartsLinesForGrade,
  normalizePurchaseSection,
  partsLinesForRepairGrade,
  summarizeBySection,
} from './tarsPurchase';

function part(over: Partial<TarsPartLine> = {}): TarsPartLine {
  return {
    id: 'p1',
    partNumber: '',
    description: '',
    url: '',
    qty: 1,
    unitPriceEstimate: 0,
    unitPriceActual: 0,
    status: 'considering',
    procurementGroupId: null,
    grades: [],
    ...over,
  };
}

describe('purchase sections', () => {
  it('reads a missing section as Parts so old lists keep their cost math', () => {
    expect(normalizePurchaseSection(undefined)).toBe('parts');
    expect(normalizePurchaseSection('widget')).toBe('parts');
    expect(normalizePurchaseSection('ffe')).toBe('ffe');
  });

  it('keeps three reserved totals even when a section is empty', () => {
    const summary = summarizeBySection([
      part({ id: 'a', unitPriceEstimate: 10, section: 'parts' }),
      part({ id: 'b', unitPriceEstimate: 4, section: 'supplies' }),
    ]);
    expect(summary.parts).toEqual({ count: 1, cost: 10 });
    expect(summary.supplies).toEqual({ count: 1, cost: 4 });
    expect(summary.ffe).toEqual({ count: 0, cost: 0 });
  });

  it('says when a grade has Parts lines so the picker can stand down', () => {
    const parts = [part({ id: 'a', section: 'parts', grades: [] })];
    expect(hasPartsLinesForGrade(parts, 'Working')).toBe(true);
    expect(hasPartsLinesForGrade([part({ id: 'f', section: 'ffe' })], 'Working')).toBe(false);
    expect(partsLinesForRepairGrade(parts, 'Working')).toHaveLength(1);
  });
});
