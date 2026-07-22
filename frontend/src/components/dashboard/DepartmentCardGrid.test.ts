import { describe, expect, it } from 'vitest';
import type { DepartmentDailyMetric, DepartmentDailyWeek } from '../../types/pos.types';
import {
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

describe('Retail QA goal presentation', () => {
  it('shows scheduled count progress and gold only when achieved', () => {
    const pending = day({
      retail: 'A',
      retail_scheduled: true,
      retail_count: 1,
      retail_required: 2,
      retail_goal_met: false,
    });
    expect(retailGridValue(pending)).toBe('A·1/2');
    expect(retailGoalCellState(pending)).toBe('scheduled');

    const achieved = { ...pending, retail_count: 2, retail_goal_met: true };
    expect(retailGridValue(achieved)).toBe('A ✓');
    expect(retailGoalCellState(achieved)).toBe('achieved');
  });

  it('uses the backend last-grade week score and achievement flag', () => {
    const result = week({
      retail_week_grade: 'F',
      retail_week_goal_met: true,
    });
    expect(retailWeekTotal(result)).toBe('F');
    expect(retailWeekGoalAchieved(result)).toBe(true);
  });
});
