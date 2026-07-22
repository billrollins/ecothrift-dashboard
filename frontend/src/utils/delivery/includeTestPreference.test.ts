import { afterEach, describe, expect, it } from 'vitest';
import {
  includeTestApiParam,
  readIncludeTestPreference,
  writeIncludeTestPreference,
} from './includeTestPreference';

describe('includeTestPreference', () => {
  afterEach(() => {
    localStorage.removeItem('delivery.includeTest');
  });

  it('defaults off', () => {
    expect(readIncludeTestPreference()).toBe(false);
    expect(includeTestApiParam(false)).toBeUndefined();
  });

  it('persists on/off', () => {
    writeIncludeTestPreference(true);
    expect(readIncludeTestPreference()).toBe(true);
    expect(includeTestApiParam(true)).toBe('1');
    writeIncludeTestPreference(false);
    expect(readIncludeTestPreference()).toBe(false);
  });
});
