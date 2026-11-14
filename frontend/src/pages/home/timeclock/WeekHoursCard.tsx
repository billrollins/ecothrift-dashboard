import { Box, Skeleton, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { eyebrowSx } from '../../../components/hr/ShiftPicker';
import { overHoursFlagLine } from '../../../components/hr/weekStatus';
import { dutyColors } from '../../../components/duty/tokens';
import { NAG_AMBER } from '../../../components/routines/MyWorkList';
import type { HoursNag } from '../../../hooks/useHoursNag';
import type { MyPeriod, TimeEntry, WeeklyHoursStatus } from '../../../types/hr.types';
import { useTimeClockCopy } from './copy';

export type WeekTone = 'quiet' | 'wait' | 'problem';

const TONE_COLOR: Record<WeekTone, string> = { quiet: dutyColors.ink60, wait: dutyColors.amberInk, problem: dutyColors.red };
const BAR_COLOR: Record<WeekTone, string> = { quiet: dutyColors.brand, wait: NAG_AMBER, problem: dutyColors.red };

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

/** The next scheduled shift still ahead in this pay period ("Fri Nov 14 · 9am-5pm Retail"), or null. */
export function nextShiftText(period: MyPeriod | undefined, todayWord: string, lang: string): string | null {
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  for (const day of period?.days ?? []) {
    const shift = day.scheduled.find((s) => parseFloat(s.hours_ahead) > 0);
    if (!shift || day.day_off?.status === 'approved') continue;
    const when = day.is_today ? todayWord : format(parseISO(day.date), 'EEE MMM d', locale);
    return `${when} · ${shift.text}${shift.department_name ? ` ${shift.department_name}` : ''}`;
  }
  return null;
}

/**
 * This week: hours against what they are cleared for, a bar, one warning line that always keeps its room, and the
 * next shift on the schedule (also one fixed line).
 */
export function WeekHoursCard({ week, loading, nag, entry, period }: {
  week: WeeklyHoursStatus | undefined;
  loading: boolean;
  nag: HoursNag;
  entry: TimeEntry | null | undefined;
  period: MyPeriod | undefined;
}) {
  const { tc, lang } = useTimeClockCopy();
  const { worked, limit, tone, text } = weekWarning(week, nag, entry, period, tc, lang);
  const pct = limit > 0 ? Math.min(worked / limit, 1) * 100 : 0;
  const next = nextShiftText(period, tc('todayAt'), lang);
  return (
    <Box
      data-testid="week-hours-card"
      sx={{
        height: '100%',
        boxSizing: 'border-box',
        bgcolor: dutyColors.card,
        border: `1px solid ${tone === 'quiet' ? dutyColors.ink15 : BAR_COLOR[tone]}`,
        borderRadius: '12px',
        px: 2,
        py: 1.75,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 1.5,
      }}
    >
      <Box>
        <Typography sx={eyebrowSx}>{tc('thisWeek')}</Typography>
        {loading && !week ? (
          <Skeleton variant="text" width={160} height={40} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mt: 0.25 }}>
            <Typography sx={{ fontSize: 30, fontWeight: 900, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', color: dutyColors.ink }}>
              {worked.toFixed(2)}
            </Typography>
            <Typography sx={{ fontSize: 14, color: dutyColors.ink60, fontVariantNumeric: 'tabular-nums' }}>
              {tc('ofLimit', { limit: short(limit) })}
            </Typography>
          </Box>
        )}
        <Box
          role="progressbar"
          aria-label={tc('thisWeek')}
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          sx={{ mt: 1, height: 8, borderRadius: 99, bgcolor: dutyColors.ink08, overflow: 'hidden' }}
        >
          <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: BAR_COLOR[tone], borderRadius: 99, transition: 'width 300ms ease' }} />
        </Box>
        {/* The warning's room is kept whatever it says, so the cards never move (no layout shift). */}
        <Typography
          role={tone === 'problem' ? 'alert' : undefined}
          data-testid="week-warning"
          sx={{ mt: 1, minHeight: { xs: 54, sm: 38 }, fontSize: 13.5, lineHeight: 1.4, fontWeight: tone === 'quiet' ? 500 : 800, color: TONE_COLOR[tone] }}
        >
          {text}
        </Typography>
      </Box>
      <Box sx={{ pt: 1.25, borderTop: `1px solid ${dutyColors.ink08}` }}>
        <Typography sx={eyebrowSx}>{tc('nextShift')}</Typography>
        <Typography data-testid="next-shift" sx={{ mt: 0.25, minHeight: 21, fontSize: 14.5, lineHeight: 1.45, fontWeight: 700, color: next ? dutyColors.ink : dutyColors.ink60 }}>
          {period ? next ?? tc('nextNone') : ' '}
        </Typography>
      </Box>
    </Box>
  );
}
