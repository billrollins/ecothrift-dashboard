import { describe, expect, it } from 'vitest';
import type { MyRoutines } from '../../api/routines.api';
import { buildMyWork, nudgeNote, workAction } from './myWork';
import { fakeRoutine, fakeRun } from './routineFixture';

// Thursday 2026-09-24, 3:00 pm local.
const NOW = new Date(2026, 8, 24, 15, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).toISOString();

function mine(overrides: Partial<MyRoutines> = {}): MyRoutines {
  return { open: [], done: [], on_demand: [], drafts: [], idle_prompt_minutes: 20, ...overrides };
}

describe('buildMyWork', () => {
  it('grades today into Do now, Due soon, Later today; counts all of it, nags on the first two', () => {
    const work = buildMyWork(mine({
      open: [
        // Soft nag (reminder passed), hard nag at 9 pm.
        fakeRun({ id: 1, title: 'Closing checklist', due_at: at(24, 21), remind_at: at(24, 0), nag_at: at(24, 21), late_at: at(24, 23, 59) }),
        // Hard nag passed, not late yet.
        fakeRun({ id: 2, title: 'Midday checklist', due_at: at(24, 14), remind_at: at(24, 0), nag_at: at(24, 14), late_at: at(24, 23, 59) }),
        // Past its deadline.
        fakeRun({ id: 3, title: 'Section check', due_at: at(24, 13), remind_at: at(24, 0), nag_at: at(24, 13), late_at: at(24, 14) }),
        // Clock-out job, reminder passed: soft.
        fakeRun({ id: 4, title: 'Spot walk', due_at: at(24, 23), remind_at: at(24, 0), nag_at: null, late_at: at(24, 23, 59) }),
        // Reminder not reached yet: later today, quiet.
        fakeRun({ id: 6, title: 'Evening count', due_at: at(24, 19), remind_at: at(24, 17), nag_at: at(24, 19), late_at: at(24, 23, 59) }),
        // Weekly, due Saturday: coming up, not counted.
        fakeRun({ id: 5, title: 'Deep clean', due_at: at(26, 17), remind_at: at(26, 0), nag_at: at(26, 17), late_at: at(26, 23, 59) }),
      ],
    }), 'en', NOW);

    expect(work.count).toBe(5);
    expect(work.owed.map((item) => [item.run.id, item.state])).toEqual([
      [3, 'late'], [2, 'now'], [1, 'soon'], [4, 'soon'], [6, 'later'],
    ]);
    expect(work.owed.map((item) => item.label)).toEqual(['Late', 'Due now', 'Due 9:00 PM', 'By clock-out', 'Due 7:00 PM']);
    expect(work.sections.map((s) => [s.key, s.tone, s.items.map((item) => item.run.id)])).toEqual([
      ['doNow', 'red', [3, 2]],
      ['dueSoon', 'amber', [1, 4]],
      ['laterToday', 'grey', [6]],
    ]);
    expect(work.nagCount).toBe(4);
    expect(work.nagTone).toBe('red');
    expect(work.comingUp.map((item) => item.run.id)).toEqual([5]);
    expect(work.comingUp[0].label).toBe('Due Sat 5:00 PM');
  });

  it('is amber when only soft nags, and quiet when nothing has reached its reminder', () => {
    const soft = buildMyWork(mine({
      open: [fakeRun({ id: 1, due_at: at(24, 18), remind_at: at(24, 0), nag_at: at(24, 18), late_at: at(24, 23, 59) })],
    }), 'en', NOW);
    expect([soft.count, soft.nagCount, soft.nagTone]).toEqual([1, 1, 'amber']);

    const quiet = buildMyWork(mine({
      open: [fakeRun({ id: 1, due_at: at(24, 20), remind_at: at(24, 18), nag_at: at(24, 20), late_at: at(24, 23, 59) })],
    }), 'en', NOW);
    expect([quiet.count, quiet.nagCount, quiet.nagTone]).toEqual([1, 0, 'none']);
    expect(quiet.sections.map((s) => s.key)).toEqual(['laterToday']);
  });

  it('treats a nudged run as a red nag, keeps its real due time, and notes who nudged', () => {
    const nudge = { id: 5, by: 'Carrie', at: at(24, 14, 10), message: 'Please finish', heard: true };
    const work = buildMyWork(mine({
      open: [fakeRun({ id: 6, due_at: at(24, 19), remind_at: at(24, 17), nag_at: at(24, 19), late_at: at(24, 23, 59), nudge })],
    }), 'en', NOW);
    expect(work.owed[0].state).toBe('now');
    expect(work.owed[0].label).toBe('Due 7:00 PM');
    expect(work.sections.map((s) => s.key)).toEqual(['doNow']);
    expect([work.nagCount, work.nagTone]).toEqual([1, 'red']);
    expect(nudgeNote(nudge, 'en')).toBe('Nudged by Carrie 2:10 PM');
    expect(nudgeNote({ ...nudge, by: '' }, 'en')).toBe('Nudged 2:10 PM');
  });

  it('leads with the shift checklist within the same colour, never above something red', () => {
    const open = [
      fakeRun({ id: 7, title: 'Day', due_at: at(24, 17), remind_at: at(24, 0), nag_at: at(24, 17), late_at: at(24, 23, 59) }),
      fakeRun({ id: 9, title: 'Open', due_at: at(24, 18), remind_at: at(24, 0), nag_at: at(24, 18), late_at: at(24, 23, 59) }),
    ];
    expect(buildMyWork(mine({ open, start_with_id: 9 }), 'en', NOW).next?.run.id).toBe(9);
    const dueNow = [...open, fakeRun({ id: 3, due_at: at(24, 14), remind_at: at(24, 0), nag_at: at(24, 14), late_at: at(24, 23, 59) })];
    expect(buildMyWork(mine({ open: dueNow, start_with_id: 9 }), 'en', NOW).next?.run.id).toBe(3);
    const quietStart = [
      open[0],
      fakeRun({ id: 9, due_at: at(24, 20), remind_at: at(24, 18), nag_at: at(24, 20), late_at: at(24, 23, 59) }),
    ];
    expect(buildMyWork(mine({ open: quietStart, start_with_id: 9 }), 'en', NOW).next?.run.id).toBe(7);
  });

  it('never counts drafts, anytime routines, or done work; says Continue for started runs', () => {
    const started = fakeRun({
      id: 8, due_at: at(24, 18), remind_at: at(24, 0), nag_at: at(24, 18), late_at: at(24, 23, 59),
      progress: { answered: 3, total: 9 },
    });
    const work = buildMyWork(mine({
      open: [started],
      done: [
        fakeRun({ id: 20, status: 'done', completed_at: at(24, 12) }),
        fakeRun({ id: 21, status: 'done', completed_at: at(22, 12) }),
      ],
      drafts: [{ id: 1, routine: 2, routine_title: 'Register activity', kind: 'work_cycle', mode: 'shelf', section_name: '', started_at: at(24, 13), href: '/x', run: null }],
      on_demand: [fakeRoutine({ id: 2, title: 'Register activity' })],
    }), 'en', NOW);
    expect(work.count).toBe(1);
    expect(work.nagCount).toBe(1);
    expect(work.owed[0].progress).toBe('3/9');
    expect(workAction(work.owed[0], 'en')).toBe('Continue');
    expect(work.doneToday.map((run) => run.id)).toEqual([20]);
    expect(work.drafts).toHaveLength(1);
    expect(work.anytime).toHaveLength(1);
  });

  it('is empty and calm with nothing owed', () => {
    const work = buildMyWork(mine(), 'en', NOW);
    expect(work.count).toBe(0);
    expect(work.nagCount).toBe(0);
    expect(work.nagTone).toBe('none');
    expect(work.sections).toEqual([]);
    expect(work.next).toBeNull();
  });

  it('speaks Spanish', () => {
    const work = buildMyWork(mine({
      open: [fakeRun({ id: 1, due_at: at(24, 23), remind_at: at(24, 0), nag_at: null, late_at: at(24, 23, 59) })],
    }), 'es', NOW);
    expect(work.owed[0].label).toBe('Al salir');
  });
});
