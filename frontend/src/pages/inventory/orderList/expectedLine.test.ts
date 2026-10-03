import { describe, expect, it } from 'vitest';
import { expectedLine } from './orderListColumns';

describe('expectedLine', () => {
  it('shows the expected delivery under the status', () => {
    expect(expectedLine('2026-10-08')).toBe('EXP · Oct 8');
    expect(expectedLine('2026-12-25T00:00:00Z')).toBe('EXP · Dec 25');
  });
  it('is empty without a date', () => {
    expect(expectedLine(null)).toBeNull();
    expect(expectedLine('')).toBeNull();
  });
});
