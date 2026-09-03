import { Box, useMediaQuery, useTheme } from '@mui/material';
import { dutyColors } from '../../components/duty/tokens';
import { TodayDesk } from '../../components/routines/today/TodayDesk';
import { TodayPhone } from '../../components/routines/today/TodayPhone';

export default function TodayPage() {
  const theme = useTheme();
  const isDesk = useMediaQuery(theme.breakpoints.up('md'));
  return (
    <Box sx={{ bgcolor: dutyColors.paper, minHeight: '100%' }}>
      {isDesk ? <TodayDesk /> : <TodayPhone />}
    </Box>
  );
}
