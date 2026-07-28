import { describe, expect, it } from 'vitest';
import {
  deskTotalStateToApiParams,
  deskTotalStateToParams,
  parseDeskTotalUrlState,
} from './totalDeliveriesUrlState';

describe('desk total deliveries url state', () => {
  it('round-trips filters', () => {
    const state = parseDeskTotalUrlState(
      new URLSearchParams('q=washer&status=scheduled&include_archived=1&page=3'),
    );
    expect(state).toEqual({
      search: 'washer',
      status: 'scheduled',
      includeArchived: true,
      page: 3,
    });
    expect(deskTotalStateToParams(state).toString()).toBe(
      'q=washer&status=scheduled&include_archived=1&page=3',
    );
    const api = deskTotalStateToApiParams(state);
    expect(api).toMatchObject({
      search: 'washer',
      status: 'scheduled',
      include_archived: '1',
      page: 3,
    });
    if (import.meta.env.DEV) {
      expect(api.include_test).toBe('1');
    } else {
      expect(api).not.toHaveProperty('include_test');
    }
  });
});
