import { describe, expect, it } from 'vitest';
import { initialFoundNeeds, shouldAskFoundNeeds } from './FoundNeeds';

describe('what did you find? (owner, 2026-10-28)', () => {
  it('starts from what was found, else what Processing asked', () => {
    expect(initialFoundNeeds({ requested_needs: ['test', 'assemble'], found_needs: [] })).toEqual(['test', 'assemble']);
    expect(initialFoundNeeds({ requested_needs: ['test'], found_needs: ['repair'] })).toEqual(['repair']);
    expect(initialFoundNeeds(null)).toEqual([]);
  });

  it('asks once, on the bench, for a request still unanswered', () => {
    const none = new Set<number>();
    const job = { id: 7, stage: 'bench' as const, requested_needs: ['test' as const], found_needs: [] };
    expect(shouldAskFoundNeeds(job, none)).toBe(true);
    expect(shouldAskFoundNeeds({ ...job, found_needs: ['test' as const] }, none)).toBe(false);
    expect(shouldAskFoundNeeds({ ...job, stage: 'queued' as const }, none)).toBe(false);
    expect(shouldAskFoundNeeds({ ...job, requested_needs: [] }, none)).toBe(false); // old jobs: no request
    expect(shouldAskFoundNeeds(job, new Set([7]))).toBe(false); // Later
  });
});
