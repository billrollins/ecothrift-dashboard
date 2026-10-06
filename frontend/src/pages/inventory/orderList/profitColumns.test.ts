import { describe, expect, it } from 'vitest';
import { profitNumbers } from './profitColumns';

describe('profitNumbers ("If it all sells")', () => {
  const m = { cost: '1000.00', manifest_retail: '5000.00', priced_start: '2000.00', sold: '900.00', unsold_left: '600.00' };

  it('adds what is left at 100%', () => {
    const p = profitNumbers(m, 100);
    expect([p.leftAtX, p.profit, p.profitPct]).toEqual([600, 500, 50]);
  });

  it('and at 50%', () => {
    const p = profitNumbers(m, 50);
    expect([p.leftAtX, p.profit, p.profitPct]).toEqual([300, 200, 20]);
  });

  it('leaves the % blank when there is no cost', () => {
    const p = profitNumbers({ ...m, cost: '0.00' }, 100);
    expect(p.profitPct).toBeNull();
  });

  it('nothing left counts as zero', () => {
    expect(profitNumbers({ ...m, unsold_left: null }, 100).profit).toBe(-100);
  });
});
