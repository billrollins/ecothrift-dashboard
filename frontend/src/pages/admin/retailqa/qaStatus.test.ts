import { describe, expect, it } from 'vitest';
import { qaStatusWord } from './qaStatus';

describe('qaStatusWord', () => {
  it('never prints raw engine keys', () => {
    expect(qaStatusWord('not_started')).toBe('Due');
    expect(qaStatusWord('own_part')).toBe('Due');
    expect(qaStatusWord('not_assigned')).toBe('Unassigned');
    expect(qaStatusWord('Done')).toBe('Done');
  });
});
