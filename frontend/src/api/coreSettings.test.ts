import { describe, expect, it } from 'vitest';
import { asSettingRows } from './core.api';

describe('asSettingRows', () => {
  it('keeps a plain list', () => {
    const rows = [{ key: 'tax_rate', value: 0.08 }];
    expect(asSettingRows(rows)).toEqual(rows);
  });

  it('unwraps a paginated payload so Settings never calls .map on an object', () => {
    expect(asSettingRows({
      count: 1,
      next: null,
      previous: null,
      results: [{ key: 'tax_rate', value: 0.08 }],
    })).toEqual([{ key: 'tax_rate', value: 0.08 }]);
  });

  it('returns [] for missing or unexpected payloads', () => {
    expect(asSettingRows(undefined)).toEqual([]);
    expect(asSettingRows(null)).toEqual([]);
    expect(asSettingRows({ count: 0 })).toEqual([]);
  });
});
