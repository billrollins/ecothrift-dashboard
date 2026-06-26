import type { RestorationJobDTO } from '../../../types/inventory.types';

/** Minutes on bench with zero tracked time before idle warning. */
export const BENCH_IDLE_WARN_MINUTES = 10;

/** Done disposition: warn if active time below this (minutes). */
export const DONE_TIME_LOW_MINUTES = 2;

/** Done disposition: warn if active time above this (hours). */
export const DONE_TIME_HIGH_HOURS = 4;

export type TimerGuardAction = 'checkIn' | 'startTimer' | 'hold' | 'done' | 'moveBack';

export function timerGuardKey(action: TimerGuardAction, rowKey: string): string {
  return `${action}:${rowKey}`;
}

export function isBenchIdleWithoutTimer(job: RestorationJobDTO): boolean {
  if (job.stage !== 'bench' || job.timer_is_running) return false;
  if ((job.elapsed_seconds ?? 0) > 0) return false;
  if (!job.bench_started_at) return false;
  const started = new Date(job.bench_started_at).getTime();
  if (!Number.isFinite(started)) return false;
  const idleMs = Date.now() - started;
  return idleMs >= BENCH_IDLE_WARN_MINUTES * 60 * 1000;
}

export function spentHoursToMinutes(hoursRaw: string | number): number {
  const n = typeof hoursRaw === 'string' ? Number.parseFloat(hoursRaw) : hoursRaw;
  if (!Number.isFinite(n)) return 0;
  return n * 60;
}

export type DoneTimeWarningKind = 'low' | 'high' | null;

export function doneTimeWarning(spentHoursRaw: string | number): DoneTimeWarningKind {
  const minutes = spentHoursToMinutes(spentHoursRaw);
  if (minutes > 0 && minutes < DONE_TIME_LOW_MINUTES) return 'low';
  if (minutes / 60 > DONE_TIME_HIGH_HOURS) return 'high';
  return null;
}

export function doneTimeWarningMessage(kind: DoneTimeWarningKind): string {
  if (kind === 'low') {
    return `Active time is under ${DONE_TIME_LOW_MINUTES} minutes. Confirm this item was restored with very little bench time, or override with a note.`;
  }
  if (kind === 'high') {
    return `Active time exceeds ${DONE_TIME_HIGH_HOURS} hours. Confirm this is correct, or override with a note.`;
  }
  return '';
}
