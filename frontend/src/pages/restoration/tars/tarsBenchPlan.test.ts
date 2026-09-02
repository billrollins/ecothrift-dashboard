import { describe, expect, it } from 'vitest';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import {
  bestGrade,
  buildGradeRows,
  claimBenchGrade,
  lowestValueGrade,
  withLowestValueStart,
  evaluateGrade,
  minSellsFor,
  normalizeBenchPlan,
  rateBand,
  readBenchPlan,
  type TarsBenchPlan,
} from './tarsBenchPlan';
import { normalizeWorkSession } from './tarsJobAdapter';
import { createEmptyWorkSession } from './tarsWorkRollup';

const SCALE = ['Working', 'Repairable', 'Parts-only'];

function job(values: Record<string, number> = { Working: 100, Repairable: 40, 'Parts-only': 10 }) {
  return { id: 1, scale: 'Functional', grade_values: values } as RestorationJobDTO;
}

function plan(overrides: Partial<TarsBenchPlan> = {}): TarsBenchPlan {
  return { startingGrade: 'Repairable', currentGrade: 'Repairable', estimates: {}, ...overrides };
}

describe('evaluateGrade', () => {
  it('is the gain over the lowest priced grade, net of order parts', () => {
    // (100 - 10) - 10 = 80, over half an hour = $160/hr
    const row = evaluateGrade(
      job(),
      plan({ estimates: { Working: { minutes: 30 } } }),
      'Working',
      undefined,
      { min: 10, max: 10 },
    );
    expect(row.expected).toBe(80);
    expect(row.rate).toBe(160);
    expect(row.partsFromList).toBe(true);
    expect(row.hasPartsRange).toBe(false);
  });

  it('ignores a leftover parts estimate - minutes are the only bench guess', () => {
    const row = evaluateGrade(
      job(),
      plan({ estimates: { Working: { parts: 40, minutes: 30 } } }),
      'Working',
    );
    expect(row.partsDollars).toBe(0);
    expect(row.partsFromList).toBe(false);
    expect(row.expected).toBe(90);
    expect(row.rate).toBe(180);
  });

  it('uses a min-max when two order paths disagree', () => {
    const row = evaluateGrade(
      job(),
      plan({ estimates: { Working: { minutes: 30 } } }),
      'Working',
      undefined,
      { min: 10, max: 40 },
    );
    expect(row.partsFromList).toBe(true);
    expect(row.hasPartsRange).toBe(true);
    expect(row.partsDollars).toBe(10);
    expect(row.partsDollarsMax).toBe(40);
    expect(row.expected).toBe(80);
    expect(row.expectedMax).toBe(50);
    expect(row.rate).toBe(160);
    expect(row.rateLow).toBe(100);
  });

  it('never counts minutes already spent', () => {
    const spent = { ...job(), look_seconds: 9000, work_seconds: 9000 } as RestorationJobDTO;
    const row = evaluateGrade(
      spent,
      plan({ estimates: { Working: { minutes: 30 } } }),
      'Working',
      undefined,
      { min: 10, max: 10 },
    );
    expect(row.rate).toBe(160);
  });

  it('goes negative when the parts cost more than the grade returns over the floor', () => {
    const row = evaluateGrade(
      job(),
      plan({ estimates: { Working: { minutes: 60 } } }),
      'Working',
      undefined,
      { min: 95, max: 95 },
    );
    expect(row.expected).toBe(-5);
    expect(row.rate).toBe(-5);
  });

  it('gives no rate for a grade needing no work, rather than an infinite one', () => {
    const row = evaluateGrade(job(), plan({ estimates: { Working: { minutes: 0 } } }), 'Working');
    expect(row.expected).toBe(90);
    expect(row.rate).toBeNull();
  });

  it('cannot compute anything without a price on the target grade', () => {
    const row = evaluateGrade(job({ Repairable: 40 }), plan({ estimates: { Working: { minutes: 30 } } }), 'Working');
    expect(row.expected).toBeNull();
    expect(row.rate).toBeNull();
  });

  it('cannot compute anything without a priced grade on the scale', () => {
    const row = evaluateGrade(job({}), plan({ estimates: { Working: { parts: 0, minutes: 30 } } }), 'Working');
    expect(row.expected).toBeNull();
    expect(row.rate).toBeNull();
  });

  it('does not use the starting grade as the money baseline', () => {
    const fromWorking = evaluateGrade(
      job(),
      plan({ startingGrade: 'Working', estimates: { Working: { parts: 0, minutes: 30 } } }),
      'Working',
    );
    const fromRepairable = evaluateGrade(
      job(),
      plan({ startingGrade: 'Repairable', estimates: { Working: { parts: 0, minutes: 30 } } }),
      'Working',
    );
    expect(fromWorking.expected).toBe(90);
    expect(fromRepairable.expected).toBe(90);
  });

  it('marks the grade the item is at now', () => {
    expect(evaluateGrade(job(), plan(), 'Repairable').isStart).toBe(true);
    expect(evaluateGrade(job(), plan(), 'Working').isStart).toBe(false);
    expect(
      evaluateGrade(job(), plan({ currentGrade: 'Working' }), 'Working').isStart,
    ).toBe(true);
  });

  it('values the lowest priced grade as zero gain before parts', () => {
    const row = evaluateGrade(job(), plan({ estimates: { 'Parts-only': { parts: 0, minutes: 30 } } }), 'Parts-only');
    expect(row.expected).toBe(0);
  });
});

