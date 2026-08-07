import { describe, expect, it } from 'vitest';
import { describeWhen } from './presentation';

// Fixed "now" = Thu Aug 6, 2026 1:00 PM America/Chicago (CDT, UTC-5).
const NOW = new Date('2026-08-06T18:00:00.000Z');

describe('describeWhen', () => {
  it('labels a future time today as Today with countdown for deadlines', () => {
    const parts = describeWhen('2026-08-06T23:00:00.000Z', NOW, 'deadline');
    expect(parts?.dayLabel).toBe('Today');
    expect(parts?.bucket).toBe('today');
    expect(parts?.timeLabel).toMatch(/left/);
  });

  it('labels tomorrow', () => {
    const parts = describeWhen('2026-08-07T23:00:00.000Z', NOW, 'deadline');
    expect(parts?.dayLabel).toBe('Tomorrow');
    expect(parts?.bucket).toBe('tomorrow');
  });

  it('labels an overdue deadline as Expired', () => {
    const parts = describeWhen('2026-08-06T15:00:00.000Z', NOW, 'deadline');
    expect(parts?.dayLabel).toBe('Expired');
    expect(parts?.bucket).toBe('expired');
  });

  it('labels yesterday for past-oriented stamps', () => {
    const parts = describeWhen('2026-08-05T18:00:00.000Z', NOW, 'happened');
    expect(parts?.dayLabel).toBe('Yesterday');
    expect(parts?.bucket).toBe('yesterday');
  });

  it('uses a weekday within the coming week', () => {
    // Sat Aug 8 from Thu Aug 6 (America/Chicago).
    const parts = describeWhen('2026-08-08T18:00:00.000Z', NOW, 'deadline');
    expect(parts?.dayLabel).toBe('Sat');
    expect(parts?.bucket).toBe('soon');
  });
});
