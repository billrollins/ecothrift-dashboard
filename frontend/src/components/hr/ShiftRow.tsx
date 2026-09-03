import Edit from '@mui/icons-material/Edit';
import { Box, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import type { TimeEntry } from '../../types/hr.types';
import { t } from '../../i18n/routines';
import { clockLabel } from '../../pages/routines/runDeadline';
import { formatHours } from '../../pages/hr/timeClockFormat';
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

  return (
    <Box
      component="button"
      type="button"
      onClick={() => onPick(entry)}
      sx={{
        width: '100%',
        height: 64,
        px: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        border: `1px solid ${dutyColors.ink15}`,
        borderRadius: '12px',
        bgcolor: open ? dutyColors.brandTint : dutyColors.card,
        textAlign: 'left',
        font: 'inherit',
        cursor: 'pointer',
        color: dutyColors.ink,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 14.5, fontWeight: 700, color: dutyColors.ink }}>
          {format(parseISO(entry.date), 'EEE MMM d')}
        </Typography>
        <Typography noWrap sx={{ fontSize: 12, color: dutyColors.ink40 }}>
          {inAt} → {outAt} · {breakPart}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: dutyColors.ink }}>
        {open ? t('open', lang) : `${formatHours(entry.total_hours)} h`}
      </Typography>
      <Edit sx={{ fontSize: 18, color: dutyColors.ink40 }} />
    </Box>
  );
}
