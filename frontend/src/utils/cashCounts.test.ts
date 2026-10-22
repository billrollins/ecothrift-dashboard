import { describe, expect, it } from 'vitest';
import { addCounts, countCents, describeCount, makeChange, type CashCount } from './cashCounts';

const FULL: CashCount = {
  hundreds: 2, fifties: 2, twenties: 10, tens: 10, fives: 10, ones: 30, quarters: 40, dimes: 50, nickels: 40, pennies: 50,
};

describe('cashCounts (the same answers as the server)', () => {
  it('fewest pieces from a full drawer', () => {
    expect(makeChange(1260, FULL)).toEqual({ give: { tens: 1, ones: 2, quarters: 2, dimes: 1 }, short: false });
    expect(makeChange(99, FULL)).toEqual({ give: { quarters: 3, dimes: 2, pennies: 4 }, short: false });
    expect(makeChange(0, FULL)).toEqual({ give: {}, short: false });
  });

  it('never gives what the drawer does not have', () => {
    expect(makeChange(30, { ...FULL, nickels: 0, pennies: 0 })).toEqual({ give: { dimes: 3 }, short: false });
    expect(makeChange(700, { ...FULL, fives: 0 })).toEqual({ give: { ones: 7 }, short: false });
  });

  it('says short when it cannot, and still names the fewest pieces', () => {
    expect(makeChange(5, { quarters: 4 })).toEqual({ give: { nickels: 1 }, short: true });
    expect(makeChange(5700)).toEqual({ give: { fifties: 1, fives: 1, ones: 2 }, short: false });
  });

  it('adds, totals and reads out counts', () => {
    expect(countCents({ twenties: 2, quarters: 3 })).toBe(4075);
    expect(addCounts({ ones: 2 }, { ones: 2 }, -1)).toEqual({});
    expect(describeCount({ quarters: 2, fives: 1 })).toBe('1 × $5, 2 × quarters');
  });
});
