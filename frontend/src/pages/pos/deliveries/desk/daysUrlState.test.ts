import { describe, expect, it } from 'vitest';
import {
  deskDaysStateToApiParams,
  deskDaysStateToParams,
  parseDeskDaysUrlState,
} from './daysUrlState';

describe('desk days url state', () => {
  it('round-trips filters', () => {
    const state = parseDeskDaysUrlState(
      new URLSearchParams('bucket=past&q=jose&include_test=1&page=2'),
    );
    expect(state).toEqual({
      bucket: 'past',
      search: 'jose',
      includeTest: true,
      page: 2,
    });
    expect(deskDaysStateToParams(state).toString()).toBe(
      'bucket=past&q=jose&include_test=1&page=2',
    );
    expect(deskDaysStateToApiParams(state)).toMatchObject({
      bucket: 'past',
      search: 'jose',
      include_test: '1',
      page: 2,
    });
  });
});
