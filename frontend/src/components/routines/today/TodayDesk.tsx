import { Box, Chip, Typography } from '@mui/material';
import { format } from 'date-fns';
import { t } from '../../../i18n/routines';
import { FloorPage } from '../../layout/FloorPage';
import { ClockOutRoutineGuard } from '../ClockOutRoutineGuard';
import { dutyColors } from '../../duty/tokens';
import { ShiftHeroCard } from '../../hr/ShiftHeroCard';
import { eyebrowSx } from '../../hr/ShiftPicker';
import { WeekHoursBar } from '../../hr/WeekHoursBar';
import { PunchActions } from './PunchActions';
import { TodayGlanceSections } from './TodayGlanceSections';
import { useTodayModel } from './useTodayModel';

const bandChipSx = {
  height: 24,
  fontWeight: 700,
  bgcolor: 'rgba(255,255,255,0.16)',
  color: '#fff',
  '& .MuiChip-label': { color: '#fff' },
} as const;

export function TodayDesk() {
  const model = useTodayModel();
  const { lang, weekly, clock, now, data, clockedIn, start, due, drafts, workCycle, loadingLists, greeting, lateCount, weekLine, weekWarn } = model;

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
          {clockedIn ? (
            <Chip size="small" label={`${due.length} ${t('due', lang)}`} sx={bandChipSx} />
          ) : null}
          {clockedIn && lateCount > 0 ? (
            <Chip
              size="small"
              label={t('late', lang)}
              sx={{ height: 24, fontWeight: 700, bgcolor: dutyColors.red, color: '#fff' }}
            />
          ) : null}
          {clockedIn && weekWarn ? (
            <Chip size="small" label={weekLine.text} sx={{ ...bandChipSx, maxWidth: '100%' }} />
          ) : null}
        </>
      )}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(360px, 420px) 1fr',
          gap: 2,
          alignItems: 'stretch',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
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
                row
              />
            ) : undefined}
          />
          <WeekHoursBar weekly={weekly.data} lang={lang} sx={{ flex: 1 }} />
        </Box>

        <Box sx={{ minHeight: 430, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {clockedIn ? (
            <TodayGlanceSections
              loading={loadingLists}
              start={start}
              due={due}
              drafts={drafts}
              workCycle={workCycle}
              verifyOf={data?.verify_of}
              lang={lang}
              columns={3}
            />
          ) : (
            <Box
              sx={{
                flex: 1,
                minHeight: 430,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
                border: `1px dashed ${dutyColors.ink15}`,
                borderRadius: '12px',
                bgcolor: dutyColors.card,
                px: 3,
                textAlign: 'center',
              }}
            >
              <Typography sx={{ ...eyebrowSx }}>{t('dayAtAGlance', lang)}</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 800, color: dutyColors.ink }}>
                {t('pickShiftToSeeDay', lang)}
              </Typography>
              <Typography sx={{ fontSize: 13.5, color: dutyColors.ink40, maxWidth: 420 }}>
                {t('glanceExplainer', lang)}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

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
