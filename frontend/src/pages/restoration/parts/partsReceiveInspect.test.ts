import { describe, expect, it } from 'vitest';
import { partsOrderFixture, partsOrderLineFixture } from './partsOrderFixture';
import {
  draftsFromOrder,
  lineInspectReady,
  orderGradeSpan,
  orderPartsWord,
  orderTypeLabel,
  receiveInspectReady,
  toInspectPayload,
} from './partsReceiveInspect';

describe('receiveInspectReady', () => {
  it('needs a verdict on every line and a note on every issues row', () => {
    const drafts = [
      { id: 1, verdict: '' as const, note: '' },
      { id: 2, verdict: 'issues' as const, note: '' },
    ];
    expect(receiveInspectReady(drafts)).toBe(false);
    expect(lineInspectReady({ id: 1, verdict: 'acceptable', note: '' })).toBe(true);
    expect(lineInspectReady({ id: 2, verdict: 'issues', note: 'Wrong size' })).toBe(true);
    expect(
      receiveInspectReady([
        { id: 1, verdict: 'acceptable', note: '' },
        { id: 2, verdict: 'issues', note: 'Wrong size' },
      ]),
    ).toBe(true);
  });

  it('treats qty 3 as one inspect row', () => {
    const order = partsOrderFixture({
      item_count: 1,
      lines: [
        {
          id: 4,
          part_id: 1,
          description: 'Blade',
          url: '',
          category: 'parts',
          qty: 3,
          unit_price: '10.00',
          unit_cost: '10.00',
          line_total: '30.00',
          inspect_verdict: '',
          inspect_note: '',
        },
      ],
    });
    expect(draftsFromOrder(order)).toHaveLength(1);
    expect(draftsFromOrder(order)).toEqual([{ id: 4, verdict: '', note: '' }]);
    expect(toInspectPayload([{ id: 4, verdict: 'acceptable', note: 'ignore' }])).toEqual([
      { id: 4, verdict: 'acceptable', note: '' },
    ]);
  });

  it('packs the order card as type, count, and grade span', () => {
    const order = partsOrderFixture({
      name: 'Amazon hinge',
      item_count: 3,
      job_starting_grade: 'Parts-only',
      target_grade: 'Working',
      lines: [
        partsOrderLineFixture({ id: 4, category: 'parts' }),
        partsOrderLineFixture({ id: 5, part_id: 2, description: 'Oil', category: 'supplies' }),
      ],
    });
    expect(orderTypeLabel(order)).toBe('Parts + Supplies');
    expect(orderPartsWord(order)).toBe('3 parts');
    expect(orderGradeSpan(order)).toBe('Parts-only → Working');
  });
});
