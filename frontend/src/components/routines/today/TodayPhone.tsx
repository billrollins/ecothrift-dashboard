import { Box } from '@mui/material';
import { dutyColors } from '../../duty/tokens';
import { HoursPayPanel } from '../../hr/HoursPayPanel';
import { ShiftHeroCard } from '../../hr/ShiftHeroCard';
import { PhoneFrame } from '../../layout/PhoneFrame';
import { RoutineRunnerPage } from '../../../pages/routines/RoutineRunnerPage';
import { ClockOutRoutineGuard } from '../ClockOutRoutineGuard';
import { PunchActions } from './PunchActions';
import { TodayHeader } from './TodayHeader';
import { TodayWork } from './TodayWork';
import { useTodayModel } from './useTodayModel';

export function TodayPhone() {
  const model = useTodayModel();
  const { lang, weekly, clock, runner, now, work, clockedIn, loadingLists, greeting } = model;

  // A routine takes the whole screen on a phone; Back (or Save / Cancel) returns to Today.
  if (runner.open) {
    return (
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <PhoneFrame framed={false} background={dutyColors.paper} contentSx={{ overflow: 'hidden' }}>
          <RoutineRunnerPage key={runner.key} runId={runner.runId ?? undefined} onClose={runner.close} />
        </PhoneFrame>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 560,
        mx: 'auto',
        px: 2,
        pt: 2,
        pb: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      <TodayHeader
        greeting={greeting}
        now={now}
        clockedIn={clockedIn}
        onBreak={clock.onBreak}
        dueCount={work.count}
        nagCount={work.nagCount}
        nagTone={work.nagTone}
        lang={lang}
      />

      <ShiftHeroCard
        entry={clock.entry}
        weekly={weekly.data}
        lang={lang}
        onClockIn={(shift) => { void clock.clockIn(shift); }}
        pendingClockIn={clock.pending.clockIn}
        onSetShift={clock.setShift}
        actions={clockedIn ? (
          <PunchActions
            onBreak={clock.onBreak}
            pendingBreak={clock.pending.break}
            pendingClockOut={clock.pending.clockOut}
            onToggleBreak={() => { void clock.toggleBreak(); }}
            onClockOut={() => { void clock.clockOut(); }}
            lang={lang}
          />
        ) : undefined}
      />

      <TodayWork work={work} loading={loadingLists} clockedIn={clockedIn} lang={lang} onOpen={runner.openHref} />

      <HoursPayPanel />

      <ClockOutRoutineGuard
        open={clock.guardOpen}
        runs={clock.owed}
        busy={clock.pending.clockOut}
        onClose={clock.closeGuard}
        onClockOut={() => { void clock.clockOut(); }}
      />
    </Box>
  );
}
