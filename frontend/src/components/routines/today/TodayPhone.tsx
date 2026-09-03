import { Box, Typography } from '@mui/material';
import { t } from '../../../i18n/routines';
import { ClockOutRoutineGuard } from '../ClockOutRoutineGuard';
import { dutyColors } from '../../duty/tokens';
import { ShiftHeroCard } from '../../hr/ShiftHeroCard';
import { PunchActions } from './PunchActions';
import { TodayGlanceSections } from './TodayGlanceSections';
import { TodayHeader } from './TodayHeader';
import { useTodayModel } from './useTodayModel';

export function TodayPhone() {
  const model = useTodayModel();
  const { lang, weekly, clock, now, data, clockedIn, start, due, drafts, workCycle, loadingLists, greeting, lateCount, weekLine, weekWarn } = model;

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
        dueCount={due.length}
        lateCount={lateCount}
        weekWarn={weekWarn}
        weekLine={weekLine.text}
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

      {clockedIn ? (
        <TodayGlanceSections
          loading={loadingLists}
          start={start}
          due={due}
          drafts={drafts}
          workCycle={workCycle}
          verifyOf={data?.verify_of}
          lang={lang}
        />
      ) : (
        <Typography sx={{ fontSize: 13, color: dutyColors.ink40, minHeight: 20 }}>
          {t('pickShiftToSeeDay', lang)}
        </Typography>
      )}

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
