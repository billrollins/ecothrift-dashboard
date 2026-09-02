import { describe, expect, it } from 'vitest';
import type { AdminRoutine } from '../../../api/routines.api';
import {
  attentionScore,
  DEFAULT_ADMIN_FILTERS,
  flagCounts,
  toggleFlag,
  visibleRows,
} from './adminRoutineFilters';
import { fakeRoutine } from '../../routines/routineFixture';

type Seed = Partial<Omit<AdminRoutine, 'stats'>> & { stats?: Partial<AdminRoutine['stats']> };

function routine(over: Seed = {}): AdminRoutine {
  const { stats, ...rest } = over;
  return {
    ...fakeRoutine({
      title: 'Opening',
      due_time: '09:00:00',
      assigned_department: 2,
      assigned_department_name: 'Retail',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }),
    created_by_name: 'Bill',
    ...rest,
    stats: {
      done: 5,
      passed: 5,
      critical_fails: 0,
      open: 1,
      overdue: 0,
      missed: 0,
      last_completed_at: '2026-08-30T22:00:00Z',
      last_completed_by_name: 'Sam',
      next_due_at: '2026-09-01T22:00:00Z',
      assignee_count: 3,
      ...stats,
    },
  };
}

const rows: AdminRoutine[] = [
  routine({ id: 1, title: 'Opening' }),
  routine({ id: 2, title: 'Closing', stats: { overdue: 2 } }),
  routine({ id: 3, title: 'Retired one', is_active: false }),
  routine({ id: 4, title: 'Nobody', stats: { assignee_count: 0 }, assigned_department: null, assigned_department_name: null }),
  routine({ id: 5, title: 'Fresh weekly', trigger: 'weekly', is_blocking: true, stats: { done: 0, last_completed_at: null } }),
];

describe('visibleRows', () => {
  it('hides retired rows by default and puts trouble first', () => {
    const ids = visibleRows(rows, DEFAULT_ADMIN_FILTERS).map((r) => r.id);
    expect(ids).toEqual([2, 4, 5, 1]);
  });

  it('shows only retired rows when asked', () => {
    expect(visibleRows(rows, { ...DEFAULT_ADMIN_FILTERS, status: 'retired' }).map((r) => r.id)).toEqual([3]);
  });

  it('narrows by health chip, department, repeat, and search', () => {
    expect(visibleRows(rows, { ...DEFAULT_ADMIN_FILTERS, flags: ['overdue'] }).map((r) => r.id)).toEqual([2]);
    expect(visibleRows(rows, { ...DEFAULT_ADMIN_FILTERS, department: 'none' }).map((r) => r.id)).toEqual([4]);
    expect(visibleRows(rows, { ...DEFAULT_ADMIN_FILTERS, trigger: 'weekly' }).map((r) => r.id)).toEqual([5]);
    expect(visibleRows(rows, { ...DEFAULT_ADMIN_FILTERS, query: 'clos' }).map((r) => r.id)).toEqual([2]);
    expect(visibleRows(rows, { ...DEFAULT_ADMIN_FILTERS, query: 'sam' })).toHaveLength(4);
  });

  it('sorts by title, last done, and next due when asked', () => {
    expect(visibleRows(rows, { ...DEFAULT_ADMIN_FILTERS, sort: 'title' }).map((r) => r.title))
      .toEqual(['Closing', 'Fresh weekly', 'Nobody', 'Opening']);
    const lastDone = visibleRows(rows, { ...DEFAULT_ADMIN_FILTERS, sort: 'lastDone' }).map((r) => r.id);
    expect(lastDone[lastDone.length - 1]).toBe(5);
    const nextDue = visibleRows(
      [routine({ id: 7, stats: { next_due_at: null } }), routine({ id: 8, stats: { next_due_at: '2026-09-02T00:00:00Z' } }), routine({ id: 9 })],
      { ...DEFAULT_ADMIN_FILTERS, sort: 'nextDue' },
    ).map((r) => r.id);
    expect(nextDue).toEqual([9, 8, 7]);
  });
});

describe('flag helpers', () => {
  it('counts each health flag across the rows in view', () => {
    expect(flagCounts(rows)).toEqual({ overdue: 1, neverRun: 1, unassigned: 1, blocking: 1 });
  });

  it('toggles a chip on and off', () => {
    expect(toggleFlag([], 'overdue')).toEqual(['overdue']);
    expect(toggleFlag(['overdue', 'blocking'], 'overdue')).toEqual(['blocking']);
  });

  it('ranks overdue above unassigned above never run, and retired last', () => {
    expect(attentionScore(rows[1])).toBeGreaterThan(attentionScore(rows[3]));
    expect(attentionScore(rows[3])).toBeGreaterThan(attentionScore(rows[4]));
    expect(attentionScore(rows[4])).toBeGreaterThan(attentionScore(rows[0]));
    expect(attentionScore(rows[2])).toBeLessThan(attentionScore(rows[0]));
  });
});
