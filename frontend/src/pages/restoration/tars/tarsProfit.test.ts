import { describe, expect, it } from 'vitest';
import { emptyValuesForScale, fmtUsdRange, gradeValuesComplete } from './tarsProfit';

const scales = { Functional: ['Working', 'Repairable', 'Parts-only'] };

describe('gradeValuesComplete', () => {
  it('treats $0 as a real price', () => {
    expect(
      gradeValuesComplete(
        'Functional',
        { Working: 40, Repairable: 0, 'Parts-only': 5 },
        scales,
      ),
    ).toBe(true);
  });

  it('treats a missing key as unpriced', () => {
    expect(
      gradeValuesComplete('Functional', { Working: 40, Repairable: 0 }, scales),
    ).toBe(false);
  });
});

describe('emptyValuesForScale', () => {
  it('keeps a recorded zero and does not invent zeros for blanks', () => {
    expect(emptyValuesForScale('Functional', scales, { Working: 40, Repairable: 0 })).toEqual({
      Working: 40,
      Repairable: 0,
    });
  });

  it('keeps prices from the previous scale so an accidental switch can be undone', () => {
    expect(
      emptyValuesForScale('Completeness', { Completeness: ['Complete', 'Incomplete'], ...scales }, {
        Working: 40,
        Repairable: 12,
        'Parts-only': 5,
      }),
    ).toEqual({ Working: 40, Repairable: 12, 'Parts-only': 5 });
  });
});

describe('fmtUsdRange', () => {
  it('is one number when the ends match', () => {
    expect(fmtUsdRange(12, 12)).toBe('$12');
  });

  it('is x to y when they differ', () => {
    expect(fmtUsdRange(10, 40)).toBe('$10 to $40');
  });
});
