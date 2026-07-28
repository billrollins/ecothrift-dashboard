import { describe, expect, it } from 'vitest';
import {
  deskDaysStateToApiParams,
  deskDaysStateToParams,
  parseDeskDaysUrlState,
} from './daysUrlState';

describe('desk days url state', () => {
  it('round-trips filters', () => {
    const state = parseDeskDaysUrlState(
      new URLSearchParams('bucket=past&q=jose&page=2'),
    );
    expect(state).toEqual({
      bucket: 'past',
      search: 'jose',
      page: 2,
    });
    expect(deskDaysStateToParams(state).toString()).toBe(
      'bucket=past&q=jose&page=2',
    );
    const api = deskDaysStateToApiParams(state);
    expect(api).toMatchObject({
      bucket: 'past',
      search: 'jose',
      page: 2,
    });
    if (import.meta.env.DEV) {
      expect(api.include_test).toBe('1');
    } else {
      expect(api).not.toHaveProperty('include_test');
    }
  });
});
