import { describe, expect, it } from 'vitest';
import { scoreboardVerdict } from './TarsScoreboard';
import type { RestorationScoreboardDTO } from '../../../types/inventory.types';

/**
 * The verdict is three bands, not pass/fail. Below the floor the hour costs more
 * than it makes; between floor and benchmark the work pays but is worse than
 * usual; above it, no further deliberation is useful.
 */

function window(overrides: Partial<RestorationScoreboardDTO['today']> = {}) {
  return {
    start: '2026-08-12',
    end: '2026-08-12',
    value_added: '100.00',
    items: 2,
    items_measured: 2,
    items_unmeasured: 0,
    hours: '2.00',
    per_hour: '50.00',
    ...overrides,
  };
}

function board(overrides: Partial<RestorationScoreboardDTO> = {}): RestorationScoreboardDTO {
  return {
    as_of: '2026-08-12',
    today: window(),
    week: window(),
    four_week: { ...window(), weekly_average_value: '100.00', weekly_average_items: '2.00' },
    per_hour_while_working: '50.00',
    floor_rate: '20.00',
    benchmark_rate: '25.00',
    benchmark_ready: true,
    benchmark_minimum_jobs: 10,
    days: [],
    ...overrides,
  };
}

describe('scoreboardVerdict', () => {
  it('says nothing at all when there is no rate to judge', () => {
    expect(scoreboardVerdict(board({ per_hour_while_working: null }))).toBeNull();
  });

  it('treats an unparseable rate as no rate', () => {
    expect(scoreboardVerdict(board({ per_hour_while_working: 'n/a' }))).toBeNull();
  });

  it('flags a rate below what an hour costs', () => {
    const verdict = scoreboardVerdict(board({ per_hour_while_working: '18.00' }));
    expect(verdict?.label).toBe('below cost');
    expect(verdict?.detail).toContain('$20');
  });

  it('flags a rate that pays but trails the usual', () => {
    const verdict = scoreboardVerdict(board({ per_hour_while_working: '22.00' }));
    expect(verdict?.label).toBe('below usual');
  });

  it('celebrates a rate above the usual', () => {
    expect(scoreboardVerdict(board())?.label).toBe('beating usual');
  });

  it('counts the floor exactly as clearing it, not as below cost', () => {
    expect(scoreboardVerdict(board({ per_hour_while_working: '20.00' }))?.label).not.toBe(
      'below cost',
    );
  });

  it('compares against the floor alone while the benchmark is unproven', () => {
    const verdict = scoreboardVerdict(
      board({ per_hour_while_working: '22.00', benchmark_ready: false }),
    );
    // 22 trails the usual 25, but with too few jobs that bar is not yet a fact.
    expect(verdict?.label).toBe('beating usual');
    expect(verdict?.detail).toContain('$20');
  });

  it('still calls out below-cost work when the benchmark is unproven', () => {
    const verdict = scoreboardVerdict(
      board({ per_hour_while_working: '5.00', benchmark_ready: false, benchmark_rate: null }),
    );
    expect(verdict?.label).toBe('below cost');
  });
});
