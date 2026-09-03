import type { WeeklyHoursStatus } from '../../types/hr.types';
import { t } from '../../i18n/routines';
import { dutyColors } from '../duty/tokens';
import { formatHours } from '../../pages/hr/timeClockFormat';

export function greetingKey(now: Date): 'goodMorning' | 'goodAfternoon' | 'goodEvening' {
  const hour = now.getHours();
  if (hour < 12) return 'goodMorning';
  if (hour < 17) return 'goodAfternoon';
  return 'goodEvening';
}

export function weekStatusLine(
  weekly: WeeklyHoursStatus | undefined,
  onBreak: boolean,
  elapsed: number,
  lang: string,
): { text: string; color: string } {
  if (onBreak) return { text: t('endBreakFirst', lang), color: dutyColors.ink60 };
  if (elapsed > 16 * 3600) return { text: t('longShift', lang), color: dutyColors.amberInk };
  if (!weekly) return { text: ' ', color: dutyColors.ink40 };
  const worked = parseFloat(weekly.hours_worked);
  const limit = parseFloat(weekly.hours_limit);
  const left = formatHours(weekly.hours_remaining);
  if (weekly.is_over_limit || worked > limit) {
    return { text: t('overtimeNotAllowed', lang), color: dutyColors.red };
  }
  if (weekly.is_at_limit || worked >= limit) {
    return { text: t('limitReached', lang), color: dutyColors.red };
  }
  if (worked >= limit - 2) {
    return { text: `${t('approachingLimit', lang)} · ${left} h`, color: dutyColors.amberInk };
  }
  return { text: `${left} ${t('hoursLeftThisWeek', lang)}`, color: dutyColors.ink40 };
}
