import type { RoutineRun } from '../../../api/routines.api';
import { useAuth } from '../../../hooks/useAuth';
import { useMyWork } from '../../../hooks/useMyWork';
import { useWeeklyHoursStatus } from '../../../hooks/useTimeClock';
import { t } from '../../../i18n/routines';
import { useNowTick } from '../../../pages/hr/timeClockFormat';
import { useTimeClockActions } from '../../../pages/hr/useTimeClockActions';
import { useTodayRunner } from '../../../pages/routines/todayRunner';
import { greetingKey } from '../../hr/weekStatus';

export function glanceHref(run: RoutineRun): string {
  return run.href || `/routines/run/${run.id}`;
}

export function useTodayModel() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  // The same list, count and words as the Today badge, the nag icon and clock-out.
  const { work, isLoading } = useMyWork();
  const weekly = useWeeklyHoursStatus();
  const clock = useTimeClockActions();
  const runner = useTodayRunner();
  const now = useNowTick(true);
  const clockedIn = Boolean(clock.entry);
  const firstName = user?.first_name?.trim() || '';
  const greeting = firstName
    ? `${t(greetingKey(new Date(now)), lang)}, ${firstName}`
    : t(greetingKey(new Date(now)), lang);

  return {
    lang,
    weekly,
    clock,
    runner,
    now,
    work,
    clockedIn,
    loadingLists: isLoading,
    greeting,
  };
}
