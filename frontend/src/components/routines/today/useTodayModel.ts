import type { RoutineRun } from '../../../api/routines.api';
import { useAuth } from '../../../hooks/useAuth';
import { useTodayGlance } from '../../../hooks/useRoutines';
import { useWeeklyHoursStatus } from '../../../hooks/useTimeClock';
import { t } from '../../../i18n/routines';
import { useNowTick } from '../../../pages/hr/timeClockFormat';
import { useTimeClockActions } from '../../../pages/hr/useTimeClockActions';
import { greetingKey, weekStatusLine } from '../../hr/weekStatus';
import { runUrgency } from '../../../pages/routines/runIsDue';

export function glanceHref(run: RoutineRun): string {
  return run.href || `/routines/run/${run.id}`;
}

export function useTodayModel() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const glance = useTodayGlance();
  const weekly = useWeeklyHoursStatus();
  const clock = useTimeClockActions();
  const now = useNowTick(true);
  const data = glance.data;
  const clockedIn = Boolean(clock.entry);
  const start = data?.start_with ?? null;
  const due = data?.open ?? [];
  const drafts = data?.drafts ?? [];
  const workCycle = data?.on_demand.find((row) => row.system_key === 'retail.work_cycle')
    ?? data?.on_demand[0]
    ?? null;
  const loadingLists = glance.isLoading && !data;
  const firstName = user?.first_name?.trim() || '';
  const greeting = firstName
    ? `${t(greetingKey(new Date(now)), lang)}, ${firstName}`
    : t(greetingKey(new Date(now)), lang);
  const lateCount = due.filter((run) => runUrgency(run) === 'late').length;
  const weekLine = weekStatusLine(weekly.data, false, 0, lang);
  const weekWarn = Boolean(
    weekly.data
    && (weekly.data.is_at_limit
      || weekly.data.is_over_limit
      || parseFloat(weekly.data.hours_worked) >= parseFloat(weekly.data.hours_limit) - 2),
  );

  return {
    lang,
    weekly,
    clock,
    now,
    data,
    clockedIn,
    start,
    due,
    drafts,
    workCycle,
    loadingLists,
    greeting,
    lateCount,
    weekLine,
    weekWarn,
  };
}
