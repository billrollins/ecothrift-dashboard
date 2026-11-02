import { Box, Typography } from '@mui/material';
import { format } from 'date-fns';
import type { NagTone } from '../../../pages/routines/myWork';
import { dutyColors } from '../../duty/tokens';
import { NAG_AMBER } from '../MyWorkList';

/** Chip colour for the nag count: the same grading as the nag icon. */
export const NAG_CHIP_BG: Record<Exclude<NagTone, 'none'>, string> = { amber: NAG_AMBER, red: dutyColors.red };

/** Greeting and date. Clock state and counts live in the top bar's clock pill and bell (owner, 2026-11-02). */
export function TodayHeader({
  greeting,
  now,
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
    </Box>
  );
}
