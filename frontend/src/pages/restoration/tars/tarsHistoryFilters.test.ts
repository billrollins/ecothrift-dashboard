import { describe, expect, it } from 'vitest';
import { toggleHistoryFilter } from './tarsHistoryFilters';

describe('toggleHistoryFilter', () => {
  it('turns a chip on, then off', () => {
    expect(toggleHistoryFilter('all', 'actions')).toBe('actions');
    expect(toggleHistoryFilter('actions', 'actions')).toBe('all');
    expect(toggleHistoryFilter('inspect', 'inspect')).toBe('all');
  });

  it('switches to a different chip without going through all', () => {
    expect(toggleHistoryFilter('actions', 'notes')).toBe('notes');
  });
});
