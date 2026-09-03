import { describe, expect, it } from 'vitest';
import type { SalesDailyMetric } from '../../types/pos.types';
import {
  mondayTickDates,
  sliceSalesDailyWindow,
} from './salesChartData';

function daily(count: number): SalesDailyMetric[] {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const start = new Date(Date.UTC(2026, 5, 1));
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const day = names[(date.getUTCDay() + 6) % 7] ?? 'Monday';
    const weekStart = new Date(date);
    const offset = (date.getUTCDay() + 6) % 7;
    weekStart.setUTCDate(date.getUTCDate() - offset);
    return {
      date: iso,
      day,
      rolling_week_total: String(1000 + i),
      four_week_weekly_avg: '900',
      week_start: weekStart.toISOString().slice(0, 10),
      is_week_start: day === 'Monday',
    };
  });
}

describe('sliceSalesDailyWindow', () => {
  it('returns the last N days', () => {
    const rows = daily(90);
    const window = sliceSalesDailyWindow(rows, 28);
    expect(window).toHaveLength(28);
    expect(window[0].date).toBe(rows[62].date);
    expect(window.at(-1)?.date).toBe(rows.at(-1)?.date);
  });

  it('returns the full series when it is shorter than the window', () => {
    const rows = daily(10);
    expect(sliceSalesDailyWindow(rows, 28)).toEqual(rows);
  });
});

describe('mondayTickDates', () => {
  it('lists every Monday by default', () => {
    const ticks = mondayTickDates(daily(28), 1);
    expect(ticks.length).toBe(4);
    expect(ticks.every((iso) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
  });

  it('thins Mondays when asked', () => {
    const ticks = mondayTickDates(daily(90), 3);
    expect(ticks.length).toBeLessThan(mondayTickDates(daily(90), 1).length);
  });
});
