import { describe, expect, it } from 'vitest';
import { applyTransform, IDENTITY, isOffPlan, suggestTransform } from './pinTransform';

describe('pinTransform (#130)', () => {
  it('scales then moves, like the server', () => {
    expect(applyTransform({ x: 100, y: 50 }, { scale: 2, dx: 10, dy: -20 })).toEqual({ x: 210, y: 80 });
    expect(applyTransform({ x: 7, y: 9 }, IDENTITY)).toEqual({ x: 7, y: 9 });
  });

  it('guesses a scale for the same shape and a centring move for another shape', () => {
    expect(suggestTransform({ width: 1200, height: 720 }, { width: 2400, height: 1440 })).toEqual({ scale: 2, dx: 0, dy: 0 });
    expect(suggestTransform({ width: 1200, height: 720 }, { width: 1800, height: 2100 })).toEqual({ scale: 1, dx: 300, dy: 690 });
    expect(suggestTransform({ width: 0, height: 0 }, { width: 10, height: 10 })).toEqual(IDENTITY);
  });

  it('flags pins further off the plan than a pin may sit', () => {
    const size = { width: 300, height: 200 };
    expect(isOffPlan({ x: 540, y: 0 }, size)).toBe(false);
    expect(isOffPlan({ x: 541, y: 0 }, size)).toBe(true);
    expect(isOffPlan({ x: 0, y: -241 }, size)).toBe(true);
  });
});
