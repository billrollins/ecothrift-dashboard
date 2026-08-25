import { describe, expect, it } from 'vitest';
import {
  attentionCounts,
  attentionRibbon,
  filterByAttention,
  laneForOrder,
  laneTotal,
  ordersForLane,
  partsNavWaitingCount,
  partsOwnerAction,
  sortLaneOrders,
  timingLine,
} from './partsBoard';
import { partsOrderFixture } from './partsOrderFixture';

describe('laneForOrder', () => {
  it('maps pipeline statuses and drops drafts', () => {
    expect(laneForOrder(partsOrderFixture({ status: 'requested' }))).toBe('requested');
    expect(laneForOrder(partsOrderFixture({ status: 'approved' }))).toBe('approved');
    expect(laneForOrder(partsOrderFixture({ status: 'purchased' }))).toBe('ordered');
    expect(laneForOrder(partsOrderFixture({ status: 'received' }))).toBe('received');
    expect(laneForOrder(partsOrderFixture({ status: 'draft', attention: '' }))).toBeNull();
    expect(laneForOrder(partsOrderFixture({ status: 'cancelled', attention: '' }))).toBeNull();
  });
});

describe('partsOwnerAction', () => {
  it('follows accept, place, deliver, then cancel-ask', () => {
    expect(partsOwnerAction(partsOrderFixture({ status: 'requested', attention: 'approval' }))).toBe(
      'accept_deny',
    );
    expect(partsOwnerAction(partsOrderFixture({ status: 'approved', attention: 'to_place' }))).toBe(
      'order_or_cancel',
    );
    expect(partsOwnerAction(partsOrderFixture({ status: 'purchased', attention: '' }))).toBe(
      'deliver_or_revise',
    );
    expect(
      partsOwnerAction(
        partsOrderFixture({ status: 'approved', cancel_requested: true, attention: 'cancel_ask' }),
      ),
    ).toBe('resolve_cancel');
    expect(
      partsOwnerAction(partsOrderFixture({ status: 'received', review_state: 'needs_review', attention: 'review' })),
    ).toBe('review');
    expect(partsOwnerAction(partsOrderFixture({ status: 'received', review_state: 'ok' }))).toBe('review');
    expect(partsOwnerAction(partsOrderFixture({ status: 'received', review_state: 'reviewed' }))).toBe('none');
  });
});

describe('sortLaneOrders', () => {
  it('puts cancel asks first, then oldest', () => {
    const rows = [
      partsOrderFixture({ id: 1, status: 'purchased', attention: '', requested_at: '2026-08-24T12:00:00Z' }),
      partsOrderFixture({
        id: 2,
        status: 'purchased',
        cancel_requested: true,
        attention: 'cancel_ask',
        requested_at: '2026-08-24T14:00:00Z',
      }),
      partsOrderFixture({ id: 3, status: 'purchased', attention: 'late', requested_at: '2026-08-24T10:00:00Z' }),
    ];
    expect(sortLaneOrders(rows).map((row) => row.id)).toEqual([2, 3, 1]);
  });
});

describe('partsNavWaitingCount', () => {
  it('counts approvals, cancel asks, and reviews, then drops when they are handled', () => {
    const waiting = [
      partsOrderFixture({ id: 1, attention: 'approval' }),
      partsOrderFixture({ id: 2, attention: 'cancel_ask', cancel_requested: true }),
      partsOrderFixture({
        id: 3,
        status: 'received',
        attention: 'review',
        review_state: 'needs_review',
        needs_review: true,
      }),
      partsOrderFixture({ id: 4, status: 'approved', attention: 'to_place' }),
    ];
    expect(partsNavWaitingCount(waiting)).toBe(3);
    expect(partsNavWaitingCount(waiting.filter((row) => row.attention === 'to_place'))).toBe(0);
  });
});

describe('attentionCounts and filter', () => {
  it('counts each attention once and filters the board', () => {
    const rows = [
      partsOrderFixture({ id: 1, attention: 'approval' }),
      partsOrderFixture({ id: 2, attention: 'approval' }),
      partsOrderFixture({ id: 3, attention: 'cancel_ask', cancel_requested: true }),
      partsOrderFixture({ id: 4, attention: '' }),
    ];
    expect(attentionCounts(rows)).toEqual({
      cancel_ask: 1,
      approval: 2,
      to_place: 0,
      late: 0,
      review: 0,
    });
    expect(filterByAttention(rows, 'approval').map((row) => row.id)).toEqual([1, 2]);
    expect(filterByAttention(rows, '').map((row) => row.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('ordersForLane and laneTotal', () => {
  it('keeps each status in its lane and sums the visible total', () => {
    const rows = [
      partsOrderFixture({ id: 1, status: 'requested', attention: 'approval', total: '10.00' }),
      partsOrderFixture({ id: 2, status: 'approved', attention: 'to_place', total: '20.00' }),
      partsOrderFixture({ id: 3, status: 'purchased', attention: '', total: '7.50' }),
    ];
    expect(ordersForLane(rows, 'requested').map((row) => row.id)).toEqual([1]);
    expect(laneTotal(ordersForLane(rows, 'approved'))).toBe(20);
  });
});

describe('timingLine', () => {
  it('names late, arriving, and asked', () => {
    expect(
      timingLine(partsOrderFixture({ status: 'purchased', days_late: 3, attention: 'late' })),
    ).toBe('3 days late');
    expect(
      timingLine(
        partsOrderFixture({
          status: 'purchased',
          days_late: null,
          expected_delivery_on: '2026-08-27',
          attention: '',
        }),
      ),
    ).toBe('arriving Thu Aug 27');
    expect(
      timingLine(
        partsOrderFixture({ requested_at: '2026-08-23T12:00:00Z' }),
        Date.parse('2026-08-25T12:00:00Z'),
      ),
    ).toBe('asked 2d ago');
  });
});

describe('attentionRibbon', () => {
  it('always has a label so the slot never collapses', () => {
    expect(attentionRibbon('cancel_ask')).toBe('Cancel ask');
    expect(attentionRibbon('')).toBe('Clear');
  });
});