describe('minSellsFor', () => {
  it('is the lowest finite price on the grades shown', () => {
    expect(minSellsFor(job(), SCALE)).toBe(10);
  });

  it('skips unpriced grades', () => {
    expect(minSellsFor(job({ Working: 100, Repairable: 40 }), SCALE)).toBe(40);
  });
});

describe('buildGradeRows', () => {
  it('keeps the scale order, so a grade is always in the same place', () => {
    const rows = buildGradeRows(
      job(),
      plan({
        estimates: {
          Working: { parts: 0, minutes: 60 },
          'Parts-only': { parts: 0, minutes: 5 },
        },
      }),
      SCALE,
    );
    expect(rows.map((r) => r.grade)).toEqual(SCALE);
  });

  it('does not move the grade the item is already at', () => {
    const rows = buildGradeRows(job(), plan(), SCALE);
    expect(rows[1].grade).toBe('Repairable');
    expect(rows[1].isStart).toBe(true);
  });

  it('does not reorder when an estimate changes', () => {
    const before = buildGradeRows(job(), plan(), SCALE).map((r) => r.grade);
    const after = buildGradeRows(
      job(),
      plan({ estimates: { 'Parts-only': { parts: 0, minutes: 1 } } }),
      SCALE,
    ).map((r) => r.grade);
    expect(after).toEqual(before);
  });

  it('returns every grade on the scale even when nothing is estimated', () => {
    expect(buildGradeRows(job(), plan(), SCALE).map((r) => r.grade)).toEqual(SCALE);
  });

  it('falls back to the priced grades when the scale is not known', () => {
    expect(buildGradeRows(job(), plan(), []).length).toBe(3);
  });
});

describe('bestGrade', () => {
  it('picks the top rated row', () => {
    const rows = buildGradeRows(job(), plan({ estimates: { Working: { parts: 0, minutes: 60 } } }), SCALE);
    expect(bestGrade(rows)?.grade).toBe('Working');
  });

  it('finds the winner wherever it sits in the scale', () => {
    const rows = buildGradeRows(
      job(),
      plan({
        startingGrade: 'Parts-only',
        currentGrade: 'Parts-only',
        estimates: {
          Working: { parts: 0, minutes: 120 },
          Repairable: { parts: 0, minutes: 15 },
        },
      }),
      SCALE,
    );
    expect(rows[0].grade).toBe('Working');
    expect(bestGrade(rows)?.grade).toBe('Repairable');
  });

  it('is nothing when no row can be rated', () => {
    expect(bestGrade(buildGradeRows(job(), plan(), SCALE))).toBeNull();
  });

  it('never recommends staying where the item already is', () => {
    const rows = buildGradeRows(job(), plan({ estimates: { Repairable: { parts: 0, minutes: 30 } } }), SCALE);
    expect(bestGrade(rows)).toBeNull();
  });

  it('will still name a losing option, since the operator decides', () => {
    const rows = buildGradeRows(
      job(),
      plan({ estimates: { Working: { minutes: 60 } } }),
      SCALE,
      { Working: { min: 95, max: 95 } },
    );
    expect(bestGrade(rows)?.grade).toBe('Working');
    expect(bestGrade(rows)?.rate).toBeLessThan(0);
  });

  it('ranks on the cheaper parts path when a grade has a range', () => {
    const rows = buildGradeRows(
      job(),
      plan({
        startingGrade: 'Parts-only',
        currentGrade: 'Parts-only',
        estimates: {
          Working: { minutes: 60 },
          Repairable: { minutes: 15 },
        },
      }),
      SCALE,
      { Working: { min: 10, max: 40 } },
    );
    // Working at $10 parts: (100-10-10)/1 = 80. At $40: 50. Repairable at $0: (40-0-10)/(0.25) = 120.
    expect(bestGrade(rows)?.grade).toBe('Repairable');
    expect(rows[0].rate).toBe(80);
    expect(rows[0].rateLow).toBe(50);
  });
});

