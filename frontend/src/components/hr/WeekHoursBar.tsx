import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import type { WeeklyHoursStatus } from '../../types/hr.types';
import { t } from '../../i18n/routines';
import { dutyColors } from '../duty/tokens';
import { formatHours } from '../../pages/hr/timeClockFormat';
import { eyebrowSx } from './ShiftPicker';
import { weekStatusLine } from './weekStatus';

function barColor(weekly: WeeklyHoursStatus | undefined): string {
  if (!weekly) return dutyColors.brand;
  const worked = parseFloat(weekly.hours_worked);
  const limit = parseFloat(weekly.hours_limit);
  const pct = limit > 0 ? (worked / limit) * 100 : 0;
  if (weekly.is_at_limit || weekly.is_over_limit || pct >= 100) return dutyColors.red;
  if (pct >= 90) return dutyColors.amberBg;
  return dutyColors.brand;
}

export function WeekHoursBar({
  weekly,
  lang,
  sx,
}: {
  weekly: WeeklyHoursStatus | undefined;
  lang: string;
  sx?: SxProps<Theme>;
}) {
  const worked = weekly ? formatHours(weekly.hours_worked) : '0.00';
  const limit = weekly ? formatHours(weekly.hours_limit) : '40.00';
  const pct = weekly && parseFloat(weekly.hours_limit) > 0
    ? Math.min(parseFloat(weekly.hours_worked) / parseFloat(weekly.hours_limit), 1) * 100
    : 0;
  const status = weekStatusLine(weekly, false, 0, lang);
  const color = barColor(weekly);

  return (
    <Box
      sx={[
        {
          minHeight: 128,
          bgcolor: dutyColors.card,
          border: `1px solid ${dutyColors.ink15}`,
          borderRadius: '12px',
          px: 2,
          pt: 2,
          pb: 2,
          display: 'flex',
          flexDirection: 'column',
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <Typography sx={{ ...eyebrowSx, mb: 0.75 }}>{t('thisWeek', lang)}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
        <Typography sx={{ fontSize: 28, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: dutyColors.ink }}>
          {worked}
        </Typography>
        <Typography sx={{ fontSize: 14, color: dutyColors.ink40, fontVariantNumeric: 'tabular-nums' }}>
          / {limit} h
        </Typography>
      </Box>
      <Box sx={{ mt: 1, height: 8, borderRadius: 99, bgcolor: dutyColors.ink08, overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: color, borderRadius: 99 }} />
      </Box>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: status.color, minHeight: 20, mt: 'auto', pt: 1 }}>
        {status.text}
      </Typography>
    </Box>
  );
}
