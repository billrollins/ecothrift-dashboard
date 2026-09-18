import { describe, expect, it } from 'vitest';
import { formatDepartmentGoalValue, retailGoalBand } from './DepartmentGoalDialog';

describe('formatDepartmentGoalValue', () => {
  it('prints a grade letter', () => {
    expect(formatDepartmentGoalValue('grade', 'b')).toBe('B');
    expect(formatDepartmentGoalValue('grade', 'c')).toBe('C');
    expect(formatDepartmentGoalValue('grade', '')).toBe('-');
  });

  it('normalizes a stored plus/minus goal to A, B, or C', () => {
    expect(retailGoalBand('B+')).toBe('B');
    expect(retailGoalBand('a-')).toBe('A');
    expect(retailGoalBand('D')).toBe('B');
  });
});
