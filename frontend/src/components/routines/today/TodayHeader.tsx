import { Box, Chip, Typography } from '@mui/material';
import { format } from 'date-fns';
import { t } from '../../../i18n/routines';
import { dutyColors } from '../../duty/tokens';

export function TodayHeader({
  greeting,
  now,
  clockedIn,
  onBreak,
  dueCount,
  lateCount,
  weekWarn,
  weekLine,
  lang,
}: {
  greeting: string;
  now: number;
  clockedIn: boolean;
  onBreak: boolean;
  dueCount: number;
  lateCount: number;
  weekWarn: boolean;
  weekLine: string;
  lang: string;
}) {
  return (
    <Box>
      <Typography sx={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', color: dutyColors.ink }}>
        {greeting}
      </Typography>
      <Typography sx={{ fontSize: 13, color: dutyColors.ink40, mt: 0.35 }}>
        {format(new Date(now), 'EEEE, MMMM d · h:mm a')}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1, minHeight: 28 }}>
        <Chip
          size="small"
          label={clockedIn
            ? t(onBreak ? 'onBreak' : 'onTheClock', lang)
            : t('clockedOut', lang)}
          sx={{
            fontWeight: 700,
            bgcolor: onBreak
              ? dutyColors.amberBg
              : clockedIn
                ? dutyColors.brandSoft
                : dutyColors.ink08,
            color: onBreak ? dutyColors.amberInk : dutyColors.ink,
          }}
        />
        {clockedIn ? (
          <Chip
            size="small"
            label={`${dueCount} ${t('due', lang)}`}
            sx={{ fontWeight: 700 }}
          />
        ) : null}
        {clockedIn && lateCount > 0 ? (
          <Chip
            size="small"
            label={t('late', lang)}
            sx={{ fontWeight: 700, bgcolor: dutyColors.red, color: '#fff' }}
          />
        ) : null}
        {clockedIn && weekWarn ? (
          <Chip
            size="small"
            label={weekLine}
            sx={{ fontWeight: 700, maxWidth: '100%' }}
          />
        ) : null}
      </Box>
    </Box>
  );
}
