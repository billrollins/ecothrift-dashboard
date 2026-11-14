import { Box } from '@mui/material';
import { useState } from 'react';
import { ClockInLimitDialog } from '../../../components/hr/ClockInLimitDialog';
import { ShiftHeroCard } from '../../../components/hr/ShiftHeroCard';
import { PunchConfirmDialog, type PunchAsk } from '../../../components/layout/ClockPill';
import { ClockOutRoutineGuard } from '../../../components/routines/ClockOutRoutineGuard';
import { PunchActions } from '../../../components/routines/today/PunchActions';
import { useWeeklyHoursStatus } from '../../../hooks/useTimeClock';
import type { useTimeClockActions } from '../../hr/useTimeClockActions';

/**
 * Clock in, take a break, clock out: the shift card that was on Today (Dash Update #137). Every punch asks again
 * first (owner, 2026-11-02). The weekly-hours warning sits in the card beside it (WeekHoursCard), in a fixed slot, so
 * nothing here grows when it shows.
 */
export function ClockCard({ clock, lang }: { clock: ReturnType<typeof useTimeClockActions>; lang: string }) {
  const weekly = useWeeklyHoursStatus();
  const [ask, setAsk] = useState<PunchAsk>(null);
  const clockedIn = Boolean(clock.entry);

  return (
    <Box data-testid="time-clock-card" sx={{ height: '100%', '& > *': { height: '100%', boxSizing: 'border-box' } }}>
      <ShiftHeroCard
        entry={clock.entry}
        weekly={weekly.data}
        lang={lang}
        onClockIn={(shift, label) => setAsk({ kind: 'in', shift, label })}
        pendingClockIn={clock.pending.clockIn}
        onSetShift={clock.setShift}
        onFixForgotten={(at) => { void clock.fixForgotten(at); }}
        pendingFix={clock.pending.fix}
        actions={clockedIn ? (
          <PunchActions
            onBreak={clock.onBreak}
            pendingBreak={clock.pending.break}
            pendingClockOut={clock.pending.clockOut}
            onToggleBreak={() => { void clock.toggleBreak(); }}
            onClockOut={() => setAsk({ kind: 'out' })}
            lang={lang}
          />
        ) : undefined}
      />
      <PunchConfirmDialog
        ask={ask}
        busy={clock.pending.clockIn || clock.pending.clockOut}
        onCancel={() => setAsk(null)}
        onConfirm={(confirmed) => {
          setAsk(null);
          if (confirmed.kind === 'out') void clock.clockOut();
          else void clock.clockIn(confirmed.shift);
        }}
      />
      <ClockInLimitDialog
        open={clock.limitOpen}
        lang={lang}
        busy={clock.pending.clockIn}
        onCancel={clock.closeLimit}
        onConfirm={clock.confirmLimit}
      />
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