describe('rateBand', () => {
  it('is below cost under the floor', () => {
    expect(rateBand(12, 20, 30)).toBe('below-cost');
  });

  it('is below usual between the floor and the benchmark', () => {
    expect(rateBand(25, 20, 30)).toBe('below-usual');
  });

  it('is good at or above the benchmark', () => {
    expect(rateBand(30, 20, 30)).toBe('good');
    expect(rateBand(45, 20, 30)).toBe('good');
  });

  it('is good above the floor when there is no benchmark to beat yet', () => {
    expect(rateBand(25, 20, null)).toBe('good');
  });

  it('is unknown with no rate at all', () => {
    expect(rateBand(null, 20, 30)).toBe('unknown');
  });

  it('treats exactly the floor as paying for itself', () => {
    expect(rateBand(20, 20, null)).toBe('good');
  });
});

describe('reading the plan back', () => {
  it('survives every shape of missing', () => {
    for (const stored of [undefined, null, 'nope', {}, [], 42]) {
      const read = normalizeBenchPlan(stored);
      expect(read.startingGrade).toBe('');
      expect(read.currentGrade).toBe('');
      expect(read.estimates).toEqual({});
    }
  });

  it('reads back parts and minutes', () => {
    const original = plan({ estimates: { Working: { parts: 10, minutes: 30 } } });
    expect(normalizeBenchPlan(original)).toEqual(original);
  });

  it('drops odds and junk rather than feeding them to the arithmetic', () => {
    const read = normalizeBenchPlan({
      startingGrade: 'Parts-only',
      estimates: { Working: { p: 75, parts: 10, minutes: null } },
    });
    expect(read.estimates.Working).toEqual({ parts: 10 });
    expect(read.estimates.Working).not.toHaveProperty('p');
    expect(read.currentGrade).toBe('');
  });

  it('keeps currentGrade and still drops odds', () => {
    const read = normalizeBenchPlan({
      startingGrade: 'Repairable',
      currentGrade: 'Working',
      estimates: { Working: { p: 50, parts: 8, minutes: 20 } },
    });
    expect(read).toEqual({
      startingGrade: 'Repairable',
      currentGrade: 'Working',
      estimates: { Working: { parts: 8, minutes: 20 } },
    });
  });

  it('starts an empty plan on the $0 grade, or the cheapest if none is zero', () => {
    expect(lowestValueGrade(job({ Working: 20, Repairable: 0, 'Parts-only': 5 }), SCALE)).toBe('Repairable');
    expect(lowestValueGrade(job(), SCALE)).toBe('Parts-only');
    expect(lowestValueGrade(job({}), SCALE)).toBe('Parts-only');
    const empty = plan({ startingGrade: '', currentGrade: '' });
    expect(withLowestValueStart(empty, job(), SCALE)).toEqual({
      ...empty,
      startingGrade: 'Parts-only',
      currentGrade: 'Parts-only',
    });
    const claimed = plan({ startingGrade: 'Working', currentGrade: 'Working' });
    expect(withLowestValueStart(claimed, job(), SCALE)).toBe(claimed);
  });

  it('fills both grades on the first claim, then independently', () => {
    const empty = plan({ startingGrade: '', currentGrade: '' });
    const first = claimBenchGrade(empty, 'original', 'Repairable');
    expect(first.startingGrade).toBe('Repairable');
    expect(first.currentGrade).toBe('Repairable');
    const moved = claimBenchGrade(first, 'current', 'Working');
    expect(moved.startingGrade).toBe('Repairable');
    expect(moved.currentGrade).toBe('Working');
  });

  it('ignores a starting grade that is not a grade name', () => {
    expect(normalizeBenchPlan({ startingGrade: 7 }).startingGrade).toBe('');
  });

  /**
   * The regression that cost a session: the plan was stored on the work session
   * as a loose key, and everything that read a session back from the server
   * rebuilt it from an allowlist that did not mention it. Saving worked, and
   * the next refetch silently threw the answers away.
   */
  it('survives a round trip through the work-session normalizer', () => {
    const original = plan({
      startingGrade: 'Parts-only',
      estimates: { Working: { parts: 20, minutes: 45 } },
    });
    const session = normalizeWorkSession({ ...createEmptyWorkSession('bench'), benchPlan: original });
    expect(readBenchPlan(session)).toEqual(original);
  });
});
