import { parseISO } from 'date-fns';
import type { RoutineRun } from '../../api/routines.api';

/**
 * How loudly a run is allowed to interrupt someone, in order.
 *
 * - `quiet`: on the list, nothing else. The morning has not reached it yet.
 * - `soft`: badge on the Routines link and a tag on the row. No app-bar alert.
 * - `hard`: the app-bar alert. Someone should stop and do this.
 * - `late`: past its deadline, and it now counts against the day's grade.
 *
 * A run with no `nag_at` never reaches `hard` on its own; it is a clock-out
 * job, and the time clock is what confronts the person about it.
 */
export type RunUrgency = 'quiet' | 'soft' | 'hard' | 'late';

const ORDER: RunUrgency[] = ['quiet', 'soft', 'hard', 'late'];

type Moments = Pick<RoutineRun, 'status' | 'remind_at' | 'nag_at' | 'late_at'>;

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const at = parseISO(iso).getTime();
  return Number.isNaN(at) ? null : at;
}

export function runUrgency(run: Moments, now: Date = new Date()): RunUrgency {
  if (run.status !== 'open') return 'quiet';
  const at = now.getTime();
  const late = ms(run.late_at);
  if (late != null && at > late) return 'late';
  const nag = ms(run.nag_at);
  if (nag != null && at >= nag) return 'hard';
  const remind = ms(run.remind_at);
  if (remind == null || at >= remind) return 'soft';
  return 'quiet';
}

export function atLeast(urgency: RunUrgency, floor: RunUrgency): boolean {
  return ORDER.indexOf(urgency) >= ORDER.indexOf(floor);
}

/** Runs at or above a noise floor, for a badge or a nag list. */
export function runsAtLeast(
  runs: RoutineRun[] | undefined,
  floor: RunUrgency,
  now: Date = new Date(),
): RoutineRun[] {
  return (runs ?? []).filter((run) => atLeast(runUrgency(run, now), floor));
}

/**
 * Runs that should stop someone from walking out: the hard nag has started, or
 * it is a clock-out job that is still open. Drives the time-clock guard.
 */
export function runsBlockingClockOut(
  runs: RoutineRun[] | undefined,
  now: Date = new Date(),
): RoutineRun[] {
  return (runs ?? []).filter((run) => {
    if (run.status !== 'open') return false;
    if (!run.nag_at) return true;
    return atLeast(runUrgency(run, now), 'hard');
  });
}
