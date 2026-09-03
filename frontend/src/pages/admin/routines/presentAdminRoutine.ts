import { format, isToday, isTomorrow, isYesterday } from 'date-fns';
import type { AdminRoutine } from '../../../api/routines.api';
import type { StatusTagTone } from '../../../components/duty/tokens';
import type { TaskRowTone } from '../../../components/duty/TaskRow';
import { TRIGGER_LABELS } from '../../routines/RoutineSettingsFields';
import { hasFlag } from './adminRoutineFilters';

export function friendlyTime(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${String(m || 0).padStart(2, '0')}${suffix}`;
}

/** "Today 5:00pm", "Yesterday", "Aug 30", "Aug 30, 2025" depending on distance. */
export function friendlyStamp(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const clock = format(date, 'h:mmaaa');
  if (isToday(date)) return `Today ${clock}`;
  if (isTomorrow(date)) return `Tomorrow ${clock}`;
  if (isYesterday(date)) return `Yesterday ${clock}`;
  return date.getFullYear() === now.getFullYear() ? format(date, 'MMM d') : format(date, 'MMM d, yyyy');
}

/** Who the run is for: type, then All or the selection. */
export function ownerLabel(routine: AdminRoutine): string {
  const share = routine.assignment === 'pooled' ? 'one shared' : 'each';
  if (routine.audience_all) {
    if (routine.audience_type === 'shift') return `All shifts · ${share}`;
    if (routine.audience_type === 'department') return `All departments · ${share}`;
    return `All staff · ${share}`;
  }
  if (routine.audience_type === 'shift') {
    const n = (routine.assigned_shifts || []).length;
    return n ? `${n} shift${n === 1 ? '' : 's'} · ${share}` : `No shift · ${share}`;
  }
  if (routine.audience_type === 'department') {
    const ids = routine.assigned_department_ids || [];
    if (ids.length === 1 && routine.assigned_department_name) {
      return `${routine.assigned_department_name} · ${share}`;
    }
    return ids.length
      ? `${ids.length} departments · ${share}`
      : (routine.assigned_department_name
        ? `${routine.assigned_department_name} · ${share}`
        : `No department · ${share}`);
  }
  const people = routine.assigned_user_ids.length;
  if (people) return `${people === 1 ? '1 person' : `${people} people`} · ${share}`;
  return `Nobody · ${share}`;
}

export function cadenceLabel(routine: AdminRoutine): string {
  const trigger = TRIGGER_LABELS[routine.trigger] ?? routine.trigger;
  if (routine.trigger === 'on_demand') return trigger;
  if (!routine.due_time) return `${trigger}, due at clock-out`;
  return `${trigger} at ${friendlyTime(routine.due_time)}`;
}

export interface AdminRowPresentation {
  tone: TaskRowTone;
  meta: string;
  tags: Array<{ label: string; tone: StatusTagTone }>;
}

/**
 * One line of facts under the name and the badges beside it. Tone follows the
 * loudest fact: retired is grey, overdue is red, unowned is amber, blocking is
 * violet, and a healthy routine wears the brand.
 */
export function presentAdminRoutine(routine: AdminRoutine, now: Date = new Date()): AdminRowPresentation {
  const { stats } = routine;
  const tags: AdminRowPresentation['tags'] = [];
  let tone: TaskRowTone = 'brand';

  if (!routine.is_active) {
    tone = 'none';
    tags.push({ label: 'Retired', tone: 'plain' });
  } else if (stats.overdue > 0) {
    tone = 'red';
    tags.push({ label: `${stats.overdue} overdue`, tone: 'red' });
  } else if (stats.assignee_count === 0) {
    tone = 'amber';
  } else if (routine.is_blocking) {
    tone = 'violet';
  }

  if (routine.is_active && stats.assignee_count === 0) tags.push({ label: 'No one assigned', tone: 'amber' });
  if (routine.is_active && hasFlag(routine, 'neverRun')) tags.push({ label: 'Never run', tone: 'plain' });
  if (routine.is_blocking) tags.push({ label: 'Blocking', tone: 'violet' });
  // Seeded program routines: the grade reads them by key, so they are not
  // yours to delete, and the three section kinds are not yours to rewrite.
  if (routine.system_key) tags.push({ label: 'System', tone: 'blue' });

  const parts = [cadenceLabel(routine), ownerLabel(routine)];
  parts.push(stats.done === 0 ? 'not yet performed' : `${stats.done} done`);
  if (stats.last_completed_at) parts.push(`last ${friendlyStamp(stats.last_completed_at, now)}`);

  return { tone, meta: parts.join(' · '), tags };
}
