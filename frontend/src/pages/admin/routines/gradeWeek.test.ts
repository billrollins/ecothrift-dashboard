import { describe, expect, it } from 'vitest';
import {
  isFutureWeek,
  isoWeekKey,
  letterTone,
  shiftWeek,
  weekLabel,
  weekRangeLabel,
} from './gradeWeek';

const TUESDAY = new Date(2026, 8, 1);

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

  it('spells the Monday-to-Sunday span', () => {
    expect(weekRangeLabel('2026-W38')).toBe('Sep 14 to Sep 20, 2026');
  });

  it('refuses to walk forward past the week in progress', () => {
    expect(isFutureWeek('2026-W36', TUESDAY)).toBe(false);
    expect(isFutureWeek('2026-W37', TUESDAY)).toBe(true);
  });
});

describe('letterTone', () => {
  it('treats an average week as a warning, not a pass', () => {
    expect(letterTone('A')).toBe('green');
    expect(letterTone('B-')).toBe('green');
    expect(letterTone('C+')).toBe('amber');
    expect(letterTone('D-')).toBe('amber');
    expect(letterTone('F')).toBe('red');
    expect(letterTone(null)).toBe('plain');
  });
});
