import { describe, expect, it } from 'vitest';
import { matchesQuery } from './matchesQuery';

describe('matchesQuery', () => {
  it('matches everything when the box is empty', () => {
    expect(matchesQuery('   ', 'Opening checklist')).toBe(true);
  });

  it('ignores case and searches every field', () => {
    expect(matchesQuery('RETAIL', 'Opening checklist', 'Retail Operations')).toBe(true);
    expect(matchesQuery('bales', 'Opening checklist', 'Retail Operations')).toBe(false);
  });

  it('survives missing fields', () => {
    expect(matchesQuery('open', 'Opening checklist', null, undefined)).toBe(true);
  });
});
