import { describe, expect, it } from 'vitest';
import type { RestorationScoreboardDTO } from '../../../types/inventory.types';

function window(overrides: Partial<RestorationScoreboardDTO['today']> = {}) {
  return {
    start: '2026-08-12',
    end: '2026-08-12',
    value_added: '100.00',
    items: 2,
    items_measured: 2,
    items_unmeasured: 0,
    ...overrides,
  };
}

function board(overrides: Partial<RestorationScoreboardDTO> = {}): RestorationScoreboardDTO {
  return {
    as_of: '2026-08-12',
    today: window(),
    week: window(),
    four_week: { ...window(), weekly_average_value: '100.00', weekly_average_items: '2.00' },
    days: [],
    ...overrides,
  };
}

describe('restoration scoreboard payload', () => {
  it('carries value-added windows without a live hourly rate', () => {
    const payload = board();
    expect(payload.today.value_added).toBe('100.00');
    expect(payload.week.items).toBe(2);
    expect(payload.four_week.weekly_average_value).toBe('100.00');
    expect('per_hour_while_working' in payload).toBe(false);
  });
});
