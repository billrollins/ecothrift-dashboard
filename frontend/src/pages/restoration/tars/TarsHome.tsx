/**
 * TARS Home: what restoration earned, what is waiting, and what is parked.
 *
 * One screen, three regions, none of which move. The strip across the top is a
 * fixed height whether or not there are numbers in it; the queue holds the
 * width because its cards are read at a glance; holding sits in a rail because
 * a parked item is a decision already made.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { useCompleteRestorationJob } from '../../../hooks/useRestorationBench';
import type { RestorationJobDTO, RestorationScoreboardDTO } from '../../../types/inventory.types';
import { RestorationQueue } from '../queue/RestorationQueue';
import type { DispatchTarget } from '../queue/queueDispatch';
import { queueListAccent } from '../queue/restorationQueueModel';
import { TarsDoneDialog } from './TarsDoneDialog';
import { TarsHoldingRail } from './TarsHoldingRail';
import { TarsScoreboard } from './TarsScoreboard';
import { studio } from './studio/tarsStudioTheme';

export function TarsHome({
  board,
  queueJobs,
  holdingJobs,
  occupyingBenchJob,
  busy,
  onStart,
  onResume,
}: {
  board: RestorationScoreboardDTO | undefined;
  queueJobs: RestorationJobDTO[];
  holdingJobs: RestorationJobDTO[];
  occupyingBenchJob?: RestorationJobDTO | null;
  busy?: boolean;
  onStart: (job: RestorationJobDTO) => void;
  onResume: (job: RestorationJobDTO) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const completeJob = useCompleteRestorationJob();
  const [finishJob, setFinishJob] = useState<RestorationJobDTO | null>(null);

  function handleDispatch(job: RestorationJobDTO, target: DispatchTarget) {
    if (target === 'bench') {
      onStart(job);
      return;
    }
    if (target === 'done') {
      setFinishJob(job);
    }
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 1, md: 1.5 } }}>
      <Stack spacing={1.5}>
        {/* Reserved whether or not the scoreboard has loaded, so the queue
            below never jumps when it arrives. */}
        <Box sx={{ minHeight: 74 }}>{board ? <TarsScoreboard board={board} /> : null}</Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 264px' },
            gap: 1.5,
            alignItems: 'start',
          }}
        >
          <Stack spacing={0.85} sx={{ minWidth: 0 }}>
            <RailLabel text="Queue" count={queueJobs.length} />
            <RestorationQueue
              jobs={queueJobs}
              accent={queueListAccent('queue')}
              occupyingBenchJob={occupyingBenchJob}
              busy={busy}
              onDispatch={handleDispatch}
              emptyMessage="Nothing is waiting for restoration."
            />
          </Stack>

          <Stack spacing={0.85} sx={{ minWidth: 0 }}>
            <RailLabel text="Holding" count={holdingJobs.length} />
            <TarsHoldingRail jobs={holdingJobs} busy={busy} onResume={onResume} />
          </Stack>
        </Box>
      </Stack>

      <TarsDoneDialog
        open={finishJob != null}
        job={finishJob}
        evaluation={null}
        cannotUndo
        onClose={() => setFinishJob(null)}
        onSubmit={(payload) => {
          if (!finishJob) return;
          const id = finishJob.id;
          setFinishJob(null);
          enqueueSnackbar('Sent to Done — waiting for Processing to check it in', {
            variant: 'success',
          });
          completeJob.mutate(
            { id, payload },
            {
              onError: (err) =>
                enqueueSnackbar(err instanceof Error ? err.message : 'Could not finish that item', {
                  variant: 'error',
                }),
            },
          );
        }}
      />
    </Box>
  );
}

function RailLabel({ text, count }: { text: string; count: number }) {
  return (
    <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ px: 0.25 }}>
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: 0.7, color: studio.inkLabel }}>
        {text.toUpperCase()}
      </Typography>
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 900, color: studio.accentDark }}>
        {count}
      </Typography>
    </Stack>
  );
}
