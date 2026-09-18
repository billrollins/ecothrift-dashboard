import { describe, expect, it } from 'vitest';
import {
  TITLE_MAX_CHARS,
  coverageSummary,
  dayAssignedCount,
  dayCovered,
  exceptionDays,
  formatDayRange,
  lockTooltip,
  personDays,
  sectionCountLabel,
  shiftSortKey,
  sortByPersonName,
} from './shiftsLayout';

describe('formatDayRange', () => {
  it('uses to for a contiguous span', () => {
    expect(formatDayRange([1, 2, 3, 4, 5])).toBe('Tue to Sat');
    expect(formatDayRange([0, 1, 2, 3, 4])).toBe('Mon to Fri');
  });

  it('lists non-contiguous days', () => {
    expect(formatDayRange([1, 2, 4])).toBe('Tue, Wed, Fri');
  });

  it('names a single day', () => {
    expect(formatDayRange([3])).toBe('Thu');
  });
});

describe('coverageSummary', () => {
  it('reports full cover without chips', () => {
    const days = [0, 1, 2, 3, 4];
    expect(coverageSummary(days, [
      { days },
      { days },
    ])).toEqual({ text: '2 covered', tone: 'good' });
  });

  it('flags an uncovered day as bad', () => {
    expect(coverageSummary([0, 1, 2, 3, 4], [
      { days: [0, 1, 2, 3] },
    ])).toEqual({ text: 'Fri out', tone: 'bad' });
  });
});

describe('personDays', () => {
  it('keeps an empty list as no days, not every shift day', () => {
    expect(personDays({ weekdays: [] }, { weekdays: [0, 1, 2, 3, 4] })).toEqual([]);
  });

  it('drops days the shift does not run', () => {
    expect(personDays({ weekdays: [0, 5] }, { weekdays: [0, 1, 2] })).toEqual([0]);
  });
});

describe('dayCovered', () => {
  it('marks unused days off and assigned days covered', () => {
    expect(dayCovered(6, [0, 1, 2], [{ days: [0] }])).toBe('off');
    expect(dayCovered(0, [0, 1, 2], [{ days: [0] }])).toBe('covered');
    expect(dayCovered(1, [0, 1, 2], [{ days: [0] }])).toBe('uncovered');
  });
});

describe('dayAssignedCount', () => {
  it('counts people on a day and ignores empty days', () => {
    const assigned = [{ days: [0, 2] }, { days: [0, 1] }, { days: [] }];
    expect(dayAssignedCount(0, assigned)).toBe(2);
    expect(dayAssignedCount(1, assigned)).toBe(1);
    expect(dayAssignedCount(3, assigned)).toBe(0);
  });
});

describe('exceptionDays', () => {
  it('treats a full match as no chips', () => {
    expect(exceptionDays([0, 1, 2], [0, 1, 2]).allMatch).toBe(true);
  });
});

describe('sortByPersonName', () => {
  it('keeps people in name order after add and remove', () => {
    const added = sortByPersonName(
      [{ name: 'Carrie Rollins' }, { name: 'Ashley Kilduff' }, { name: 'Bill Rollins' }],
      (row) => row.name,
    ).map((row) => row.name);
    expect(added).toEqual(['Ashley Kilduff', 'Bill Rollins', 'Carrie Rollins']);
    expect(sortByPersonName(
      added.filter((name) => name !== 'Bill Rollins').map((name) => ({ name })),
      (row) => row.name,
    ).map((row) => row.name)).toEqual(['Ashley Kilduff', 'Carrie Rollins']);
  });
});

describe('copy', () => {
  it('sizes the title for Retail Open plus ten characters', () => {
    expect(TITLE_MAX_CHARS).toBe('Retail Open'.length + 10);
  });

  it('names the locked routine', () => {
    expect(lockTooltip('Retail open')).toContain('Retail open routine');
  });

  it('counts section rows', () => {
    expect(sectionCountLabel(2, 3)).toBe('2 shifts · 3 people');
  });

  it('keeps Open before Day before Close', () => {
    const rows = [
      { punch_code: 'retail_close', time_in: '12:30:00', name: 'Retail Close' },
      { punch_code: 'retail_open', time_in: '08:30:00', name: 'Retail Open' },
      { punch_code: 'retail_day', time_in: '13:00:00', name: 'Retail Mid' },
    ];
    const ordered = [...rows].sort((a, b) => {
      const [ap, at, an] = shiftSortKey(a);
      const [bp, bt, bn] = shiftSortKey(b);
      return ap - bp || at.localeCompare(bt) || an.localeCompare(bn);
    }).map((row) => row.name);
    expect(ordered).toEqual(['Retail Open', 'Retail Mid', 'Retail Close']);
  });
});
