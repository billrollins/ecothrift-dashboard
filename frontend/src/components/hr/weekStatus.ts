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

/** 43.20 -> "43.2", 40.00 -> "40". */
function hoursText(value: string | number): string {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? String(Number(n.toFixed(2))) : '0';
}

/**
 * The big red flag when the week is past 40 plus the overtime allowance (``hours_limit`` already includes it):
 * "Over your hours: 43.2 of 40. Forgot to clock out?" Null when they are within their hours.
 */
export function overHoursFlagLine(weekly: WeeklyHoursStatus | undefined, lang: string): string | null {
  if (!weekly) return null;
  const worked = parseFloat(weekly.hours_worked);
  const limit = parseFloat(weekly.hours_limit);
  if (!(weekly.is_over_limit || worked > limit)) return null;
  return t('overHoursFlag', lang)
    .replace('{hours}', hoursText(weekly.hours_worked))
    .replace('{limit}', hoursText(weekly.hours_limit));
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
