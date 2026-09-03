import { describe, expect, it } from 'vitest';
import { dutyColors } from '../duty/tokens';
import { greetingKey, weekStatusLine } from './weekStatus';
import type { WeeklyHoursStatus } from '../../types/hr.types';

function weekly(overrides: Partial<WeeklyHoursStatus> = {}): WeeklyHoursStatus {
  return {
    week_start: '2026-08-31',
    week_end: '2026-09-06',
    hours_worked: '22.50',
    hours_limit: '40.00',
    hours_remaining: '17.50',
    is_at_limit: false,
    is_over_limit: false,
    overtime_hours: '0.00',
    ...overrides,
  };
}

describe('weekStatusLine', () => {
  it('names the break first', () => {
    const line = weekStatusLine(weekly(), true, 0, 'en');
    expect(line.text).toBe('End your break before clocking out.');
    expect(line.color).toBe(dutyColors.ink60);
  });

  it('warns on a shift longer than 16 hours', () => {
    const line = weekStatusLine(weekly(), false, 16 * 3600 + 1, 'en');
    expect(line.text).toMatch(/longer than a work day/);
    expect(line.color).toBe(dutyColors.amberInk);
  });

  it('keeps the line when weekly data is missing', () => {
    const line = weekStatusLine(undefined, false, 0, 'en');
    expect(line.text).toBe(' ');
  });

  it('says overtime is not allowed', () => {
    const line = weekStatusLine(weekly({ is_over_limit: true, hours_worked: '41.00' }), false, 0, 'en');
    expect(line.text).toBe('Overtime is not allowed');
    expect(line.color).toBe(dutyColors.red);
  });

  it('says the weekly limit is reached', () => {
    const line = weekStatusLine(weekly({
      is_at_limit: true,
      hours_worked: '40.00',
      hours_remaining: '0.00',
    }), false, 0, 'en');
    expect(line.text).toMatch(/Weekly limit reached/);
    expect(line.color).toBe(dutyColors.red);
  });

  it('warns when two hours or fewer remain', () => {
    const line = weekStatusLine(weekly({
      hours_worked: '38.50',
      hours_remaining: '1.50',
    }), false, 0, 'en');
    expect(line.text).toBe('Approaching weekly limit · 1.50 h');
    expect(line.color).toBe(dutyColors.amberInk);
  });

  it('shows hours left in a quiet week', () => {
    const line = weekStatusLine(weekly(), false, 0, 'en');
    expect(line.text).toBe('17.50 h left this week');
    expect(line.color).toBe(dutyColors.ink40);
  });
});

describe('greetingKey', () => {
  it('splits the day into morning, afternoon, and evening', () => {
    expect(greetingKey(new Date(2026, 8, 3, 8, 0))).toBe('goodMorning');
    expect(greetingKey(new Date(2026, 8, 3, 14, 0))).toBe('goodAfternoon');
    expect(greetingKey(new Date(2026, 8, 3, 19, 0))).toBe('goodEvening');
  });
});
