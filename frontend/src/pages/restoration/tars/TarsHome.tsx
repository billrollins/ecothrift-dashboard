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
import type { RestorationJobDTO, RestorationScoreboardDTO } from '../../../types/inventory.types';
import { RestorationQueue } from '../queue/RestorationQueue';
import { TarsHoldingRail } from './TarsHoldingRail';
import { TarsScoreboard } from './TarsScoreboard';
import { studio } from './studio/tarsStudioTheme';

export function TarsHome({
  board,
  queueJobs,
  holdingJobs,
  busy,
  onStart,
  onResume,
}: {
  board: RestorationScoreboardDTO | undefined;
  queueJobs: RestorationJobDTO[];
  holdingJobs: RestorationJobDTO[];
  busy?: boolean;
  onStart: (job: RestorationJobDTO) => void;
  onResume: (job: RestorationJobDTO) => void;
}) {
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
              busy={busy}
              onStart={onStart}
              emptyMessage="Nothing is waiting for restoration."
            />
          </Stack>

          <Stack spacing={0.85} sx={{ minWidth: 0 }}>
            <RailLabel text="Holding" count={holdingJobs.length} />
            <TarsHoldingRail jobs={holdingJobs} busy={busy} onResume={onResume} />
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

function RailLabel({ text, count }: { text: string; count: number }) {
  return (
    <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ px: 0.25 }}>
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: 0.7, color: '#64748b' }}>
        {text.toUpperCase()}
      </Typography>
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 900, color: studio.accentDark }}>
        {count}
      </Typography>
    </Stack>
  );
}
