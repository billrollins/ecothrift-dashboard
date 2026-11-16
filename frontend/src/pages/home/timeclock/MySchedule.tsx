/**
 * TimeClock > My schedule (Dash Update #179): my shifts from today on, this week and next, one row each. Store
 * schedule (the title's link) opens the whole week for everyone; managers also get Build (/people/schedule).
 */
import { Box, Button, ButtonBase, Skeleton, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyWeek, type ScheduledShift } from '../../../api/schedule.api';
import { canAccess } from '../../../auth/access';
import { MicroLabel } from '../../../components/page/RichKit';
import { useAuth } from '../../../hooks/useAuth';
import { ECO_ICONS } from '../../../icons/ecoIcons';
import { useTimeClockCopy } from './copy';
import { EmptyRow, Panel, rowSx, todayRowSx } from './Panel';

/** Who may open the Schedule builder: the same need as its route (App.tsx ScheduleRoute). */
export const SCHEDULE_BUILD_NEED = ['hr.schedule:write', 'people:manage'];

/** Rows shown before "+N more". */
export const SCHEDULE_ROWS = 5;

const todayYmd = () => format(new Date(), 'yyyy-MM-dd');

/** My shifts this week and next (the same query as the Me page's My week). */
export function useMyShifts() {
  return useQuery({ queryKey: ['schedule', 'my-week'], queryFn: async () => (await getMyWeek()).data, staleTime: 60_000 });
}

export interface UpcomingShift extends ScheduledShift {
  isToday: boolean;
  /** The first shift of next week: a "Next week" line goes above it. */
  startsNextWeek: boolean;
}

/** From today on, in order; `weekStart` is the Monday the list starts from. */
export function upcomingShifts(weekStart: string, shifts: ScheduledShift[], today: string): UpcomingShift[] {
  const nextMonday = format(addDays(parseISO(weekStart), 7), 'yyyy-MM-dd');
  const rows = shifts
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  let marked = false;
  return rows.map((s) => {
    const startsNextWeek = !marked && s.date >= nextMonday;
    if (startsNextWeek) marked = true;
    return { ...s, isToday: s.date === today, startsNextWeek };
  });
}

/** Today's shifts on the schedule (the Now card names them and offers their department to clock in). */
export function todaysShifts(shifts: ScheduledShift[] | undefined, today = todayYmd()): ScheduledShift[] {
  return (shifts ?? []).filter((s) => s.date === today).sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export function MySchedule({ onOpenStore }: { onOpenStore: () => void }) {
  const { tc, lang } = useTimeClockCopy();
  const { user } = useAuth();
  const navigate = useNavigate();
  const query = useMyShifts();
  const [all, setAll] = useState(false);
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  const rows = query.data ? upcomingShifts(query.data.start, query.data.shifts, todayYmd()) : null;
  const shown = rows && !all ? rows.slice(0, SCHEDULE_ROWS) : rows;
  const more = rows ? rows.length - (shown?.length ?? 0) : 0;
  const CalendarIcon = ECO_ICONS.calendar;

  return (
    <Panel
      testId="my-schedule"
      title={tc('mySchedule')}
      action={(
        <>
          {canAccess(user, SCHEDULE_BUILD_NEED) ? (
            <Button size="small" color="inherit" onClick={() => navigate('/people/schedule')} data-testid="build-schedule" sx={{ color: 'text.secondary', minWidth: 0 }}>
              {tc('buildSchedule')}
            </Button>
          ) : null}
          <Button size="small" startIcon={<CalendarIcon />} onClick={onOpenStore} data-testid="open-store-schedule" sx={{ fontWeight: 800 }}>
            {tc('storeSchedule')}
          </Button>
        </>
      )}
    >
      {!shown ? (
        [0, 1, 2].map((n) => <Box key={n} sx={rowSx}><Skeleton variant="text" width="70%" /></Box>)
      ) : shown.length === 0 ? (
        <EmptyRow>{tc('nothingScheduled')}</EmptyRow>
      ) : shown.map((s) => (
        <Box key={s.id}>
          {s.startsNextWeek ? (
            <Box sx={(t) => ({ px: 2, pt: 1, pb: 0.5, borderTop: `1px solid ${t.palette.grey[100]}` })}>
              <MicroLabel>{tc('nextWeek')}</MicroLabel>
            </Box>
          ) : null}
          <Box
            data-testid={`my-shift-${s.id}`}
            sx={(t) => ({ ...rowSx(t), gridTemplateColumns: '64px minmax(0, 1fr) auto', ...(s.isToday ? todayRowSx(t) : {}) })}
          >
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 800, color: s.isToday ? 'primary.dark' : 'text.secondary' }}>
              {s.isToday ? tc('today') : format(parseISO(s.date), 'EEE d', locale)}
            </Typography>
            <Typography noWrap sx={{ fontSize: '0.9375rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {s.text}
              <Box component="span" sx={{ ml: 1, fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary' }}>{s.department_name}</Box>
            </Typography>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {Number(Number(s.hours).toFixed(2))} h
            </Typography>
          </Box>
        </Box>
      ))}
      {more > 0 ? (
        <ButtonBase onClick={() => setAll(true)} sx={(t) => ({ ...rowSx(t), width: '100%', justifyContent: 'start', color: 'primary.main', fontWeight: 800, fontSize: '0.8125rem' })}>
          {tc('moreShifts', { n: more })}
        </ButtonBase>
      ) : null}
    </Panel>
  );
}
