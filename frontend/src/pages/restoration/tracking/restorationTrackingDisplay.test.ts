import { describe, expect, it } from 'vitest';
import { ageTone, daysText } from './restorationTrackingDisplay';

describe('restorationTrackingDisplay', () => {
  it('says days plainly', () => {
    expect(daysText(null)).toBe('-');
    expect(daysText(0.4)).toBe('today');
    expect(daysText(1.6)).toBe('1 day');
    expect(daysText(12)).toBe('12 days');
  });

  it('tones by age', () => {
    expect(ageTone(3)).toBe('default');
    expect(ageTone(15)).toBe('warning');
    expect(ageTone(31)).toBe('error');
  });
});
