import { Box, Typography } from '@mui/material';
import { dutyColors } from '../../components/duty/tokens';
import { RoutineViewToggle } from './RoutineViewToggle';

export function RoutineListHeader({
  view,
  onView,
  desktop,
  error,
}: {
  view: 'mine' | 'catalog';
  onView: (view: 'mine' | 'catalog') => void;
  /** Kept for callers; the desk title now lives in the page band. */
  desktop?: boolean;
  error?: string;
}) {
  return (
    <Box
      sx={{
        flex: '0 0 auto',
        px: 2.5,
        pt: 1.5,
        pb: 1.25,
        bgcolor: dutyColors.card,
        borderBottom: `1px solid ${dutyColors.ink15}`,
      }}
    >
      <RoutineViewToggle view={view} onChange={onView} />
      <Typography
        noWrap
        sx={{
          fontSize: 12.5,
          fontWeight: error ? 600 : 400,
          color: error ? dutyColors.red : dutyColors.ink60,
          mt: 1,
          minHeight: 18,
        }}
      >
        {error || ' '}
      </Typography>
    </Box>
  );
}
