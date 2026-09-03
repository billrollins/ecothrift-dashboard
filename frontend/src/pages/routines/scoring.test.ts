import { describe, expect, it } from 'vitest';
import { flattenChecks, unansweredCount } from './scoring';

describe('flattenChecks', () => {
  it('does not throw when a non-checklist payload has no sections', () => {
    expect(flattenChecks(null)).toEqual([]);
    expect(flattenChecks({} as never)).toEqual([]);
    expect(unansweredCount({} as never)).toBe(0);
  });
});
