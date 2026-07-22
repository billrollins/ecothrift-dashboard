import { describe, expect, it } from 'vitest';
import {
  activeFilterChips,
  applyDelivered90to60,
  applyLast60Days,
  clearAllFilters,
  clearChip,
  filterFingerprint,
  isDelivered90to60Active,
  isLast60DaysActive,
  orderListStateToApiParams,
  orderListStateToSearchParams,
  parseOrderListSearchParams,
  DEFAULT_ORDER_LIST_STATE,
} from './urlState';

describe('orderList urlState', () => {
  it('round-trips search params', () => {
    const state = {
      ...DEFAULT_ORDER_LIST_STATE,
      search: 'pallet',
      statusBucket: 'processing' as const,
      condition: 'good' as const,
      dateField: 'shipped_date' as const,
      dateFrom: '2026-07-01',
      dateTo: '2026-07-21',
      itemCountMin: '1',
      includeOlder: true,
      page: 2,
      pageSize: 50,
    };
    const params = orderListStateToSearchParams(state);
    const parsed = parseOrderListSearchParams(params);
    expect(parsed.search).toBe('pallet');
    expect(parsed.statusBucket).toBe('processing');
    expect(parsed.condition).toBe('good');
    expect(parsed.dateField).toBe('shipped_date');
    expect(parsed.dateFrom).toBe('2026-07-01');
    expect(parsed.includeOlder).toBe(true);
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(50);
  });

  it('builds API params with milestone ordering and recent window', () => {
    const api = orderListStateToApiParams({
      ...DEFAULT_ORDER_LIST_STATE,
      statusBucket: 'pending',
      itemCountMax: '10',
    });
    expect(api.status__in).toBe('ordered,paid');
    expect(api.ordering).toBe('milestones');
    expect(api.item_count_max).toBe('10');
    expect(api.include_older).toBe('0');
  });

  it('manages active chips', () => {
    const state = {
      ...DEFAULT_ORDER_LIST_STATE,
      search: 'abc',
      statusBucket: 'delivered' as const,
      includeOlder: true,
    };
    const chips = activeFilterChips(state);
    expect(chips.map((c) => c.id)).toEqual(['search', 'bucket', 'older']);
    const cleared = clearChip(state, 'search');
    expect(cleared.search).toBe('');
    expect(clearAllFilters(state).statusBucket).toBe('all');
    expect(clearChip(state, 'older').includeOlder).toBe(false);
  });

  it('fingerprint ignores pagination', () => {
    const a = filterFingerprint({ ...DEFAULT_ORDER_LIST_STATE, page: 0 });
    const b = filterFingerprint({ ...DEFAULT_ORDER_LIST_STATE, page: 3 });
    expect(a).toBe(b);
  });

  it('applies delivered 90–60 day window', () => {
    const next = applyDelivered90to60(DEFAULT_ORDER_LIST_STATE, new Date('2026-07-21T12:00:00Z'));
    expect(next.dateField).toBe('delivered_date');
    expect(next.dateFrom).toBe('2026-04-22');
    expect(next.dateTo).toBe('2026-05-22');
    expect(next.page).toBe(0);
  });

  it('applies last 60 days ordered window', () => {
    const next = applyLast60Days(
      { ...DEFAULT_ORDER_LIST_STATE, statusBucket: 'processing' },
      new Date('2026-07-21T12:00:00Z'),
    );
    expect(next.statusBucket).toBe('all');
    expect(next.dateField).toBe('ordered_date');
    expect(next.dateFrom).toBe('2026-05-22');
    expect(next.dateTo).toBe('2026-07-21');
  });

  it('detects active quick date presets', () => {
    const today = new Date('2026-07-21T12:00:00Z');
    const ninety = applyDelivered90to60(DEFAULT_ORDER_LIST_STATE, today);
    const last60 = applyLast60Days(DEFAULT_ORDER_LIST_STATE, today);
    expect(isDelivered90to60Active(ninety, today)).toBe(true);
    expect(isLast60DaysActive(last60, today)).toBe(true);
    expect(isDelivered90to60Active(last60, today)).toBe(false);
    expect(isLast60DaysActive(ninety, today)).toBe(false);
    expect(isDelivered90to60Active(DEFAULT_ORDER_LIST_STATE, today)).toBe(false);
  });
});
