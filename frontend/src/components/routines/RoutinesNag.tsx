import AssignmentLate from '@mui/icons-material/AssignmentLate';
import { Badge, Box, Drawer, IconButton, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMyRoutineRuns } from '../../hooks/useRoutines';
import { runsAtLeast, runUrgency } from '../../pages/routines/runIsDue';
import { runDeadlineLabel } from '../../pages/routines/runDeadline';
import { StatusTag } from '../duty/StatusTag';
import { TaskCard } from '../duty/TaskCard';
import { dutyColors } from '../duty/tokens';

export function RoutinesNag() {
  const { data } = useMyRoutineRuns();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // The app bar is the hard nag only. Soft-nag runs already carry a badge on
  // the Routines link, and clock-out runs are confronted at the time clock.
  const waiting = runsAtLeast(data?.open, 'hard');
  const blocking = waiting.filter((row) => row.is_blocking);
  const count = waiting.length;

  return (
    <>
      <Box sx={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {count > 0 ? (
          <IconButton
            aria-label={`${count} routines waiting`}
            onClick={() => setOpen(true)}
            sx={{ width: 44, height: 44, color: blocking.length ? dutyColors.violet : dutyColors.ink }}
          >
            <Badge badgeContent={count} color="error">
              <AssignmentLate />
            </Badge>
          </IconButton>
        ) : null}
      </Box>
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 360, p: 2 }}>
          <Typography fontWeight={700} sx={{ mb: 1 }}>Routines waiting</Typography>
          {waiting.map((row) => {
            const late = runUrgency(row) === 'late';
            return (
              <TaskCard
                key={row.id}
                title={row.title}
                meta={runDeadlineLabel(row)}
                overdue={late}
                tags={(
                  <>
                    {late ? <StatusTag small label="Late" tone="red" /> : null}
                    {row.is_blocking ? <StatusTag small label="Blocking" tone="violet" /> : null}
                  </>
                )}
                onClick={() => {
                  setOpen(false);
                  navigate(row.href);
                }}
              />
            );
          })}
        </Box>
      </Drawer>
    </>
  );
}
