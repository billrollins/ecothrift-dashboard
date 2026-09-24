import { Box, Chip } from '@mui/material';
import { format } from 'date-fns';
import { t } from '../../../i18n/routines';
import { RoutineRunnerPage } from '../../../pages/routines/RoutineRunnerPage';
import { dutyColors } from '../../duty/tokens';
import { ClockInLimitDialog } from '../../hr/ClockInLimitDialog';
import { HoursPayPanel } from '../../hr/HoursPayPanel';
import { ShiftHeroCard } from '../../hr/ShiftHeroCard';
import { FloorPage } from '../../layout/FloorPage';
import { PhoneFrame } from '../../layout/PhoneFrame';
import { ClockOutRoutineGuard } from '../ClockOutRoutineGuard';
import { PunchActions } from './PunchActions';
import { NAG_CHIP_BG } from './TodayHeader';
import { TodayWork } from './TodayWork';
import { useTodayModel } from './useTodayModel';

const bandChipSx = {
  height: 24,
  fontWeight: 700,
  bgcolor: 'rgba(255,255,255,0.16)',
  color: '#fff',
  '& .MuiChip-label': { color: '#fff' },
} as const;

const SIDE = 400;
const PHONE = 'clamp(340px, 36%, 440px)';

/**
 * Today on a desk: the shift and Hours & pay on the left, today's routines in the middle.
 * Starting a routine slides the left column away and opens the phone runner to the right of
 * the list, the same screen staff see on a phone. Closing it slides everything back.
 */
export function TodayDesk() {
  const model = useTodayModel();
  const { lang, weekly, clock, runner, hours, nag, now, work, clockedIn, loadingLists, greeting } = model;
  const open = runner.open;

  return (
    <FloorPage
      title={greeting}
      subtitle={format(new Date(now), 'EEEE, MMMM d · h:mm a')}
      chips={(
        <>
          <Chip
            size="small"
            label={clockedIn
              ? t(clock.onBreak ? 'onBreak' : 'onTheClock', lang)
              : t('clockedOut', lang)}
            sx={clock.onBreak
              ? { height: 24, fontWeight: 700, bgcolor: dutyColors.amberBg, color: dutyColors.amberInk }
              : bandChipSx}
          />
          {work.count > 0 ? (
            <Chip size="small" label={`${work.count} ${t('toDoLower', lang)}`} sx={bandChipSx} />
          ) : null}
          {nag.count > 0 && nag.tone !== 'none' ? (
            <Chip
              size="small"
              label={`${nag.count} ${t(nag.count === 1 ? 'naggingOne' : 'nagging', lang)}`}
              sx={{ height: 24, fontWeight: 700, bgcolor: NAG_CHIP_BG[nag.tone], color: '#fff' }}
            />
          ) : null}
        </>
      )}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: open ? `0px minmax(0, 1fr) ${PHONE}` : `${SIDE}px minmax(0, 1fr) 0px`,
          transition: 'grid-template-columns 280ms ease',
          height: 'calc(100dvh - 210px)',
          minHeight: 560,
        }}
      >
        <Box
          aria-hidden={open}
          sx={{ minWidth: 0, overflow: 'hidden', opacity: open ? 0 : 1, transition: 'opacity 180ms ease' }}
        >
          <Box
            sx={{
              width: SIDE,
              height: '100%',
              pr: 2,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {/* The clock card keeps its height; Hours & pay fills the rest, level with To do today. */}
            <Box sx={{ flexShrink: 0 }}>
              <ShiftHeroCard
                entry={clock.entry}
                weekly={weekly.data}
                hoursNag={hours}
                lang={lang}
                onClockIn={(shift) => { void clock.clockIn(shift); }}
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
                    onClockOut={() => { void clock.clockOut(); }}
                    lang={lang}
                    row
                  />
                ) : undefined}
              />
            </Box>
            <HoursPayPanel fill />
          </Box>
        </Box>

        <Box
          sx={{
            minWidth: 0,
            minHeight: 0,
            overflowY: 'auto',
            px: 1.5,
            py: 1,
            border: `1px solid ${dutyColors.ink15}`,
            borderRadius: '12px',
            bgcolor: dutyColors.card,
          }}
        >
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
    </FloorPage>
  );
}
