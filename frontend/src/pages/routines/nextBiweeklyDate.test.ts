import { describe, expect, it } from 'vitest';
import { nextBiweeklyDate } from './nextBiweeklyDate';

describe('nextBiweeklyDate', () => {
  it('returns the anchor when it is still ahead', () => {
    expect(nextBiweeklyDate('2026-09-08', new Date(2026, 8, 1))).toBe('2026-09-08');
  });

  it('steps forward in 14-day increments', () => {
    expect(nextBiweeklyDate('2026-09-08', new Date(2026, 8, 9))).toBe('2026-09-22');
    expect(nextBiweeklyDate('2026-09-08', new Date(2026, 8, 22))).toBe('2026-09-22');
  });
});
