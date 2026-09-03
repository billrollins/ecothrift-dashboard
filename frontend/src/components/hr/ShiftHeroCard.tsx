import { Box, Button, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useState, type ReactNode } from 'react';
import type { TimeEntry, WeeklyHoursStatus } from '../../types/hr.types';
import { t } from '../../i18n/routines';
import { dutyColors } from '../duty/tokens';
import { elapsedSeconds, formatElapsed, useNowTick } from '../../pages/hr/timeClockFormat';
import { eyebrowSx, ShiftChip, ShiftMenu, ShiftPicker } from './ShiftPicker';
import { weekStatusLine } from './weekStatus';

const cardSx = {
  bgcolor: dutyColors.card,
  border: `1px solid ${dutyColors.ink15}`,
  borderRadius: '12px',
  px: 2,
  pt: 2,
  pb: 2,
} as const;

export function ShiftHeroCard({
  entry,
  weekly,
  lang,
  actions,
  onClockIn,
  pendingClockIn,
  onSetShift,
}: {
  entry: TimeEntry | null | undefined;
  weekly: WeeklyHoursStatus | undefined;
  lang: string;
  actions?: ReactNode;
  onClockIn: (shift: string) => void;
  pendingClockIn?: boolean;
  onSetShift: (shift: string) => void;
}) {
  const now = useNowTick(Boolean(entry));
  const onBreak = Boolean(entry?.on_break);
  const elapsed = elapsedSeconds(entry, now);
  const status = weekStatusLine(weekly, onBreak, elapsed, lang);
  const [shiftEl, setShiftEl] = useState<null | HTMLElement>(null);

  if (!entry) {
    return (
      <Box sx={cardSx}>
        <Typography sx={{ ...eyebrowSx, mb: 1 }}>{t('clockIn', lang)}</Typography>
        <ShiftPicker lang={lang} pending={pendingClockIn} onPick={onClockIn} />
      </Box>
    );
  }

  return (
    <Box sx={cardSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: onBreak ? dutyColors.amberBg : dutyColors.brand,
            animation: onBreak ? 'none' : 'livePulse 1.6s ease-in-out infinite',
            '@keyframes livePulse': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.3 },
            },
          }}
        />
        <Typography
          sx={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: onBreak ? dutyColors.amberInk : dutyColors.brand,
          }}
        >
          {t(onBreak ? 'onBreak' : 'onTheClock', lang)}
        </Typography>
      </Box>
      <Typography
        sx={{
          mt: 0.75,
          fontSize: 52,
          fontWeight: 900,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          color: onBreak ? dutyColors.amberInk : dutyColors.ink,
        }}
      >
        {formatElapsed(elapsed)}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, minHeight: 32 }}>
        <ShiftChip code={entry.shift} label={entry.shift_label} lang={lang} />
        <Button size="small" onClick={(e) => setShiftEl(e.currentTarget)}>
          {t('changeShift', lang)}
        </Button>
        <ShiftMenu
          anchorEl={shiftEl}
          current={entry.shift}
          lang={lang}
          onClose={() => setShiftEl(null)}
          onPick={(shift) => {
            setShiftEl(null);
            onSetShift(shift);
          }}
        />
      </Box>
      <Typography sx={{ fontSize: 13, color: dutyColors.ink60, minHeight: 20, mt: 0.5 }}>
        {t('clockedInAt', lang)} {format(parseISO(entry.clock_in), 'h:mm a')}
        {onBreak && entry.break_started_at
          ? ` · ${t('breakSince', lang)} ${format(parseISO(entry.break_started_at), 'h:mm a')}`
          : ''}
      </Typography>
      <Box sx={{ minHeight: actions ? 128 : 0, mt: actions ? 1.5 : 0 }}>{actions}</Box>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: status.color, minHeight: 20, mt: 1 }}>
        {status.text}
      </Typography>
    </Box>
  );
}
