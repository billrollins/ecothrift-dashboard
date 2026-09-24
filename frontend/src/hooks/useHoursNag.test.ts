import { describe, expect, it } from 'vitest';
import type { TimeEntry, WeeklyHoursStatus } from '../types/hr.types';
import { hoursNag } from './useHoursNag';

const NOW = new Date(2026, 8, 24, 15, 0).getTime();

function week(worked: string): WeeklyHoursStatus {
  return {
    week_start: '2026-09-21',
    week_end: '2026-09-27',
    hours_worked: worked,
    hours_limit: '40.00',
    hours_remaining: '0',
    is_at_limit: false,
    is_over_limit: false,
    overtime_hours: '0.00',
  };
}

const open = { id: 1, clock_out: null, on_break: false } as TimeEntry;

describe('hoursNag', () => {
  it('is quiet off the clock, even over the limit', () => {
    expect(hoursNag(week('41.00'), null, NOW, NOW).level).toBe('none');
  });

  it('is quiet with more than an hour left', () => {
    expect(hoursNag(week('38.50'), open, NOW, NOW).level).toBe('none');
  });

  it('goes soft with an hour left and says when to clock out', () => {
    const nag = hoursNag(week('39.00'), open, NOW, NOW);
    expect(nag.level).toBe('soft');
    expect(nag.clockOutBy?.getTime()).toBe(NOW + 3_600_000);
  });

  it('counts time on the clock since the last fetch, and goes hard at the limit', () => {
    const tenMinutes = 10 * 60_000;
    expect(hoursNag(week('39.90'), open, NOW, NOW).level).toBe('soft');
    expect(hoursNag(week('39.90'), open, NOW, NOW + tenMinutes).level).toBe('hard');
  });

  it('does not count break time', () => {
    const onBreak = { ...open, on_break: true } as TimeEntry;
    expect(hoursNag(week('39.90'), onBreak, NOW, NOW + 30 * 60_000).level).toBe('soft');
  });
});
