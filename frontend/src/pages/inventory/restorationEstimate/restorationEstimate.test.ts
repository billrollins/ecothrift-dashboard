import { describe, expect, it } from 'vitest';
import {
  EMPTY_ESTIMATE,
  estimateFromSaved,
  estimatePayload,
  estimateProblems,
  toggleWork,
} from './restorationEstimate';

describe('restoration estimates', () => {
  it('names what is missing, in field order', () => {
    expect(estimateProblems(EMPTY_ESTIMATE)).toEqual([
      'Pick the work it needs.',
      'Give the hours or the parts cost.',
      'Give what it is worth after the work.',
    ]);
  });

  it('hours or parts cost is enough with the work and value after', () => {
    const form = { ...toggleWork(EMPTY_ESTIMATE, 'repair'), hours: '1.5', valueAfter: '$60' };
    expect(estimateProblems(form)).toEqual([]);
    expect(estimatePayload(form)).toEqual({ work: ['repair'], hours: '1.5', parts_cost: undefined, value_after: '$60' });
    expect(estimateProblems({ ...form, hours: '', partsCost: '8' })).toEqual([]);
    expect(estimateProblems({ ...form, valueAfter: '0' })).toEqual(['Give what it is worth after the work.']);
  });

  it('toggles work and reads a saved estimate back', () => {
    const twice = toggleWork(toggleWork(EMPTY_ESTIMATE, 'test'), 'test');
    expect(twice.work).toEqual([]);
    expect(estimateFromSaved({ work: ['salvage', 'test'], parts_cost: '8.00', value_after: '50.00' })).toEqual({
      work: ['test', 'salvage'], hours: '', partsCost: '8.00', valueAfter: '50.00',
    });
    expect(estimateFromSaved(null)).toEqual(EMPTY_ESTIMATE);
  });
});
