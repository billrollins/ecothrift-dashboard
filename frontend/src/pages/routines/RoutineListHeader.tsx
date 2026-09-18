import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <RoutineViewToggle view={view} onChange={onView} />
        </Box>
        {view === 'mine' ? (
          <Button size="small" onClick={() => navigate('/routines/qa')}>
            My QA
          </Button>
        ) : null}
      </Box>
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
