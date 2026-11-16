/** The week's hours and the overtime warning, for the TimeClock tab's Now card (#137, #179). */
import { format } from 'date-fns';
import { overHoursFlagLine } from '../../../components/hr/weekStatus';
import type { HoursNag } from '../../../hooks/useHoursNag';
import type { MyPeriod, TimeEntry, WeeklyHoursStatus } from '../../../types/hr.types';
import { useTimeClockCopy } from './copy';

export type WeekTone = 'quiet' | 'wait' | 'problem';

/** "1.5 h" or "40 min". */
function leftLabel(hours: number): string {
  const minutes = Math.max(Math.round(hours * 60), 1);
  return minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`;
}

const short = (n: number) => String(Number(n.toFixed(2)));

/**
 * The week's hours and the overtime warning, worst first: past the hours they are cleared for (the red flag), at the
 * limit now, an hour or less left on the clock now (with the time to clock out by), the schedule taking the week past
 * the limit, then plain hours left. `worked` counts the open shift up to now (the live nag), else the server's.
 */
export function weekWarning(
  week: WeeklyHoursStatus | undefined,
  nag: HoursNag,
  entry: TimeEntry | null | undefined,
  period: MyPeriod | undefined,
  tc: ReturnType<typeof useTimeClockCopy>['tc'],
  lang: string,
): { worked: number; limit: number; tone: WeekTone; text: string } {
  const limit = week ? parseFloat(week.hours_limit) || 40 : 40;
  const live = Boolean(entry && !entry.clock_out && !entry.stale);
  const worked = live ? nag.worked : week ? parseFloat(week.hours_worked) || 0 : 0;
  const current = period?.weeks.find((w) => w.is_current);
  const ahead = current ? parseFloat(current.ahead) || 0 : 0;
  const over = overHoursFlagLine(week, lang);
  if (over) return { worked, limit, tone: 'problem', text: over };
  if ((live && nag.level === 'hard') || worked >= limit) {
    return { worked, limit, tone: 'problem', text: tc('atLimit', { limit: short(limit) }) };
  }
  if (live && nag.level === 'soft' && nag.clockOutBy) {
    return {
      worked, limit, tone: 'wait',
      text: tc('soonLeft', { left: leftLabel(nag.left), time: format(nag.clockOutBy, 'h:mm a'), limit: short(limit) }),
    };
  }
  const total = worked + ahead;
  if (total > limit + 0.01) {
    return {
      worked, limit, tone: 'wait',
      text: tc('scheduleOver', { total: short(total), over: short(total - limit), limit: short(limit) }),
    };
  }
  const left = tc('hLeft', { left: short(Math.max(limit - worked, 0)) });
  return { worked, limit, tone: 'quiet', text: ahead > 0 ? `${left} ${tc('scheduledAhead', { ahead: short(ahead) })}` : left };
}
