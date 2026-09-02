import AssignmentLate from '@mui/icons-material/AssignmentLate';
import { Badge, Box, Drawer, IconButton, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoutineDraft } from '../../api/routines.api';
import { useMyRoutineRuns } from '../../hooks/useRoutines';
import { runsAtLeast, runUrgency } from '../../pages/routines/runIsDue';
import { runDeadlineLabel } from '../../pages/routines/runDeadline';
import { StatusTag } from '../duty/StatusTag';
import { TaskCard } from '../duty/TaskCard';
import { dutyColors } from '../duty/tokens';

function draftMeta(draft: RoutineDraft): string {
  const when = draft.started_at ? format(parseISO(draft.started_at), 'EEE h:mma') : 'Started';
  const mode = draft.mode === 'shelf'
    ? 'Shelf check'
    : draft.mode === 'non_shelf'
      ? 'Non-shelf check'
      : 'In progress';
  const section = draft.section_name ? ` · ${draft.section_name}` : '';
  return `${mode}${section} · ${when}`;
}

export function RoutinesNag() {
  const { data } = useMyRoutineRuns();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // The app bar is the hard nag only. Soft-nag runs already carry a badge on
  // the Routines link, and clock-out runs are confronted at the time clock.
  const waiting = runsAtLeast(data?.open, 'hard');
  const drafts = data?.drafts ?? [];
  const blocking = waiting.filter((row) => row.is_blocking);
  const count = waiting.length + drafts.length;

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
          <Typography fontWeight={700} sx={{ mb: 1 }}>Routines</Typography>
          <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: dutyColors.ink40, mb: 0.75 }}>
            Waiting
          </Typography>
          {waiting.length ? waiting.map((row) => {
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
          }) : (
            <Typography sx={{ fontSize: 12.5, color: dutyColors.ink40, minHeight: 18, mb: 1 }}>
              None
            </Typography>
          )}
          <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: dutyColors.ink40, mt: 1.5, mb: 0.75 }}>
            In progress
          </Typography>
          {drafts.length ? drafts.map((draft) => (
            <TaskCard
              key={draft.id}
              title={draft.routine_title}
              meta={draftMeta(draft)}
              tags={null}
              onClick={() => {
                setOpen(false);
                navigate(draft.href);
              }}
            />
          )) : (
            <Typography sx={{ fontSize: 12.5, color: dutyColors.ink40, minHeight: 18 }}>
              None
            </Typography>
          )}
        </Box>
      </Drawer>
    </>
  );
}
