import { Box, useMediaQuery, useTheme } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { dutyColors } from '../../components/duty/tokens';
import { TodayDesk } from '../../components/routines/today/TodayDesk';
import { TodayPhone } from '../../components/routines/today/TodayPhone';
import { hasRunner } from './todayRunner';

/** Today: the shift, today's routines (and the runner beside them), hours and pay. */
export default function TodayPage() {
  const theme = useTheme();
  const isDesk = useMediaQuery(theme.breakpoints.up('md'));
  const [params] = useSearchParams();
  // A routine on a phone fills the screen, so the page takes a fixed height instead of growing.
  const fill = !isDesk && hasRunner(params);
  return (
    <Box sx={{ bgcolor: dutyColors.paper, minHeight: '100%', height: fill ? '100%' : undefined, display: fill ? 'flex' : undefined, flexDirection: 'column' }}>
      {isDesk ? <TodayDesk /> : <TodayPhone />}
    </Box>
  );
}
