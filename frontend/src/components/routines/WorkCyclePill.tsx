import { Box, Tooltip } from '@mui/material';
import LoopRounded from '@mui/icons-material/LoopRounded';
import { useNavigate } from 'react-router-dom';
import { useMyRoutineRuns } from '../../hooks/useRoutines';
import { dutyColors } from '../duty/tokens';

const WORK_CYCLE_KEY = 'retail.work_cycle';

/**
 * The nudge that belongs on an idle register: log a work cycle.
 *
 * Retail staff stand at this screen between customers, which is exactly the
 * time the shelf checks are supposed to happen, so the prompt lives here
 * rather than on a page nobody has open. The slot is a fixed width whether or
 * not the routine is assigned, so the cart header never moves.
 */
export function WorkCyclePill() {
  const navigate = useNavigate();
  const { data } = useMyRoutineRuns();
  const routine = (data?.on_demand ?? []).find((row) => row.system_key === WORK_CYCLE_KEY);

  return (
    <Box sx={{ width: 128, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
      {routine ? (
        <Tooltip title={routine.intro || 'Shelf check, non-shelf check, project. Log one any time.'}>
          <Box
            component="button"
            type="button"
            onClick={() => navigate(`/routines/run/new?routine=${routine.id}`)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              height: 28,
              px: 1.1,
              font: 'inherit',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              borderRadius: '999px',
              color: dutyColors.brandDark,
              bgcolor: dutyColors.brandSoft,
              border: `1px solid ${dutyColors.brand}`,
              '&:hover': { bgcolor: dutyColors.brand, color: '#fff' },
              '& svg': { fontSize: 15 },
            }}
          >
            <LoopRounded />
            Work cycle
          </Box>
        </Tooltip>
      ) : null}
    </Box>
  );
}
