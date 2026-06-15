import { describe, expect, it, beforeEach } from 'vitest';
import { pushSearchHistory, readSearchHistory } from './searchHistory';

const KEY = 'test.searchHistory';

describe('searchHistory', () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it('stores and dedupes recent searches', () => {
    pushSearchHistory(KEY, '{product=1}');
    pushSearchHistory(KEY, 'LEGO castle');
    pushSearchHistory(KEY, '{product=1}');

    expect(readSearchHistory(KEY)).toEqual(['{product=1}', 'LEGO castle']);
  });

  it('ignores blank queries', () => {
    pushSearchHistory(KEY, '   ');
    expect(readSearchHistory(KEY)).toEqual([]);
  });
});
