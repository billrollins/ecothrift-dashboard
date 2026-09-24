import { describe, expect, it } from 'vitest';
import type { TimeEntry, WeeklyHoursStatus } from '../../types/hr.types';
import { hoursAlerts, weekLevel } from './HoursPayPanel';

function week(worked: string, extra: Partial<WeeklyHoursStatus> = {}): WeeklyHoursStatus {
  return {
    week_start: '2026-09-21',
    week_end: '2026-09-27',
    hours_worked: worked,
    hours_limit: '40.00',
    hours_remaining: String(Math.max(40 - parseFloat(worked), 0)),
    is_at_limit: false,
    is_over_limit: false,
    overtime_hours: '0.00',
    ...extra,
  };
}

const flagged = { id: 1, status: 'flagged' } as TimeEntry;
const pending = { id: 2, status: 'pending' } as TimeEntry;

describe('weekLevel', () => {
  it('grades the week against the limit', () => {
    expect(weekLevel(undefined)).toBe('ok');
    expect(weekLevel(week('22.50'))).toBe('ok');
    expect(weekLevel(week('38.50'))).toBe('near');
    expect(weekLevel(week('40.00', { is_at_limit: true }))).toBe('at');
    expect(weekLevel(week('41.00', { is_over_limit: true }))).toBe('over');
  });
});

describe('hoursAlerts', () => {
  it('is quiet on a normal week', () => {
    expect(hoursAlerts(week('22.50'), [pending], 0, 'en')).toEqual([]);
  });

  it('tags the limit, flagged shifts and waiting time changes', () => {
    const alerts = hoursAlerts(week('38.50'), [flagged, pending], 2, 'en');
    expect(alerts.map((a) => [a.label, a.tone])).toEqual([
      ['Near weekly limit', 'amber'],
      ['1 shift needs a fix', 'red'],
      ['2 time changes pending', 'blue'],
    ]);
  });
});
