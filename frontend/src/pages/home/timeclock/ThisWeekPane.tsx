/**
 * TimeClock > This week (Dash Update #179; Bill 2026-11-16: "I expected schedule to be a FAST link right there").
 * One pane beside the clock card: hours worked against what they are cleared for (the bar and the overtime warning,
 * #137), what is on the schedule and the next shift, then the week as seven day rows (my shift each day, a day off,
 * the store hours, how many are working). Full schedule (and any day row) opens the whole week on the same tab
 * (Everyone); managers also get Build schedule (/people/schedule, the only place the week changes).
 *
 * Kit: the rich kit's MicroLabel, dense rows, tabular numbers, theme tones. Nothing moves when data comes in or
 * changes: the warning line, the next shift line and the seven rows keep their room (no layout shift).
 */
import { Box, Button, ButtonBase, Skeleton, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { getScheduleWeek, type ScheduleWeek } from '../../../api/schedule.api';
import { canAccess } from '../../../auth/access';
import type { Tone } from '../../../components/page/PageKit';
import { MicroLabel, useToneText } from '../../../components/page/RichKit';
import { useAuth } from '../../../hooks/useAuth';
import type { HoursNag } from '../../../hooks/useHoursNag';
import { ECO_ICONS } from '../../../icons/ecoIcons';
import type { MyPeriod, TimeEntry, WeeklyHoursStatus } from '../../../types/hr.types';
import { useTimeClockCopy } from './copy';
import { nextShiftText, weekWarning, type WeekTone } from './weekHours';

type Tc = ReturnType<typeof useTimeClockCopy>['tc'];

/** Who may open the Schedule builder: the same need as its route (App.tsx ScheduleRoute). */
export const SCHEDULE_BUILD_NEED = ['hr.schedule:write', 'people:manage'];

export interface StripDay {
  date: string;
  dow: string;
  dom: string;
  isToday: boolean;
  isPast: boolean;
  /** Working that day (a shift on the schedule, not an approved day off). */
  working: boolean;
  /** "9am-5pm", "Off", "Day off", "Closed". */
  main: string;
  /** Department, hours worked, or "Day off asked"; '' keeps the line's room. */
  caption: string;
  captionTone: Tone;
  /** "Store 10am-7pm", "Store closed". */
  store: string;
  /** "5 working". */
  crew: string;
}

const hoursOf = (value: string | null | undefined) => {
  const n = parseFloat(value ?? '');
  return Number.isFinite(n) ? n : 0;
};
const short = (n: number) => String(Number(n.toFixed(2)));

/** '10:00' -> '10am', '19:30' -> '7:30pm'. */
export function clockShort(hm: string): string {
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h)) return hm;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${suffix}`;
}

/**
 * The week as day cells for the reader (`meId`): their shifts, an approved or asked day off (their own requests come
 * with the week), the store closed, hours worked so far (from the pay period, when the day is in it), and how many
 * people are on the schedule that day.
 */
export function weekStrip(week: ScheduleWeek, meId: number | undefined, period: MyPeriod | undefined, today: string, tc: Tc, lang: string): StripDay[] {
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  return week.days.map((date) => {
    const dayShifts = week.shifts.filter((s) => s.date === date);
    const mine = dayShifts.filter((s) => s.employee === meId);
    const crew = new Set(dayShifts.map((s) => s.employee)).size;
    const off = (week.requests ?? []).find(
      (r) => r.employee === meId && r.kind === 'off' && r.date <= date && date <= r.end_date && (r.status === 'approved' || r.status === 'pending'),
    );
    const store = week.store_hours.find((h) => h.date === date);
    const pDay = period?.days.find((d) => d.date === date);
    const workedHours = (pDay?.worked ?? []).reduce((sum, e) => sum + hoursOf(e.clock_out ? e.total_hours : e.hours_so_far), 0);
    const dayOff = off?.status === 'approved';
    let main = tc('dayOffShort');
    if (dayOff) main = tc('dayOff');
    else if (mine.length) main = mine.map((s) => s.text).join(', ');
    else if (store && !store.open) main = tc('storeClosed');
    let caption = '';
    let captionTone: Tone = 'quiet';
    if (workedHours > 0) {
      caption = tc('workedH', { h: short(workedHours) });
      captionTone = 'good';
    } else if (off?.status === 'pending') {
      caption = tc('dayOffAsked');
      captionTone = 'wait';
    } else if (mine.length && !dayOff) {
      caption = Array.from(new Set(mine.map((s) => s.department_name).filter(Boolean))).join(', ');
      // Not Retail: the times are the plan; leave early or stay late as the day needs (#6).
      if (mine.some((s) => s.flexible)) caption = caption ? `${caption} · ${tc('flexShort')}` : tc('flexShort');
    }
    let storeLine = '';
    if (store) storeLine = store.open ? tc('storeHours', { from: clockShort(store.start), to: clockShort(store.end) }) : tc('storeClosedLine');
    return {
      date,
      dow: format(parseISO(date), 'EEE', locale),
      dom: format(parseISO(date), 'd', locale),
      isToday: date === today,
      isPast: date < today,
      working: mine.length > 0 && !dayOff,
      main,
      caption,
      captionTone,
      store: storeLine,
      crew: crew === 0 ? tc('crewNone') : crew === 1 ? tc('crewOne') : tc('crew', { n: crew }),
    };
  });
}

/** Hours on the schedule this week for the reader, and how many shifts. */
export function myWeekTotals(week: ScheduleWeek | undefined, meId: number | undefined): { hours: number; shifts: number } {
  const mine = (week?.shifts ?? []).filter((s) => s.employee === meId);
  return { hours: mine.reduce((sum, s) => sum + (Number(s.hours) || 0), 0), shifts: mine.length };
}

/** Day | my shift | worked or asked | store hours | how many work: the rich kit's dense row look. */
const ROW_COLUMNS = {
  xs: '58px minmax(0, 1fr) auto',
  sm: '88px minmax(0, 1.2fr) minmax(0, 1fr) 112px 84px',
} as const;

function DayRow({ day, onOpen, tc }: { day: StripDay; onOpen: () => void; tc: Tc }) {
  const theme = useTheme();
  const captionColor = useToneText(day.captionTone);
  const dayColor = day.isToday ? 'primary.dark' : 'text.secondary';
  const small = { fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.35 } as const;
  return (
    <ButtonBase
      onClick={onOpen}
      data-testid={`strip-day-${day.date}`}
      data-today={day.isToday ? 'true' : undefined}
      aria-label={tc('openDay', { day: `${day.dow} ${day.dom}` })}
      sx={{
        display: 'grid',
        gridTemplateColumns: ROW_COLUMNS,
        columnGap: 1.5,
        alignItems: 'center',
        textAlign: 'left',
        width: '100%',
        minHeight: { xs: 46, sm: 36 },
        px: 1.25,
        py: { xs: 0.5, sm: 0.25 },
        borderBottom: 1,
        borderColor: 'grey.100',
        '&:nth-of-type(even)': { bgcolor: 'grey.50' },
        // Today: the rich kit's selected row (mint, a bar on the left); its size is the same as every row.
        ...(day.isToday ? {
          bgcolor: `${alpha(theme.palette.secondary.main, 0.12)} !important`,
          boxShadow: `inset 3px 0 0 ${theme.palette.secondary.main}`,
        } : {}),
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ minWidth: 0 }}>
        {/* Today says so in place of its weekday: the same room, nothing moves. */}
        <MicroLabel sx={{ color: dayColor }}>{day.isToday ? tc('todayAt') : day.dow}</MicroLabel>
        <Typography component="span" sx={{ fontSize: '0.8125rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: dayColor }}>
          {day.dom}
        </Typography>
      </Stack>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: day.working ? 'text.primary' : 'text.secondary', opacity: day.isPast ? 0.75 : 1 }}>
          {day.main}
        </Typography>
        {/* On a phone the caption sits under the shift; from a tablet up it has its own column. */}
        <Typography noWrap sx={{ ...small, display: { xs: 'block', sm: 'none' }, minHeight: 16, color: captionColor }}>{day.caption}</Typography>
      </Box>
      <Typography noWrap sx={{ ...small, display: { xs: 'none', sm: 'block' }, color: captionColor }}>{day.caption}</Typography>
      <Typography noWrap sx={{ ...small, display: { xs: 'none', sm: 'block' }, fontWeight: 600, color: 'text.secondary' }}>{day.store}</Typography>
      <Box sx={{ minWidth: 0, textAlign: 'right' }}>
        <Typography noWrap sx={{ ...small, color: 'text.secondary' }}>{day.crew}</Typography>
        <Typography noWrap sx={{ ...small, display: { xs: 'block', sm: 'none' }, fontWeight: 600, color: 'text.secondary' }}>{day.store}</Typography>
      </Box>
    </ButtonBase>
  );
}

const BAR_KEY: Record<WeekTone, 'primary' | 'warning' | 'error'> = { quiet: 'primary', wait: 'warning', problem: 'error' };
const TEXT_TONE: Record<WeekTone, Tone> = { quiet: 'quiet', wait: 'wait', problem: 'problem' };

export function ThisWeekPane({ week, loading, nag, entry, period, onOpenSchedule }: {
  week: WeeklyHoursStatus | undefined;
  loading: boolean;
  nag: HoursNag;
  entry: TimeEntry | null | undefined;
  period: MyPeriod | undefined;
  /** Opens the full week (Everyone) on this tab. */
  onOpenSchedule: () => void;
}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tc, lang } = useTimeClockCopy();
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  const monday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  // The same query (and cache) as the full schedule, so opening it is instant.
  const schedule = useQuery({
    queryKey: ['scheduleWeek', monday],
    queryFn: async () => (await getScheduleWeek(monday)).data,
    refetchInterval: 60_000,
  });
  const today = format(new Date(), 'yyyy-MM-dd');
  const meId = user?.id;
  const days = schedule.data ? weekStrip(schedule.data, meId, period, today, tc, lang) : null;
  const totals = myWeekTotals(schedule.data, meId);
  const { worked, limit, tone, text } = weekWarning(week, nag, entry, period, tc, lang);
  const warnColor = useToneText(TEXT_TONE[tone]);
  const pct = limit > 0 ? Math.min(worked / limit, 1) * 100 : 0;
  const next = nextShiftText(period, tc('todayAt'), lang);
  const canBuild = canAccess(user, SCHEDULE_BUILD_NEED);
  const range = tc('weekRange', {
    from: format(parseISO(monday), 'MMM d', locale),
    to: format(addDays(parseISO(monday), 6), 'MMM d', locale),
  });
  const shiftsLine = totals.shifts === 0 ? tc('noShiftsThisWeek') : totals.shifts === 1 ? tc('oneShiftThisWeek') : tc('shiftsCount', { n: totals.shifts });

  const CalendarIcon = ECO_ICONS.calendar;
  return (
    <Box
      data-testid="this-week-pane"
      sx={{
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '12px',
        border: 1,
        borderColor: tone === 'quiet' ? 'divider' : `${BAR_KEY[tone]}.main`,
        bgcolor: 'background.paper',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      {/* Header: the week and the way to the full schedule. */}
      <Stack
        direction="row"
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        sx={{ gap: 1, px: 2, py: 1.25, bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider' }}
      >
        <Box sx={{ flex: { xs: '1 1 100%', sm: 1 }, minWidth: 0 }}>
          <MicroLabel>{tc('thisWeek')}</MicroLabel>
          <Typography noWrap sx={{ fontSize: '0.9375rem', fontWeight: 800 }}>{range}</Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          {canBuild ? (
            <Button size="small" variant="text" onClick={() => navigate('/people/schedule')} data-testid="build-schedule">
              {tc('buildSchedule')}
            </Button>
          ) : null}
          <Button size="small" variant="contained" startIcon={<CalendarIcon />} onClick={onOpenSchedule} data-testid="open-full-schedule">
            {tc('fullSchedule')}
          </Button>
        </Stack>
      </Stack>

      {/* Hours against the limit, and what is ahead. */}
      <Box
        sx={{
          px: 2,
          pt: 1.75,
          pb: 1.5,
          display: 'grid',
          gap: { xs: 1.5, sm: 2.5 },
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1.25fr) minmax(0, 1fr)' },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <MicroLabel>{tc('hoursWorked')}</MicroLabel>
          {loading && !week ? (
            <Skeleton variant="text" width={160} height={44} />
          ) : (
            <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mt: 0.25 }}>
              <Typography sx={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{worked.toFixed(2)}</Typography>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                {tc('ofLimit', { limit: short(limit) })}
              </Typography>
            </Stack>
          )}
          <Box
            role="progressbar"
            aria-label={tc('thisWeek')}
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            sx={{ mt: 1, height: 8, borderRadius: 99, bgcolor: 'grey.200', overflow: 'hidden' }}
          >
            <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: theme.palette[BAR_KEY[tone]].main, borderRadius: 99, transition: 'width 300ms ease' }} />
          </Box>
          {/* The warning's room is kept whatever it says, so nothing below moves (no layout shift). */}
          <Typography
            role={tone === 'problem' ? 'alert' : undefined}
            data-testid="week-warning"
            sx={{ mt: 1, minHeight: { xs: 54, sm: 38 }, fontSize: '0.84375rem', lineHeight: 1.4, fontWeight: tone === 'quiet' ? 600 : 800, color: tone === 'quiet' ? 'text.secondary' : warnColor }}
          >
            {text}
          </Typography>
        </Box>
        <Stack spacing={1.25} sx={{ minWidth: 0, pl: { sm: 2.5 }, borderLeft: { sm: 1 }, borderColor: { sm: 'divider' } }}>
          <Box>
            <MicroLabel>{tc('onSchedule')}</MicroLabel>
            <Typography sx={{ minHeight: 24, fontSize: '1.0625rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }} data-testid="week-scheduled">
              {schedule.data ? `${short(totals.hours)} h` : ' '}
              <Box component="span" sx={{ ml: 1, fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary' }}>{schedule.data ? shiftsLine : ''}</Box>
            </Typography>
          </Box>
          <Box>
            <MicroLabel>{tc('nextShift')}</MicroLabel>
            <Typography data-testid="next-shift" noWrap sx={{ minHeight: 24, fontSize: '1.0625rem', fontWeight: 800, color: next ? 'text.primary' : 'text.secondary' }}>
              {period ? next ?? tc('nextNone') : ' '}
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* The week, day by day: a row opens the full schedule. Seven rows always, so nothing moves as it loads. */}
      <Box sx={{ px: 2, pb: 2 }}>
        <MicroLabel sx={{ mb: 0.75 }}>{tc('myWeekLabel')}</MicroLabel>
        <Box
          data-testid="week-strip"
          sx={{ borderRadius: '10px', border: 1, borderColor: 'divider', overflow: 'hidden', '& > :last-child': { borderBottom: 0 } }}
        >
          {days
            ? days.map((d) => <DayRow key={d.date} day={d} tc={tc} onOpen={onOpenSchedule} />)
            : Array.from({ length: 7 }, (_, i) => (
              <Box key={i} sx={{ height: { xs: 46, sm: 36 }, px: 1.25, display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'grey.100' }}>
                {schedule.isError && i === 0 ? (
                  <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{tc('scheduleLoadFailed')}</Typography>
                ) : <Skeleton variant="text" width="60%" />}
              </Box>
            ))}
        </Box>
      </Box>
    </Box>
  );
}
