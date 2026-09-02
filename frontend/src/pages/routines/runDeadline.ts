import { format, parseISO } from 'date-fns';
import type { RoutineRun } from '../../api/routines.api';

export function clockLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const at = parseISO(iso);
  return Number.isNaN(at.getTime()) ? '' : format(at, 'h:mmaaa');
}

/**
 * What the row says about its deadline. A clock-out run has no time to show,
 * so it says so rather than printing a meaningless 11:59pm.
 */
export function runDeadlineLabel(
  run: Pick<RoutineRun, 'nag_at'>,
): string {
  return run.nag_at ? `Due ${clockLabel(run.nag_at)}` : 'Due before you clock out';
}
