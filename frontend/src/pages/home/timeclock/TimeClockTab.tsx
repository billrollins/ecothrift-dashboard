/**
 * Dash Home > TimeClock (Dash Updates #137, #179; Bill 2026-11-16: "clean and sleek, easy to see and understand at
 * a glance"). One screen, five cards, no switch:
 *
 *   Now          clock in, break, clock out; this week's hours against the limit (the overtime warning)
 *   My schedule  my shifts from today on; Store schedule opens the whole week for everyone
 *   Pay          so far and expected this pay period (hidden until the eye; off payroll sees hours)
 *   Time off     ask, see the answer, withdraw
 *   Past shifts  this pay period, newest first, each with Fix (a time change request)
 *
 * On a desk: Now | My schedule | Pay over Time off, then Past shifts across. On a phone: one column in that order.
 * Store schedule is `?view=everyone` (old staff Schedule links land there): the same read-only week grid managers
 * build in the HR workspace, with a way back. The band (desk) or the top bar (phone) names the tab.
 */
import { Alert, Box, Button, LinearProgress, Stack, useMediaQuery, useTheme } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { withdrawScheduleRequest } from '../../../api/schedule.api';
import { TimeChangeDialog } from '../../../components/hr/TimeChangeDialog';
import { FloorPage } from '../../../components/layout/FloorPage';
import { useHoursNag } from '../../../hooks/useHoursNag';
import { useMyPeriod, useWeeklyHoursStatus } from '../../../hooks/useTimeClock';
import { ECO_ICONS } from '../../../icons/ecoIcons';
import { t } from '../../../i18n/routines';
import type { MyPeriodWorked } from '../../../types/hr.types';
import { useTimeClockActions } from '../../hr/useTimeClockActions';
import { AskDialog } from '../../people/ScheduleRequests';
import { errorText } from '../../people/scheduleLayout';
import { useTimeClockCopy } from './copy';
import { MySchedule, todaysShifts, useMyShifts } from './MySchedule';
import { NowCard } from './NowCard';
import { PastShifts, PayCard, TimeOffCard } from './PeriodCards';

const SchedulePage = lazy(() => import('../../people/SchedulePage'));

export type TimeClockView = 'mine' | 'everyone';

export function timeClockView(params: URLSearchParams): TimeClockView {
  return params.get('view') === 'everyone' ? 'everyone' : 'mine';
}

const AREAS = {
  xs: '"now" "sched" "pay" "off" "past"',
  md: '"now sched" "pay off" "past past"',
  lg: '"now sched side" "past past past"',
} as const;
const COLUMNS = {
  xs: 'minmax(0, 1fr)',
  md: 'minmax(0, 1fr) minmax(0, 1fr)',
  lg: 'minmax(300px, 1fr) minmax(0, 1.2fr) minmax(280px, 0.9fr)',
} as const;

export default function TimeClockTab() {
  const theme = useTheme();
  const isDesk = useMediaQuery(theme.breakpoints.up('md'));
  const { tc, lang } = useTimeClockCopy();
  const [params, setParams] = useSearchParams();
  const view = timeClockView(params);
  const clock = useTimeClockActions();
  const weekly = useWeeklyHoursStatus();
  const nag = useHoursNag();
  const period = useMyPeriod();
  const myShifts = useMyShifts();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [fixing, setFixing] = useState<MyPeriodWorked | null>(null);
  const [asking, setAsking] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const data = period.data;

  const show = (next: TimeClockView) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      out.set('tab', 'myday');
      if (next === 'everyone') out.set('view', 'everyone');
      else out.delete('view');
      return out;
    });
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['timeClock', 'myPeriod'] });
    void queryClient.invalidateQueries({ queryKey: ['scheduleRequests'] });
    void queryClient.invalidateQueries({ queryKey: ['scheduleWeek'] });
    void queryClient.invalidateQueries({ queryKey: ['schedule', 'my-week'] });
  };
  const withdraw = async (id: number) => {
    setBusyId(id);
    try {
      await withdrawScheduleRequest(id);
      refresh();
    } catch (err) {
      enqueueSnackbar(errorText(err, tc('couldNot')), { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const BackIcon = ECO_ICONS.back;
  const body = view === 'everyone' ? (
    <Stack spacing={1.5} data-testid="time-clock-everyone" sx={{ minWidth: 0 }}>
      <Box>
        <Button size="small" startIcon={<BackIcon />} onClick={() => show('mine')} data-testid="back-to-time-clock" sx={{ fontWeight: 800 }}>
          {tc('backToTimeClock')}
        </Button>
      </Box>
      <Suspense fallback={<LinearProgress />}>
        <SchedulePage embedded />
      </Suspense>
    </Stack>
  ) : (
    <Box data-testid="time-clock-mine" sx={{ display: 'grid', gap: { xs: 1.5, md: 2 }, gridTemplateAreas: AREAS, gridTemplateColumns: COLUMNS, alignItems: 'stretch', minWidth: 0 }}>
      {period.isError && !data ? <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>{tc('couldNotLoad')}</Alert> : null}
      <Box sx={{ gridArea: 'now', minWidth: 0, display: 'grid' }}>
        <NowCard clock={clock} week={weekly.data} nag={nag} period={data} todays={todaysShifts(myShifts.data?.shifts)} />
      </Box>
      <Box sx={{ gridArea: 'sched', minWidth: 0, display: 'grid' }}>
        <MySchedule onOpenStore={() => show('everyone')} />
      </Box>
      {/* From 1200 px the two small cards share the third column; below that each takes its own cell. */}
      <Box sx={{ display: { xs: 'contents', lg: 'flex' }, gridArea: { lg: 'side' }, flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <Box sx={{ gridArea: { xs: 'pay', lg: 'auto' }, minWidth: 0, display: 'grid' }}>
          <PayCard period={data} />
        </Box>
        <Box sx={{ gridArea: { xs: 'off', lg: 'auto' }, minWidth: 0, display: 'grid', flex: 1 }}>
          <TimeOffCard period={data} onAsk={() => setAsking(true)} onWithdraw={withdraw} busyId={busyId} />
        </Box>
      </Box>
      <Box sx={{ gridArea: 'past', minWidth: 0 }}>
        <PastShifts period={data} onFix={setFixing} />
      </Box>
      <TimeChangeDialog entry={fixing} onClose={() => { setFixing(null); refresh(); }} />
      {asking && data ? (
        <AskDialog initial={{ date: data.today }} today={data.today} onClose={() => setAsking(false)} onSent={refresh} />
      ) : null}
    </Box>
  );

  if (isDesk) return <FloorPage title={t('timeClock', lang)}>{body}</FloorPage>;
  return <Box sx={{ px: 2, pt: 2, pb: 3, minWidth: 0 }}>{body}</Box>;
}
