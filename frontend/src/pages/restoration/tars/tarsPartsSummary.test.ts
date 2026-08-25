import { describe, expect, it } from 'vitest';
import type { TarsPartLine } from './tarsWorkTypes';
import {
  partGrades,
  partLineCost,
  partsCostForGrade,
  partsForGrade,
  pointsAtCurrentGrade,
  summarizeParts,
} from './tarsPartsSummary';

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

describe('partLineCost', () => {
  it('charges what the part actually cost once that is known', () => {
    expect(partLineCost(part({ unitPriceEstimate: 10, unitPriceActual: 14, qty: 2 }))).toBe(28);
  });

  it('falls back to the estimate before anything is bought', () => {
    expect(partLineCost(part({ unitPriceEstimate: 10, qty: 3 }))).toBe(30);
  });

  it('treats a missing quantity as one rather than as nothing', () => {
    expect(partLineCost(part({ unitPriceEstimate: 9, qty: 0 }))).toBe(9);
  });
});

describe('summarizeParts', () => {
  it('reports the count alongside the money, because the count alone decides nothing', () => {
    const summary = summarizeParts([
      part({ id: 'a', unitPriceEstimate: 5 }),
      part({ id: 'b', unitPriceActual: 20, qty: 2 }),
    ]);
    expect(summary).toEqual({ count: 2, cost: 45 });
  });

  it('leaves out parts that were ruled out', () => {
    const summary = summarizeParts([
      part({ id: 'a', unitPriceEstimate: 5 }),
      part({ id: 'b', unitPriceEstimate: 100, status: 'skipped' }),
    ]);
    expect(summary).toEqual({ count: 1, cost: 5 });
  });

  it('is empty rather than broken when there is no list yet', () => {
    expect(summarizeParts(undefined)).toEqual({ count: 0, cost: 0 });
  });
});

describe('grade association', () => {
  it('lets one part serve several grades', () => {
    const p = part({ grades: ['Working', 'Like-new'] });
    expect(partGrades(p)).toEqual(['Working', 'Like-new']);
  });

  it('ignores blank entries left behind by editing', () => {
    expect(partGrades(part({ grades: ['Working', '', '  '] }))).toEqual(['Working']);
  });

  it('flags a part pointed at the grade the item is already at', () => {
    const p = part({ grades: ['Parts-only'] });
    expect(pointsAtCurrentGrade(p, 'Parts-only')).toBe(true);
    expect(pointsAtCurrentGrade(p, 'Working')).toBe(false);
  });

  it('does not flag anything when nobody has said where the item stands', () => {
    expect(pointsAtCurrentGrade(part({ grades: ['Working'] }), '')).toBe(false);
  });

  it('adds up only what one grade needs bought', () => {
    const parts = [
      part({ id: 'a', unitPriceEstimate: 10, grades: ['Working'] }),
      part({ id: 'b', unitPriceEstimate: 40, grades: ['Like-new'] }),
      part({ id: 'c', unitPriceEstimate: 5, grades: ['Working', 'Like-new'] }),
    ];
    expect(partsForGrade(parts, 'Working').map((p) => p.id)).toEqual(['a', 'c']);
    expect(partsCostForGrade(parts, 'Working')).toBe(15);
    expect(partsCostForGrade(parts, 'Like-new')).toBe(45);
  });

  it('counts an untagged Parts line on every destination grade', () => {
    const parts = [
      part({ id: 'shared', unitPriceEstimate: 8, grades: [] }),
      part({ id: 'only-working', unitPriceEstimate: 2, grades: ['Working'] }),
    ];
    expect(partsCostForGrade(parts, 'Working')).toBe(10);
    expect(partsCostForGrade(parts, 'Like-new')).toBe(8);
  });

  it('leaves FFE and Supplies out of the repair cost', () => {
    const parts = [
      part({ id: 'hinge', unitPriceEstimate: 6, section: 'parts', grades: ['Working'] }),
      part({ id: 'glue', unitPriceEstimate: 3, section: 'supplies', grades: ['Working'] }),
      part({ id: 'stand', unitPriceEstimate: 40, section: 'ffe', grades: ['Working'] }),
    ];
    expect(partsCostForGrade(parts, 'Working')).toBe(6);
  });
});
