import { describe, expect, it } from 'vitest';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import type { TarsBenchPlan } from './tarsBenchPlan';
import { bestRemainingGrade, valueAdded, valueLeft } from './tarsBenchValue';

const SCALE = ['Working', 'Repairable', 'Parts-only'];

function job(values: Record<string, number> = { Working: 100, Repairable: 40, 'Parts-only': 10 }) {
  return { id: 1, scale: 'Functional', grade_values: values } as RestorationJobDTO;
}

function plan(overrides: Partial<TarsBenchPlan> = {}): TarsBenchPlan {
  return { startingGrade: 'Repairable', currentGrade: 'Repairable', estimates: {}, ...overrides };
}

describe('valueAdded', () => {
  it('is current minus original minus parts spent', () => {
    expect(valueAdded(job(), plan({ currentGrade: 'Working' }), 6)).toBe(54);
  });

  it('is null when a price is missing', () => {
    expect(valueAdded(job({ Working: 100 }), plan())).toBeNull();
  });
});

describe('valueLeft', () => {
  it('is the gap to the highest other priced grade, net of remaining parts', () => {
    expect(valueLeft(job(), plan(), SCALE)).toBe(60);
    expect(valueLeft(job(), plan(), SCALE, 10)).toBe(50);
  });

  it('is zero when current is already the top priced grade', () => {
    expect(valueLeft(job(), plan({ currentGrade: 'Working' }), SCALE)).toBe(0);
  });

  it('is null when current has no price', () => {
    expect(valueLeft(job({ Working: 100 }), plan({ startingGrade: '', currentGrade: '' }), SCALE)).toBeNull();
  });
});

describe('bestRemainingGrade', () => {
  it('skips the current grade', () => {
    expect(bestRemainingGrade(job(), plan(), SCALE)).toBe('Working');
    expect(bestRemainingGrade(job(), plan({ currentGrade: 'Working' }), SCALE)).toBe('Repairable');
  });
});
