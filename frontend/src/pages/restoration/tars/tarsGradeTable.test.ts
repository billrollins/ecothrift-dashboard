import { describe, expect, it } from 'vitest';
import { GRADE_TABLE_HEADINGS } from './TarsGradeTable';

describe('TarsGradeTable columns', () => {
  it('has no item row and no AT column', () => {
    expect(GRADE_TABLE_HEADINGS).toEqual(['GRADE', 'SELLS FOR', 'PARTS', 'MINS', 'WORTH']);
    expect(GRADE_TABLE_HEADINGS.join(' ')).not.toMatch(/AT|ITEM|WORK/i);
  });
});
