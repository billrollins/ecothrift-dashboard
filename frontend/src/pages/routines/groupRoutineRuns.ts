import { isToday, parseISO } from 'date-fns';
import type { RoutineRun } from '../../api/routines.api';

export interface GroupedRoutineRuns {
  blocking: RoutineRun[];
  overdue: RoutineRun[];
  today: RoutineRun[];
  week: RoutineRun[];
  done: RoutineRun[];
}

export function groupRoutineRuns(open: RoutineRun[], done: RoutineRun[]): GroupedRoutineRuns {
  const blocking = open.filter((row) => row.is_blocking);
  const rest = open.filter((row) => !row.is_blocking);
  const overdue = rest.filter((row) => row.is_overdue);
  const remaining = rest.filter((row) => !row.is_overdue);
  const today = remaining.filter((row) => isToday(parseISO(row.due_at)));
  const week = remaining.filter((row) => !isToday(parseISO(row.due_at)));
  return { blocking, overdue, today, week, done };
}
