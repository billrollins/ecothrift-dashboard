import { describe, expect, it } from 'vitest';
import { attachedStatusLine, attachedTotals } from './processingAttachedStats';

const plain = { role: null, checkIns: 1, manifestUnits: 1 } as const;

describe('counts on the attached products (#229)', () => {
  it('says how many are checked in and the last price, or "none yet"', () => {
    expect(attachedStatusLine({ checkedInQty: 0, linkConfig: plain })).toBe('none yet');
    expect(attachedStatusLine({ checkedInQty: 3, linkConfig: plain }, '4.99')).toBe('3 checked in · last $4.99');
    expect(attachedStatusLine({ checkedInQty: 1, linkConfig: plain }, '')).toBe('1 checked in');
    expect(attachedStatusLine({ checkedInQty: 1200, linkConfig: plain }, null)).toBe('1,200 checked in');
  });

  it('adds the row units for a set or a part', () => {
    // A part: 10 check-ins make one row unit.
    expect(attachedStatusLine({ checkedInQty: 10, linkConfig: { role: 'part', checkIns: 10, manifestUnits: 1 } }, '2.00'))
      .toBe('10 checked in (1 row) · last $2.00');
    // A set: one check-in covers 4 row units.
    expect(attachedStatusLine({ checkedInQty: 2, linkConfig: { role: 'set', checkIns: 1, manifestUnits: 4 } }))
      .toBe('2 checked in (8 rows)');
  });

  it('totals the list: products and everything checked in', () => {
    expect(attachedTotals([])).toEqual({ products: 0, checkedIn: 0 });
    expect(attachedTotals([{ checkedInQty: 3 }, { checkedInQty: 0 }, { checkedInQty: 2 }])).toEqual({ products: 3, checkedIn: 5 });
  });
});
