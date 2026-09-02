import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { RoutineRun } from '../../api/routines.api';
import { runDeadlineLabel } from '../../pages/routines/runDeadline';
import { runUrgency } from '../../pages/routines/runIsDue';
import { StatusTag } from '../duty/StatusTag';
import { dutyColors } from '../duty/tokens';

/**
 * The last word before someone walks out. Clock-out routines have no app-bar
 * nag by design, so this is where they are finally raised. It warns and never
 * blocks: a shift can end for reasons the app knows nothing about.
 */
export function ClockOutRoutineGuard({
  runs,
  open,
  onClose,
  onClockOut,
  busy,
}: {
  runs: RoutineRun[];
  open: boolean;
  onClose: () => void;
  onClockOut: () => void;
  busy?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        {runs.length === 1 ? 'One routine still owed' : `${runs.length} routines still owed`}
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, color: dutyColors.ink60, mb: 1.5 }}>
          These were due before the end of your shift. Do them now if you can.
        </Typography>
        {runs.map((run) => {
          const late = runUrgency(run) === 'late';
          return (
            <Box
              key={run.id}
              component="button"
              type="button"
              onClick={() => {
                onClose();
                navigate(run.href);
              }}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 0.75,
                px: 1.5,
                py: 1.25,
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: '10px',
                border: `1px solid ${late ? dutyColors.red : dutyColors.ink15}`,
                bgcolor: dutyColors.card,
                '&:hover': { borderColor: dutyColors.brand, bgcolor: dutyColors.brandTint },
              }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontSize: 14, fontWeight: 650, color: dutyColors.ink }}>
                  {run.title}
                </Typography>
                <Typography noWrap sx={{ fontSize: 12, color: dutyColors.ink60 }}>
                  {run.section_name ? `${run.section_name} · ` : ''}{runDeadlineLabel(run)}
                </Typography>
              </Box>
              {late ? <StatusTag small label="Late" tone="red" /> : null}
            </Box>
          );
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Do them now</Button>
        <Button color="error" disabled={busy} onClick={onClockOut}>
          Clock out anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
}
