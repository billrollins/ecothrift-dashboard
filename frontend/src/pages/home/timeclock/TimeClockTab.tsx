/**
 * Dash Home > Time clock (Dash Update #137; Bill 2026-11-13, .ai/extended/home-and-hr-structure.md decisions 3, 4, 8
 * and 12). It replaces Today ("too busy"): the clock card on top (in, break, out) with this week's hours and the
 * overtime warning beside it, then a switch, Mine | Everyone. Mine is this pay period (hours, pay so far and expected,
 * each shift with Fix, time off). Everyone is the week's schedule, read only: the same grid managers build it on in
 * the HR workspace. The routine list moved to the Routines tab.
 *
 * Kit rules: the band (desk) or the top bar (phone) names the tab, so the body never repeats it; tables turn into
 * cards on a phone (StackOnPhone). `?view=everyone` opens Everyone (old staff Schedule links land there).
 */
import { Box, LinearProgress, Stack, ToggleButton, ToggleButtonGroup, useMediaQuery, useTheme } from '@mui/material';
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FloorPage } from '../../../components/layout/FloorPage';
import { PageToolbar } from '../../../components/page/PageKit';
import StackOnPhone from '../../../components/page/StackOnPhone';
import { useHoursNag } from '../../../hooks/useHoursNag';
import { useMyPeriod, useWeeklyHoursStatus } from '../../../hooks/useTimeClock';
import { t } from '../../../i18n/routines';
import { useTimeClockActions } from '../../hr/useTimeClockActions';
import { ClockCard } from './ClockCard';
import { useTimeClockCopy } from './copy';
import { MineView } from './MineView';
import { WeekHoursCard } from './WeekHoursCard';

const SchedulePage = lazy(() => import('../../people/SchedulePage'));

export type TimeClockView = 'mine' | 'everyone';

export function timeClockView(params: URLSearchParams): TimeClockView {
  return params.get('view') === 'everyone' ? 'everyone' : 'mine';
}

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

  const pick = (next: TimeClockView | null) => {
    if (!next || next === view) return;
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      out.set('tab', 'myday');
      if (next === 'everyone') out.set('view', 'everyone');
      else out.delete('view');
      return out;
    }, { replace: true });
  };

  const body = (
    <StackOnPhone sx={{ width: '100%', minWidth: 0 }}>
      <Stack spacing={{ xs: 2, md: 2.5 }}>
        <Box
          sx={{
            display: 'grid',
            gap: { xs: 1.5, md: 2 },
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(340px, 440px) minmax(0, 1fr)' },
            alignItems: 'stretch',
          }}
        >
          <ClockCard clock={clock} lang={lang} />
          <WeekHoursCard week={weekly.data} loading={weekly.isLoading} nag={nag} entry={clock.entry} period={period.data} />
        </Box>

        <PageToolbar
          lead={(
            <ToggleButtonGroup
              exclusive
              size="small"
              value={view}
              onChange={(_e, next: TimeClockView | null) => pick(next)}
              aria-label={tc('viewLabel')}
              sx={{ '& .MuiToggleButton-root': { px: 2.5, fontWeight: 700, textTransform: 'none', minWidth: 112 } }}
            >
              <ToggleButton value="mine" data-testid="time-clock-mine-tab">{tc('mine')}</ToggleButton>
              <ToggleButton value="everyone" data-testid="time-clock-everyone-tab">{tc('everyone')}</ToggleButton>
            </ToggleButtonGroup>
          )}
        />

        {view === 'mine' ? <MineView /> : (
          <Box data-testid="time-clock-everyone" sx={{ minWidth: 0 }}>
            <Suspense fallback={<LinearProgress />}>
              <SchedulePage embedded />
            </Suspense>
          </Box>
        )}
      </Stack>
    </StackOnPhone>
  );

  if (isDesk) return <FloorPage title={t('timeClock', lang)}>{body}</FloorPage>;
  return <Box sx={{ px: 2, pt: 2, pb: 3, minWidth: 0 }}>{body}</Box>;
}
