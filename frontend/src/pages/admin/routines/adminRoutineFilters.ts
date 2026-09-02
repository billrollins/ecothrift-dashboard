import type { AdminRoutine, RoutineTrigger } from '../../../api/routines.api';
import { matchesQuery } from '../../routines/matchesQuery';

export type AdminStatusFilter = 'active' | 'retired' | 'all';
export type AdminHealthFlag = 'overdue' | 'neverRun' | 'unassigned' | 'blocking';
export type AdminSort = 'attention' | 'title' | 'lastDone' | 'nextDue';

export interface AdminRoutineFilters {
  query: string;
  status: AdminStatusFilter;
  flags: AdminHealthFlag[];
  /** 'all', 'none' (no department set), or a department id. */
  department: 'all' | 'none' | number;
  trigger: 'all' | RoutineTrigger;
  sort: AdminSort;
}

export const DEFAULT_ADMIN_FILTERS: AdminRoutineFilters = {
  query: '',
  status: 'active',
  flags: [],
  department: 'all',
  trigger: 'all',
  sort: 'attention',
};

export const HEALTH_FLAG_LABELS: Record<AdminHealthFlag, string> = {
  overdue: 'Overdue',
  neverRun: 'Never run',
  unassigned: 'No one assigned',
  blocking: 'Blocking',
};

export function hasFlag(routine: AdminRoutine, flag: AdminHealthFlag): boolean {
  switch (flag) {
    case 'overdue': return routine.stats.overdue > 0;
    case 'neverRun': return routine.stats.done === 0 && routine.trigger !== 'on_demand';
    case 'unassigned': return routine.stats.assignee_count === 0;
    case 'blocking': return routine.is_blocking;
    default: return false;
  }
}

function matchesStatus(routine: AdminRoutine, status: AdminStatusFilter): boolean {
  if (status === 'all') return true;
  return status === 'active' ? routine.is_active : !routine.is_active;
}

function matchesDepartment(routine: AdminRoutine, department: AdminRoutineFilters['department']): boolean {
  if (department === 'all') return true;
  if (department === 'none') return routine.assigned_department == null;
  return routine.assigned_department === department;
}

/** Rows that pass everything except the health chips; the chips count from here. */
export function baseRows(rows: AdminRoutine[], filters: AdminRoutineFilters): AdminRoutine[] {
  return rows.filter((routine) => (
    matchesStatus(routine, filters.status)
    && matchesDepartment(routine, filters.department)
    && (filters.trigger === 'all' || routine.trigger === filters.trigger)
    && matchesQuery(
      filters.query,
      routine.title,
      routine.intro,
      routine.assigned_department_name,
      routine.assigned_role,
      routine.stats.last_completed_by_name,
    )
  ));
}

export function flagCounts(rows: AdminRoutine[]): Record<AdminHealthFlag, number> {
  const counts: Record<AdminHealthFlag, number> = { overdue: 0, neverRun: 0, unassigned: 0, blocking: 0 };
  for (const routine of rows) {
    for (const flag of Object.keys(counts) as AdminHealthFlag[]) {
      if (hasFlag(routine, flag)) counts[flag] += 1;
    }
  }
  return counts;
}

/** How loudly a row asks for attention. Higher sorts first under `attention`. */
export function attentionScore(routine: AdminRoutine): number {
  let score = 0;
  if (routine.stats.overdue > 0) score += 1000 + routine.stats.overdue;
  if (routine.stats.assignee_count === 0 && routine.is_active) score += 500;
  if (hasFlag(routine, 'neverRun') && routine.is_active) score += 100;
  if (routine.is_blocking) score += 10;
  if (!routine.is_active) score -= 10_000;
  return score;
}

function timeOrZero(value: string | null): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function sortRows(rows: AdminRoutine[], sort: AdminSort): AdminRoutine[] {
  const byTitle = (a: AdminRoutine, b: AdminRoutine) => a.title.localeCompare(b.title);
  const sorted = rows.slice();
  switch (sort) {
    case 'title':
      return sorted.sort(byTitle);
    case 'lastDone':
      return sorted.sort((a, b) => (
        timeOrZero(b.stats.last_completed_at) - timeOrZero(a.stats.last_completed_at) || byTitle(a, b)
      ));
    case 'nextDue':
      return sorted.sort((a, b) => {
        const at = timeOrZero(a.stats.next_due_at);
        const bt = timeOrZero(b.stats.next_due_at);
        if (at === 0 && bt === 0) return byTitle(a, b);
        if (at === 0) return 1;
        if (bt === 0) return -1;
        return at - bt || byTitle(a, b);
      });
    case 'attention':
    default:
      return sorted.sort((a, b) => attentionScore(b) - attentionScore(a) || byTitle(a, b));
  }
}

/** The list as drawn: every filter applied, in the chosen order. */
export function visibleRows(rows: AdminRoutine[], filters: AdminRoutineFilters): AdminRoutine[] {
  const base = baseRows(rows, filters);
  const flagged = filters.flags.length
    ? base.filter((routine) => filters.flags.every((flag) => hasFlag(routine, flag)))
    : base;
  return sortRows(flagged, filters.sort);
}

export function toggleFlag(flags: AdminHealthFlag[], flag: AdminHealthFlag): AdminHealthFlag[] {
  return flags.includes(flag) ? flags.filter((f) => f !== flag) : [...flags, flag];
}
