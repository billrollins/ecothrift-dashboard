import { describe, expect, it } from 'vitest';
import { clockOffset, elapsedSeconds, formatElapsed, ratePerMinute } from './countTimer';

describe('count timer', () => {
  it('formats elapsed time', () => {
    expect(formatElapsed(7)).toBe('0:07');
    expect(formatElapsed(754)).toBe('12:34');
    expect(formatElapsed(3723)).toBe('1:02:03');
    expect(formatElapsed(-5)).toBe('0:00');
  });

  it('gives scans per minute, and nothing for the first seconds', () => {
    expect(ratePerMinute(1, 2)).toBe(0);
    expect(ratePerMinute(30, 120)).toBe(15);
    expect(ratePerMinute(10, 45)).toBe(13.3);
    expect(ratePerMinute(0, 100)).toBe(0);
  });

  it('counts from the server clock, not the phone clock', () => {
    const phoneNow = Date.parse('2026-10-01T15:00:30Z'); // the phone is 30 s fast
    const offset = clockOffset('2026-10-01T15:00:00Z', phoneNow);
    expect(offset).toBe(-30000);
    expect(elapsedSeconds('2026-10-01T14:58:00Z', phoneNow, offset)).toBe(120);
    expect(elapsedSeconds('2026-10-01T14:58:00Z', phoneNow, offset, '2026-10-01T14:59:00Z')).toBe(60);
    expect(clockOffset(undefined, phoneNow)).toBe(0);
  });
});
