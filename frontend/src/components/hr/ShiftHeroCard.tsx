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
  // Only notes about this shift (on break, very long). Weekly hours live in Hours & pay.
  const shiftNote = onBreak || elapsed > 16 * 3600 ? weekStatusLine(weekly, onBreak, elapsed, lang) : null;
  const [shiftEl, setShiftEl] = useState<null | HTMLElement>(null);

  if (!entry) {
    return (
      <Box sx={cardSx}>
        <Typography sx={{ ...eyebrowSx, mb: 1 }}>{t('clockIn', lang)}</Typography>
        <ShiftPicker lang={lang} pending={pendingClockIn} onPick={onClockIn} />
      </Box>
    );
  }

  // Compact on purpose: status, timer and punch buttons, so Today's list gets the room.
  return (
    <Box sx={{ ...cardSx, pt: 1.5, pb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}>
        <Box
          sx={{
            width: 10,
            height: 10,
            flexShrink: 0,
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
            flex: '1 0 auto',
          }}
        >
          {t(onBreak ? 'onBreak' : 'onTheClock', lang)}
        </Typography>
        <ShiftChip code={entry.shift} label={entry.shift_label} lang={lang} />
        <Button size="small" onClick={(e) => setShiftEl(e.currentTarget)} sx={{ minWidth: 0, px: 1 }}>
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
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mt: 0.5, flexWrap: 'wrap' }}>
        <Typography
          sx={{
            fontSize: 36,
            fontWeight: 900,
            lineHeight: 1.05,
            fontVariantNumeric: 'tabular-nums',
            color: onBreak ? dutyColors.amberInk : dutyColors.ink,
          }}
        >
          {formatElapsed(elapsed)}
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>
          {t('clockedInAt', lang)} {format(parseISO(entry.clock_in), 'h:mm a')}
          {onBreak && entry.break_started_at
            ? ` · ${t('breakSince', lang)} ${format(parseISO(entry.break_started_at), 'h:mm a')}`
            : ''}
        </Typography>
      </Box>
      {actions ? <Box sx={{ mt: 1.25 }}>{actions}</Box> : null}
      {shiftNote ? (
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: shiftNote.color, mt: 1 }}>
          {shiftNote.text}
        </Typography>
      ) : null}
    </Box>
  );
}
