import { describe, expect, it } from 'vitest';
import { partsNavWaitingCount } from './partsBoard';
import { applyOrderToCachedList } from './partsOrderCache';
import { partsOrderFixture } from './partsOrderFixture';

describe('applyOrderToCachedList', () => {
  it('moves an inspected received order from live to history', () => {
    const live = partsOrderFixture({
      id: 4,
      status: 'received',
      review_state: 'needs_review',
      needs_review: true,
    });
    const inspected = {
      ...live,
      review_state: 'reviewed' as const,
      needs_review: false,
    };
    expect(applyOrderToCachedList([live], inspected, { bucket: 'live' })).toEqual([]);
    expect(applyOrderToCachedList([], inspected, { bucket: 'history' }).map((row) => row.id)).toEqual([4]);
    expect(partsNavWaitingCount([live])).toBe(1);
    expect(partsNavWaitingCount(applyOrderToCachedList([live], inspected, { bucket: 'live' }))).toBe(0);
  });

  it('removes a denied order from live and inserts it into history', () => {
    const requested = partsOrderFixture({ id: 2, status: 'requested' });
    const denied = { ...requested, status: 'denied' as const, attention: '' as const };
    expect(applyOrderToCachedList([requested], denied, { bucket: 'live' })).toEqual([]);
    expect(applyOrderToCachedList([], denied, { bucket: 'history' })[0].status).toBe('denied');
  });
});
