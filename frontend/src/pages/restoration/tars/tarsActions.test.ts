import { describe, expect, it } from 'vitest';
import type { RestorationActionDTO } from '../../../types/inventory.types';
import {
  ACTION_CATEGORIES,
  actionScopeLabel,
  actionsForScope,
  actionsNewestFirst,
  blockingAction,
  categoryMeta,
  formatDuration,
  scopesWorked,
} from './tarsActions';

function action(overrides: Partial<RestorationActionDTO> = {}): RestorationActionDTO {
  return {
    id: 1,
    grade: '',
    category: 'inspect',
    description: 'Initial item inspection',
    seconds: 0,
    started_at: '2026-08-12T12:00:00Z',
    ended_at: null,
    created_by: 1,
    is_described: true,
    ...overrides,
  };
}

describe('the vocabulary of work', () => {
  it('offers five kinds, each with its own colour', () => {
    expect(ACTION_CATEGORIES).toHaveLength(5);
    expect(new Set(ACTION_CATEGORIES.map((c) => c.color)).size).toBe(5);
  });

  it('keeps inspect separate from test, because finding out is not verifying', () => {
    const ids = ACTION_CATEGORIES.map((c) => c.id);
    expect(ids).toContain('inspect');
    expect(ids).toContain('test');
  });

  it('names every one of them with a verb', () => {
    expect(ACTION_CATEGORIES.map((c) => c.label)).toEqual([
      'Inspect',
      'Test',
      'Repair',
      'Assemble',
      'Salvage',
    ]);
  });

  it('falls back rather than rendering a blank chip', () => {
    expect(categoryMeta('repair').label).toBe('Repair');
    expect(categoryMeta('nonsense').label).toBe('Inspect');
  });
});

describe('scope', () => {
  it('calls the whole item what it is', () => {
    expect(actionScopeLabel('')).toBe('Item');
    expect(actionScopeLabel('Like-New')).toBe('Like-New');
  });

  it('lists the item ahead of the grades', () => {
    const actions = [
      action({ id: 1, grade: 'Working' }),
      action({ id: 2, grade: '' }),
      action({ id: 3, grade: 'Repairable' }),
    ];
    expect(scopesWorked(actions)).toEqual(['', 'Repairable', 'Working']);
  });

  it('counts each scope once however many times it was worked', () => {
    const actions = [
      action({ id: 1, grade: 'Working' }),
      action({ id: 2, grade: 'Working' }),
    ];
    expect(scopesWorked(actions)).toEqual(['Working']);
  });

  it('picks out only the actions on one scope', () => {
    const actions = [
      action({ id: 1, grade: '' }),
      action({ id: 2, grade: 'Working' }),
      action({ id: 3, grade: 'Working' }),
    ];
    expect(actionsForScope(actions, 'Working').map((a) => a.id)).toEqual([3, 2]);
    expect(actionsForScope(actions, '').map((a) => a.id)).toEqual([1]);
  });
});

describe('reading order', () => {
  it('shows the newest first without disturbing the stored order', () => {
    const actions = [action({ id: 1 }), action({ id: 2 }), action({ id: 3 })];
    expect(actionsNewestFirst(actions).map((a) => a.id)).toEqual([3, 2, 1]);
    expect(actions.map((a) => a.id)).toEqual([1, 2, 3]);
  });
});

describe('formatDuration', () => {
  it('reads as minutes below an hour', () => {
    expect(formatDuration(0)).toBe('<1m');
    expect(formatDuration(29)).toBe('<1m');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(3540)).toBe('59m');
  });

  it('reads as hours and minutes above one', () => {
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(5400)).toBe('1h 30m');
    expect(formatDuration(7260)).toBe('2h 1m');
  });

  it('never reports negative time', () => {
    expect(formatDuration(-500)).toBe('<1m');
  });
});

describe('blockingAction', () => {
  it('is nothing when the current work has been described', () => {
    expect(blockingAction([action({ id: 1, is_described: true })], 1)).toBeNull();
  });

  it('names the undescribed work standing in the way', () => {
    const blocked = blockingAction([action({ id: 1, is_described: false })], 1);
    expect(blocked?.id).toBe(1);
  });

  it('is nothing when no action is current', () => {
    expect(blockingAction([action({ id: 1, is_described: false })], null)).toBeNull();
  });

  it('only ever blocks on the current action, not an older undescribed one', () => {
    const actions = [action({ id: 1, is_described: false }), action({ id: 2, is_described: true })];
    expect(blockingAction(actions, 2)).toBeNull();
  });

  it('does not block on an action that is not in the list', () => {
    expect(blockingAction([action({ id: 1 })], 999)).toBeNull();
  });
});
