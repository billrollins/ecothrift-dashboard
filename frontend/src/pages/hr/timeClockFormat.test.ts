import { describe, expect, it } from 'vitest';
import { elapsedSeconds, formatElapsed, formatHours } from './timeClockFormat';

describe('formatElapsed', () => {
  it('formats hours, minutes, and seconds', () => {
    expect(formatElapsed(3661)).toBe('1:01:01');
  });

  it('never goes negative', () => {
    expect(formatElapsed(-5)).toBe('0:00:00');
  });
});

describe('formatHours', () => {
  it('prints two decimals', () => {
    expect(formatHours('7.5')).toBe('7.50');
  });

  it('treats a blank value as zero', () => {
    expect(formatHours(null)).toBe('0.00');
  });
});

describe('elapsedSeconds', () => {
  const start = Date.parse('2026-09-03T08:00:00.000Z');

  it('subtracts accumulated break minutes', () => {
    expect(elapsedSeconds(
      { clock_in: '2026-09-03T08:00:00.000Z', break_minutes: 30, on_break: false },
      start + 2 * 3600_000,
    )).toBe(90 * 60);
  });

  it('subtracts an active break', () => {
    expect(elapsedSeconds(
      {
        clock_in: '2026-09-03T08:00:00.000Z',
        break_minutes: 0,
        on_break: true,
        break_started_at: '2026-09-03T09:00:00.000Z',
      },
      start + 90 * 60_000,
    )).toBe(60 * 60);
  });

  it('never goes negative', () => {
    expect(elapsedSeconds(
      { clock_in: '2026-09-03T08:00:00.000Z', break_minutes: 600, on_break: false },
      start + 60_000,
    )).toBe(0);
  });
});
