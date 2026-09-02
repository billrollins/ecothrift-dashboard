import { describe, expect, it } from 'vitest';
import type { CrossCheckRow, TallyTotals, WeekGrade } from '../../../api/routines.api';
import {
  auditFindings,
  isFutureWeek,
  isoWeekKey,
  letterTone,
  shiftWeek,
  tallyGrid,
  weekLabel,
  weekNote,
} from './gradeWeek';

const TUESDAY = new Date(2026, 8, 1);

function week(over: Partial<WeekGrade> = {}): WeekGrade {
  return {
    week: '2026-W36',
    monday: '2026-08-31',
    score: 91,
    letter: 'A',
    daily_average: 95,
    cross_check_average: 79,
    days: [],
    cross_checks: [],
    tallies: [],
    calibration: [],
    settings: {},
    missing_owners: [],
    taxonomy: { graded: [], recorded: [], flags: [], safety_flag: 'safety' },
    ...over,
  };
}

function crossCheck(over: Partial<CrossCheckRow> = {}): CrossCheckRow {
  return {
    run_id: 1,
    date: '2026-09-01',
    section_id: 3,
    section_name: 'Housewares',
    auditor_name: 'Alex',
    status: 'done',
    score: 88,
    photo: null,
    items_inspected: 42,
    counts: {},
    flags: [],
    notes: '',
    ...over,
  };
}

function tally(name: string, counts: Record<string, number>): TallyTotals {
  return { section_id: 1, section_name: name, counts, walks: 3 };
}

describe('week keys', () => {
  it('reads a date as its ISO week and steps back and forth', () => {
    expect(isoWeekKey(TUESDAY)).toBe('2026-W36');
    expect(shiftWeek('2026-W36', -1)).toBe('2026-W35');
    expect(shiftWeek('2026-W36', 1)).toBe('2026-W37');
  });

  it('crosses a year boundary without losing the week', () => {
    expect(shiftWeek('2027-W01', -1)).toBe('2026-W53');
  });

  it('names this week and last week, and dates the rest', () => {
    expect(weekLabel('2026-W36', TUESDAY)).toBe('This week');
    expect(weekLabel('2026-W35', TUESDAY)).toBe('Last week');
    expect(weekLabel('2026-W30', TUESDAY)).toBe('Jul 20 - Jul 25');
  });

  it('refuses to walk forward past the week in progress', () => {
    expect(isFutureWeek('2026-W36', TUESDAY)).toBe(false);
    expect(isFutureWeek('2026-W37', TUESDAY)).toBe(true);
  });
});

describe('letterTone', () => {
  it('treats an average week as a warning, not a pass', () => {
    expect(letterTone('A')).toBe('green');
    expect(letterTone('C')).toBe('amber');
    expect(letterTone('F')).toBe('red');
    expect(letterTone(null)).toBe('plain');
  });
});

describe('weekNote', () => {
  it('says what is loading, missing, or counted', () => {
    expect(weekNote(undefined, true, false)).toBe('Scoring the week.');
    expect(weekNote(undefined, false, true)).toBe('Could not load the week.');
    expect(weekNote(week({ score: null }), false, false))
      .toBe('Nothing has been graded in this week yet.');
    expect(weekNote(week({
      days: [
        { graded: true } as never,
        { graded: false } as never,
      ],
      cross_checks: [crossCheck(), crossCheck({ run_id: 2, status: 'open' })],
    }), false, false)).toBe('1 day graded, 1 of 2 cross-checks done.');
  });

  it('says so when nobody was asked to cross-check anything', () => {
    expect(weekNote(week({ days: [{ graded: true } as never] }), false, false))
      .toBe('1 day graded, no cross-checks assigned.');
  });
});

describe('tallyGrid', () => {
  const keys = [
    { key: 'hangers', label: 'Hangers' },
    { key: 'reshelf', label: 'Reshelf' },
    { key: 'clean', label: 'Clean' },
  ];

  it('drops columns nobody logged and puts the worst section first', () => {
    const grid = tallyGrid([
      tally('Toys', { hangers: 2 }),
      tally('Housewares', { hangers: 9, reshelf: 3 }),
    ], keys);
    expect(grid.keys.map((entry) => entry.key)).toEqual(['hangers', 'reshelf']);
    expect(grid.rows.map((row) => row.row.section_name)).toEqual(['Housewares', 'Toys']);
    expect(grid.rows[0].total).toBe(12);
  });

  it('breaks a tie on the section name', () => {
    const grid = tallyGrid([tally('Toys', { hangers: 1 }), tally('Books', { hangers: 1 })], keys);
    expect(grid.rows.map((row) => row.row.section_name)).toEqual(['Books', 'Toys']);
  });
});

describe('auditFindings', () => {
  it('lists what was found, most of it first, with real labels', () => {
    const labels = new Map([['reshelf', 'Items I moved back'], ['hangers', 'Empty hangers']]);
    const rows = auditFindings(crossCheck({ counts: { hangers: 2, reshelf: 7, clean: 0 } }), labels);
    expect(rows).toEqual([
      { label: 'Items I moved back', count: 7 },
      { label: 'Empty hangers', count: 2 },
    ]);
  });
});
