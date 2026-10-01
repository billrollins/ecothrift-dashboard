import { describe, expect, it } from 'vitest';
import { PROBLEM_RULES, REPORTABLE, priceFromNote } from './countProblems';

describe('count problems', () => {
  it('gives every problem one to three answers, so an answer takes seconds', () => {
    for (const [kind, rule] of Object.entries(PROBLEM_RULES)) {
      expect(rule.answers.length, kind).toBeGreaterThanOrEqual(1);
      expect(rule.answers.length, kind).toBeLessThanOrEqual(3);
      expect(rule.title.length, kind).toBeLessThanOrEqual(32);
    }
  });

  it('only sends a wrong-section item to the relocate cart', () => {
    for (const [kind, rule] of Object.entries(PROBLEM_RULES)) {
      expect(rule.answers.some((a) => a.action === 'relocate'), kind).toBe(kind === 'wrong_section');
    }
  });

  it('lets a person report the problems a scan cannot see', () => {
    expect(REPORTABLE).toEqual(['wrong_title', 'wrong_tag', 'price_high', 'price_low', 'wrong_section']);
  });

  it('reads a price out of the note', () => {
    expect(priceFromNote('should be $12')).toBe('12.00');
    expect(priceFromNote('7.5')).toBe('7.50');
    expect(priceFromNote('too much')).toBe('');
  });
});
