import { describe, expect, it } from 'vitest';
import type { DepartmentDailyMetric, DepartmentDailyWeek } from '../../types/pos.types';
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
  it('shows the day letter, and a dash where there is nothing to grade', () => {
    expect(retailGridValue(day({ retail: 'B', retail_score: 84 }))).toBe('B');
    expect(retailGridValue(day({ retail: null }))).toBe('-');
    expect(retailGridValue(day({ retail: 'A', is_future: true }))).toBe('-');
  });

  it('goes gold on a day that met the standard, amber-scheduled otherwise', () => {
    const scheduled = day({ retail: 'C', retail_scheduled: true, retail_grade_met: false });
    expect(retailGoalCellState(scheduled)).toBe('scheduled');
    expect(retailGoalCellState({ ...scheduled, retail: 'A', retail_grade_met: true }))
      .toBe('achieved');
    expect(retailGoalCellState(day({ retail: 'A' }))).toBeUndefined();
  });

  it('puts the week letter under the week label', () => {
    const result = week({ retail_week_grade: 'B', retail_week_goal_met: true });
    expect(retailWeekTotal(result)).toBe('B');
    expect(retailWeekTotal(week())).toBe('-');
    expect(retailWeekGoalAchieved(result)).toBe(true);
  });

  it('marks a day clickable once it has a grade to open', () => {
    expect(retailDayIsClickable(day({ retail: 'B' }))).toBe(true);
    expect(retailDayIsClickable(day({ retail: null }))).toBe(false);
    expect(retailDayIsClickable(day({ retail: 'B', is_future: true }))).toBe(false);
  });
});
