import { describe, expect, it } from 'vitest';
import { DEFAULT_GRADE_SCALE } from './DepartmentRetailDayDialog';
import { gradeScaleRanges } from './GradeScaleTable';

describe('gradeScaleRanges', () => {
  it('builds 13 rows and spells A as 93 to 96', () => {
    const rows = gradeScaleRanges(DEFAULT_GRADE_SCALE);
    expect(rows).toHaveLength(13);
    expect(rows[0]).toEqual({ letter: 'A+', min: 97, range: '97 to 100' });
    expect(rows.find((row) => row.letter === 'A')).toEqual({
      letter: 'A',
      min: 93,
      range: '93 to 96',
    });
    expect(rows[rows.length - 1]).toEqual({ letter: 'F', min: null, range: 'below 60' });
  });
});
