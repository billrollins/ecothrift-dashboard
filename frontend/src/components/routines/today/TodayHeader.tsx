import { Box, Chip, Typography } from '@mui/material';
import { format } from 'date-fns';
import { t } from '../../../i18n/routines';
import type { NagTone } from '../../../pages/routines/myWork';
import { dutyColors } from '../../duty/tokens';
import { NAG_AMBER } from '../MyWorkList';

/** Chip colour for the nag count: the same grading as the nag icon. */
export const NAG_CHIP_BG: Record<Exclude<NagTone, 'none'>, string> = { amber: NAG_AMBER, red: dutyColors.red };

export function TodayHeader({
  greeting,
  now,
  clockedIn,
  onBreak,
  dueCount,
  nagCount,
  nagTone,
  lang,
}: {
  greeting: string;
  now: number;
  clockedIn: boolean;
  onBreak: boolean;
  dueCount: number;
  nagCount: number;
  nagTone: NagTone;
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
        {dueCount > 0 ? (
          <Chip
            size="small"
            label={`${dueCount} ${t('toDoLower', lang)}`}
            sx={{ fontWeight: 700 }}
          />
        ) : null}
        {nagCount > 0 && nagTone !== 'none' ? (
          <Chip
            size="small"
            label={`${nagCount} ${t(nagCount === 1 ? 'naggingOne' : 'nagging', lang)}`}
            sx={{ fontWeight: 700, bgcolor: NAG_CHIP_BG[nagTone], color: '#fff' }}
          />
        ) : null}
      </Box>
    </Box>
  );
}
