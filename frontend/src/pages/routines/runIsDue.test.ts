import { describe, expect, it } from 'vitest';
import { atLeast, runsAtLeast, runsBlockingClockOut, runUrgency } from './runIsDue';
import { runDeadlineLabel } from './runDeadline';
import type { RoutineRun } from '../../api/routines.api';

const noon = new Date('2026-09-01T12:00:00-05:00');

type Moments = Partial<Pick<RoutineRun, 'status' | 'remind_at' | 'nag_at' | 'late_at' | 'id' | 'is_blocking'>>;

function stub(partial: Moments = {}): RoutineRun {
  return {
    id: 1,
    routine: 1,
    title: 'Close',
    intro: '',
    period_key: '2026-09-01',
    subject: '',
    due_at: '2026-09-01T17:50:00-05:00',
    remind_at: '2026-09-01T17:50:00-05:00',
    nag_at: '2026-09-01T17:50:00-05:00',
    late_at: '2026-09-01T23:59:00-05:00',
    kind: 'checklist',
    system_key: null,
    section: null,
    section_name: null,
    generated: {},
    assigned_to: null,
    assigned_to_name: null,
    department_name: 'Retail',
    status: 'open',
    is_blocking: false,
    is_overdue: false,
    trigger: 'daily',
    assignment: 'pooled',
    href: '/routines/run/1',
    completed_at: null,
    completed_by: null,
    completed_by_name: null,
    completed_late: false,
    failed_count: 0,
    has_critical_fail: false,
    ...partial,
  };
}

describe('runUrgency', () => {
  it('climbs quiet to soft to hard to late as the clock passes each moment', () => {
    const run = stub({
      remind_at: '2026-09-01T09:00:00-05:00',
      nag_at: '2026-09-01T17:50:00-05:00',
      late_at: '2026-09-01T23:59:00-05:00',
    });
    expect(runUrgency(run, new Date('2026-09-01T08:00:00-05:00'))).toBe('quiet');
    expect(runUrgency(run, new Date('2026-09-01T09:00:00-05:00'))).toBe('soft');
    expect(runUrgency(run, noon)).toBe('soft');
    expect(runUrgency(run, new Date('2026-09-01T17:50:00-05:00'))).toBe('hard');
    expect(runUrgency(run, new Date('2026-09-02T00:30:00-05:00'))).toBe('late');
  });

  it('never leaves soft while the hard nag waits for clock-out', () => {
    const run = stub({
      remind_at: '2026-09-01T09:00:00-05:00',
      nag_at: null,
      late_at: '2026-09-01T23:59:00-05:00',
    });
    expect(runUrgency(run, noon)).toBe('soft');
    expect(runUrgency(run, new Date('2026-09-01T20:00:00-05:00'))).toBe('soft');
    expect(runUrgency(run, new Date('2026-09-02T09:00:00-05:00'))).toBe('late');
  });

  it('treats a run with no remind time as soft from the first minute', () => {
    expect(runUrgency(stub({ remind_at: '2026-09-01T00:00:00-05:00' }), noon)).toBe('soft');
  });

  it('keeps a finished run quiet whatever the clock says', () => {
    expect(runUrgency(stub({ status: 'done' }), new Date('2026-09-09T00:00:00-05:00'))).toBe('quiet');
  });
});

describe('noise floors', () => {
  const quiet = stub({ id: 1, remind_at: '2026-09-01T17:00:00-05:00' });
  const soft = stub({ id: 2, remind_at: '2026-09-01T09:00:00-05:00' });
  const hard = stub({ id: 3, remind_at: '2026-09-01T09:00:00-05:00', nag_at: '2026-09-01T10:00:00-05:00' });
  const clockOut = stub({ id: 4, remind_at: '2026-09-01T09:00:00-05:00', nag_at: null });
  const rows = [quiet, soft, hard, clockOut];

  it('badges every run at soft or louder', () => {
    expect(runsAtLeast(rows, 'soft', noon).map((r) => r.id)).toEqual([2, 3, 4]);
  });

  it('puts only hard runs in the app bar', () => {
    expect(runsAtLeast(rows, 'hard', noon).map((r) => r.id)).toEqual([3]);
  });

  it('stops clock-out for hard runs and for anything still owed at the door', () => {
    expect(runsBlockingClockOut(rows, noon).map((r) => r.id)).toEqual([3, 4]);
  });

  it('orders the ladder', () => {
    expect(atLeast('late', 'hard')).toBe(true);
    expect(atLeast('soft', 'hard')).toBe(false);
  });
});

describe('runDeadlineLabel', () => {
  it('names the hour, or says the door is the deadline', () => {
    expect(runDeadlineLabel({ nag_at: '2026-09-01T17:50:00-05:00' })).toBe('Due 5:50pm');
    expect(runDeadlineLabel({ nag_at: null })).toBe('Due before you clock out');
  });
});
