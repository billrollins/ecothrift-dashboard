import { describe, expect, it } from 'vitest';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import {
  bestGrade,
  buildGradeRows,
  estimatesToGo,
  evaluateGrade,
  rateBand,
  readBenchPlan,
  writeBenchPlan,
  type TarsBenchPlan,
} from './tarsBenchPlan';

const SCALE = ['Working', 'Repairable', 'Parts-only'];

function job(values: Record<string, number> = { Working: 100, Repairable: 40, 'Parts-only': 10 }) {
  return { id: 1, scale: 'Functional', grade_values: values } as RestorationJobDTO;
}

function plan(overrides: Partial<TarsBenchPlan> = {}): TarsBenchPlan {
  return { startingGrade: 'Repairable', estimates: {}, ...overrides };
}

describe('evaluateGrade', () => {
  it('is the gain over where the item is now, weighted and net of parts', () => {
    // (100 - 40) * 0.5 - 10 = 20, over half an hour = $40/hr
    const row = evaluateGrade(job(), plan({ estimates: { Working: { p: 50, parts: 10, minutes: 30 } } }), 'Working');
    expect(row.expected).toBe(20);
    expect(row.rate).toBe(40);
  });

  it('never counts minutes already spent', () => {
    const spent = { ...job(), look_seconds: 9000, work_seconds: 9000 } as RestorationJobDTO;
    const row = evaluateGrade(spent, plan({ estimates: { Working: { p: 50, parts: 10, minutes: 30 } } }), 'Working');
    expect(row.rate).toBe(40);
  });

  it('treats an unanswered probability as zero rather than guessing', () => {
    const row = evaluateGrade(job(), plan({ estimates: { Working: { parts: 0, minutes: 60 } } }), 'Working');
    expect(row.expected).toBe(0);
  });

  it('goes negative when the parts cost more than the grade is likely to return', () => {
    const row = evaluateGrade(job(), plan({ estimates: { Working: { p: 10, parts: 50, minutes: 60 } } }), 'Working');
    expect(row.expected).toBe(-44);
    expect(row.rate).toBe(-44);
  });

  it('gives no rate for a grade needing no work, rather than an infinite one', () => {
    const row = evaluateGrade(job(), plan({ estimates: { Working: { p: 100, parts: 0, minutes: 0 } } }), 'Working');
    expect(row.expected).toBe(60);
    expect(row.rate).toBeNull();
  });

  it('cannot compute anything without a price on the target grade', () => {
    const row = evaluateGrade(job({ Repairable: 40 }), plan({ estimates: { Working: { p: 50, minutes: 30 } } }), 'Working');
    expect(row.expected).toBeNull();
    expect(row.rate).toBeNull();
  });

  it('cannot compute anything without knowing where the item is now', () => {
    const row = evaluateGrade(job(), plan({ startingGrade: '' }), 'Working');
    expect(row.expected).toBeNull();
  });

  it('marks the grade the item arrived at', () => {
    expect(evaluateGrade(job(), plan(), 'Repairable').isStart).toBe(true);
    expect(evaluateGrade(job(), plan(), 'Working').isStart).toBe(false);
  });

  it('values a downgrade below where the item already is as a loss', () => {
    const row = evaluateGrade(job(), plan({ estimates: { 'Parts-only': { p: 100, parts: 0, minutes: 30 } } }), 'Parts-only');
    expect(row.expected).toBe(-30);
  });
});

describe('estimatesToGo', () => {
  it('counts all three when nothing is answered', () => {
    expect(estimatesToGo({})).toBe(3);
  });

  it('counts what is left after a probability is set', () => {
    expect(estimatesToGo({ p: 50 })).toBe(2);
    expect(estimatesToGo({ p: 50, parts: 0 })).toBe(1);
    expect(estimatesToGo({ p: 50, parts: 0, minutes: 30 })).toBe(0);
  });

  it('asks nothing more of a grade judged impossible', () => {
    expect(estimatesToGo({ p: 0 })).toBe(0);
  });

  it('treats a free grade as answered, not unanswered', () => {
    expect(estimatesToGo({ p: 50, parts: 0, minutes: 5 })).toBe(0);
  });
});

describe('buildGradeRows', () => {
  it('ranks the best rate first', () => {
    const rows = buildGradeRows(
      job(),
      plan({
        estimates: {
          Working: { p: 50, parts: 0, minutes: 60 },
          'Parts-only': { p: 100, parts: 0, minutes: 5 },
        },
      }),
      SCALE,
    );
    expect(rows[0].grade).toBe('Working');
  });

  it('sinks the grade the item is already at to the bottom', () => {
    const rows = buildGradeRows(job(), plan(), SCALE);
    expect(rows[rows.length - 1].grade).toBe('Repairable');
  });

  it('keeps rated rows above rows that cannot be rated yet', () => {
    const rows = buildGradeRows(job(), plan({ estimates: { 'Parts-only': { p: 50, minutes: 30 } } }), SCALE);
    expect(rows[0].grade).toBe('Parts-only');
  });

  it('returns every grade on the scale even when nothing is estimated', () => {
    expect(buildGradeRows(job(), plan(), SCALE).map((r) => r.grade).sort()).toEqual([...SCALE].sort());
  });

  it('falls back to the priced grades when the scale is not known', () => {
    expect(buildGradeRows(job(), plan(), []).length).toBe(3);
  });
});

describe('bestGrade', () => {
  it('picks the top rated row', () => {
    const rows = buildGradeRows(job(), plan({ estimates: { Working: { p: 50, parts: 0, minutes: 60 } } }), SCALE);
    expect(bestGrade(rows)?.grade).toBe('Working');
  });

  it('is nothing when no row can be rated', () => {
    expect(bestGrade(buildGradeRows(job(), plan(), SCALE))).toBeNull();
  });

  it('never recommends staying where the item already is', () => {
    const rows = buildGradeRows(job(), plan({ estimates: { Repairable: { p: 100, parts: 0, minutes: 30 } } }), SCALE);
    expect(bestGrade(rows)).toBeNull();
  });

  it('will still name a losing option, since the operator decides', () => {
    const rows = buildGradeRows(job(), plan({ estimates: { Working: { p: 5, parts: 90, minutes: 60 } } }), SCALE);
    expect(bestGrade(rows)?.grade).toBe('Working');
    expect(bestGrade(rows)?.rate).toBeLessThan(0);
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

describe('reading and writing the plan', () => {
  it('survives every shape of missing', () => {
    for (const session of [undefined, {}, { benchPlan: null }, { benchPlan: 'nope' }, { benchPlan: {} }]) {
      const read = readBenchPlan(session);
      expect(read.startingGrade).toBe('');
      expect(read.estimates).toEqual({});
    }
  });

  it('reads back what it wrote', () => {
    const original = plan({ estimates: { Working: { p: 75 } } });
    expect(readBenchPlan(writeBenchPlan({}, original))).toEqual(original);
  });

  it('leaves the rest of the session alone', () => {
    const written = writeBenchPlan({ parts: ['keep me'] }, plan());
    expect(written.parts).toEqual(['keep me']);
  });
});
