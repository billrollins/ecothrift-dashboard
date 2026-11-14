/**
 * Dash Home > Routines (Bill 2026-11-13, .ai/extended/home-and-hr-structure.md decision 8): today's to-do list, and the
 * routine runner beside it. It was the Today page's middle column; when Time clock replaced Today (Dash Update #137)
 * the runner came here with the list. A routine opens through the URL (`/dashboard?tab=routines&run=12`), so Back
 * closes it on a phone. Desk: the list, and the phone-sized runner slides in to its right. Phone: the runner takes the
 * whole screen.
 */
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { dutyColors } from '../../components/duty/tokens';
import { FloorPage } from '../../components/layout/FloorPage';
import { PhoneFrame } from '../../components/layout/PhoneFrame';
import { TodayWork } from '../../components/routines/today/TodayWork';
import { useTodayModel } from '../../components/routines/today/useTodayModel';
import { t } from '../../i18n/routines';
import { RoutineRunnerPage } from '../routines/RoutineRunnerPage';

const PHONE = 'clamp(340px, 36%, 440px)';

const listBoxSx = {
  minWidth: 0,
  minHeight: 0,
  overflowY: 'auto',
  px: 1.5,
  py: 1,
  border: `1px solid ${dutyColors.ink15}`,
  borderRadius: '12px',
  bgcolor: dutyColors.card,
} as const;

export default function RoutinesTab() {
  const theme = useTheme();
  const isDesk = useMediaQuery(theme.breakpoints.up('md'));
  const { lang, work, clockedIn, loadingLists, runner } = useTodayModel();

  if (!isDesk) {
    if (runner.open) {
      return (
        <Box sx={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', bgcolor: dutyColors.paper }}>
          <PhoneFrame framed={false} background={dutyColors.paper} contentSx={{ overflow: 'hidden' }}>
            <RoutineRunnerPage key={runner.key} runId={runner.runId ?? undefined} onClose={runner.close} />
          </PhoneFrame>
        </Box>
      );
    }
    return (
      <Box sx={{ px: 2, pt: 2, pb: 3, bgcolor: dutyColors.paper, minHeight: '100%' }}>
        <Box sx={listBoxSx}>
          <TodayWork work={work} loading={loadingLists} clockedIn={clockedIn} lang={lang} onOpen={runner.openHref} />
        </Box>
      </Box>
    );
  }

  const open = runner.open;
  return (
    <FloorPage title={t('routines', lang)} subtitle="What needs doing today">
      <Box
        sx={{
          display: 'grid',
          // The list keeps its width (as it was on its own); the runner slides in beside it.
          gridTemplateColumns: open ? `minmax(0, 760px) ${PHONE}` : 'minmax(0, 760px) 0px',
          transition: 'grid-template-columns 280ms ease',
          height: 'calc(100dvh - 210px)',
          minHeight: 560,
        }}
      >
        <Box sx={listBoxSx}>
          <TodayWork
            work={work}
            loading={loadingLists}
            clockedIn={clockedIn}
            lang={lang}
            onOpen={runner.openHref}
            selectedRunId={runner.runId}
          />
        </Box>
        <Box sx={{ minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
          {open ? (
            <Box sx={{ flex: 1, minWidth: 0, pl: 2, display: 'flex' }}>
              <PhoneFrame framed stage inset background={dutyColors.paper} contentSx={{ overflow: 'hidden' }}>
                <RoutineRunnerPage key={runner.key} runId={runner.runId ?? undefined} onClose={runner.close} />
              </PhoneFrame>
            </Box>
          ) : null}
        </Box>
      </Box>
    </FloorPage>
  );
}
