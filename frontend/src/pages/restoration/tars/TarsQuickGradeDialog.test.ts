import { describe, expect, it } from 'vitest';
import { lowestGrade } from './finishNotes';
import { QUICK_GRADE_DEFAULT_DESTINATION } from './TarsQuickGradeDialog';

describe('TarsQuickGradeDialog defaults', () => {
  it('starts the item at the lowest priced grade on the scale', () => {
    expect(lowestGrade({ Working: 29.99, Repairable: 12, 'Parts-only': 4 })).toBe('Parts-only');
  });

  it('defaults the ultimate destination to shelf', () => {
    expect(QUICK_GRADE_DEFAULT_DESTINATION).toBe('shelf');
  });
});
