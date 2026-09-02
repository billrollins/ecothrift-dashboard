import { describe, expect, it } from 'vitest';
import { groupRoutineRuns } from './groupRoutineRuns';
import { fakeRun as run } from './routineFixture';

describe('groupRoutineRuns', () => {
  it('keeps blocking out of the other buckets', () => {
    const blocking = run({ id: 1, is_blocking: true, is_overdue: true });
    const overdue = run({ id: 2, is_overdue: true, due_at: '2026-01-01T17:00:00' });
    const grouped = groupRoutineRuns([blocking, overdue], []);
    expect(grouped.blocking).toHaveLength(1);
    expect(grouped.overdue).toHaveLength(1);
    expect(grouped.today).toHaveLength(0);
    expect(grouped.week).toHaveLength(0);
    expect(grouped.done).toHaveLength(0);
  });
});
