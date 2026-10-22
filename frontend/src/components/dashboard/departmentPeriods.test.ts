import { describe, expect, it } from 'vitest';
import { dayPeriod, periodLabel, processedItemsHref, weekPeriod } from './departmentPeriods';

describe('department periods', () => {
  it('cuts this week at today, like the card Actual', () => {
    const week = { week_start: '2026-10-19', week_end: '2026-10-25' };
    expect(weekPeriod(week, '2026-10-22')).toEqual({ start: '2026-10-19', end: '2026-10-22' });
    expect(weekPeriod({ week_start: '2026-10-12', week_end: '2026-10-18' }, '2026-10-22')).toEqual({
      start: '2026-10-12',
      end: '2026-10-18',
    });
  });

  it('labels a day or a span', () => {
    expect(periodLabel(dayPeriod('2026-10-20'))).toBe('Tue 10/20');
    expect(periodLabel({ start: '2026-10-19', end: '2026-10-22' })).toBe('Mon 10/19 - Thu 10/22');
  });

  it('links a person to their items in Inventory search', () => {
    expect(processedItemsHref(7, { start: '2026-10-19', end: '2026-10-22' })).toBe(
      '/inventory/search?processed_by=7&from=2026-10-19&to=2026-10-22',
    );
    expect(processedItemsHref(null, dayPeriod('2026-10-20'))).toBe(
      '/inventory/search?processed_by=none&from=2026-10-20&to=2026-10-20',
    );
  });
});
