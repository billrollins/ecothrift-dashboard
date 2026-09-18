import { describe, expect, it } from 'vitest';
import type { DepartmentDailyMetric, DepartmentDailyWeek } from '../../types/pos.types';
import { isFailLetter } from './dashboardCardStyles';
import {
  retailDayIsClickable,
  retailGoalCellState,
  retailGridValue,
  retailWeekGoalAchieved,
  retailWeekTotal,
} from './DepartmentCardGrid';

function day(overrides: Partial<DepartmentDailyMetric> = {}): DepartmentDailyMetric {
  return {
    date: '2026-07-22',
    day: 'Wednesday',
    buying: '0',
    processing: '0',
    restoration: 0,
    retail: null,
    is_future: false,
    ...overrides,
  };
}

function week(overrides: Partial<DepartmentDailyWeek> = {}): DepartmentDailyWeek {
  return {
    label: 'This Week',
    week_start: '2026-07-20',
    week_end: '2026-07-26',
    days: [day()],
    ...overrides,
  };
}

describe('Retail routine goal presentation', () => {
  it('shows Closed, a dash, no activity, or the day letter', () => {
    expect(retailGridValue(day({ retail: 'B', retail_score: 84, open: true }))).toBe('B');
    expect(retailGridValue(day({ retail: null, open: true }))).toBe('\u2014');
    expect(retailGridValue(day({ retail: 'A', is_future: true, open: true }))).toBe('-');
    expect(retailGridValue(day({ retail: null, open: false, is_future: true }))).toBe('Closed');
    expect(retailGridValue(day({ retail: 'B', open: false, graded: true }))).toBe('B');
    expect(retailGridValue(day({ retail: 'A-', open: false, graded: true }))).toBe('A-');
    expect(retailGridValue(day({ retail: 'B+', open: true, graded: true }))).toBe('B+');
  });

  it('goes gold on a day that met the standard, amber-scheduled otherwise', () => {
    const scheduled = day({ retail: 'C', retail_scheduled: true, retail_grade_met: false });
    expect(retailGoalCellState(scheduled)).toBe('scheduled');
    expect(retailGoalCellState({ ...scheduled, retail: 'A', retail_grade_met: true }))
      .toBe('achieved');
    expect(retailGoalCellState(day({ retail: 'A' }))).toBeUndefined();
  });

  it('treats F as a fail letter, not amber', () => {
    expect(isFailLetter('F')).toBe(true);
    expect(isFailLetter('C')).toBe(false);
    expect(isFailLetter('B+')).toBe(false);
  });

  it('leaves an ungraded scheduled day neutral, not a miss', () => {
    expect(retailGoalCellState(day({
      retail: null,
      retail_scheduled: true,
      retail_grade_met: false,
    }))).toBeUndefined();
    expect(retailGoalCellState(day({
      retail: null,
      retail_scheduled: true,
      is_future: true,
    }))).toBeUndefined();
  });

  it('puts the week letter under the week label', () => {
    const result = week({ retail_week_grade: 'B', retail_week_goal_met: true });
    expect(retailWeekTotal(result)).toBe('B');
    expect(retailWeekTotal(week())).toBe('-');
    expect(retailWeekGoalAchieved(result)).toBe(true);
  });

  it('marks any non-future day clickable, including Closed and no activity', () => {
    expect(retailDayIsClickable(day({ retail: 'B' }))).toBe(true);
    expect(retailDayIsClickable(day({ retail: null, open: true }))).toBe(true);
    expect(retailDayIsClickable(day({ retail: null, open: false }))).toBe(true);
    expect(retailDayIsClickable(day({ retail: 'B', is_future: true }))).toBe(false);
  });
});
