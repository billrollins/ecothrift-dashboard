import Edit from '@mui/icons-material/Edit';
import { Box, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import type { TimeEntry } from '../../types/hr.types';
import { t } from '../../i18n/routines';
import { clockLabel } from '../../pages/routines/runDeadline';
import { formatHours } from '../../pages/hr/timeClockFormat';
import { StatusTag } from '../duty/StatusTag';
import { dutyColors } from '../duty/tokens';

export function ShiftRow({
  entry,
  onPick,
  lang,
}: {
  entry: TimeEntry;
  onPick: (entry: TimeEntry) => void;
  lang: string;
}) {
  const open = !entry.clock_out;
  const inAt = clockLabel(entry.clock_in);
  const outAt = open ? 'now' : clockLabel(entry.clock_out);
  const breakPart = `${entry.break_minutes ?? 0}m`;

  // One line per shift inside RecentShiftsList's bordered list; tap opens a time change.
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onPick(entry)}
      sx={{
        width: '100%',
        minHeight: 44,
        px: 1.25,
        py: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        border: 'none',
        borderTop: `1px solid ${dutyColors.ink08}`,
        '&:first-of-type': { borderTop: 'none' },
        bgcolor: open ? dutyColors.brandTint : 'transparent',
        textAlign: 'left',
        font: 'inherit',
        cursor: 'pointer',
        color: dutyColors.ink,
        '&:hover': { bgcolor: dutyColors.brandTint },
      }}
    >
      <Typography noWrap sx={{ width: 84, flexShrink: 0, fontSize: 13.5, fontWeight: 700, color: dutyColors.ink }}>
        {format(parseISO(entry.date), 'EEE MMM d')}
      </Typography>
      <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 12.5, color: dutyColors.ink60 }}>
        {inAt} → {outAt} · {breakPart}
      </Typography>
      {entry.status === 'flagged' ? <StatusTag small label={t('flagged', lang)} tone="red" /> : null}
      <Typography sx={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: dutyColors.ink }}>
        {open ? t('open', lang) : `${formatHours(entry.total_hours)} h`}
      </Typography>
      <Edit sx={{ fontSize: 16, color: dutyColors.ink40 }} />
    </Box>
  );
}
