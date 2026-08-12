/**
 * Items parked mid-job, as a narrow rail beside the queue.
 *
 * A holding item is a decision already made, so it needs less room than a queue
 * item: what it is, why it stopped, how long ago, and a way back. Rows are a
 * fixed height and every slot always renders.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { formatWaiting } from '../queue/restorationQueueModel';
import { studio } from './studio/tarsStudioTheme';
import { TARS_PENDING_REASON_LABELS } from './tarsWorkTypes';

/** True when the parts this item was waiting on have arrived. */
function partsAreIn(job: RestorationJobDTO): boolean {
  const pending = (job.work_session as { pending?: { partsReceived?: boolean } } | undefined)?.pending;
  return job.pending_reason === 'parts_needed' && Boolean(pending?.partsReceived);
}

function heldSince(job: RestorationJobDTO): string {
  return formatWaiting({ ...job, sent_at: job.pending_started_at, created_at: job.created_at });
}

export function TarsHoldingRail({
  jobs,
  busy,
  onResume,
}: {
  jobs: RestorationJobDTO[];
  busy?: boolean;
  onResume: (job: RestorationJobDTO) => void;
}) {
  // Parts-in first: those are the only ones that can actually move today.
  const ordered = [...jobs].sort((a, b) => Number(partsAreIn(b)) - Number(partsAreIn(a)));

  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      {ordered.length === 0 ? (
        <Box
          sx={{
            py: 3,
            px: 1.5,
            textAlign: 'center',
            borderRadius: `${studio.radius.lg}px`,
            border: `1px dashed ${studio.panelBorder}`,
            color: '#94a3b8',
          }}
        >
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>Nothing on hold.</Typography>
        </Box>
      ) : (
        ordered.map((job) => {
          const ready = partsAreIn(job);
          return (
            <Box
              key={job.id}
              role="button"
              tabIndex={busy ? -1 : 0}
              onClick={() => !busy && onResume(job)}
              onKeyDown={(e) => {
                if (!busy && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onResume(job);
                }
              }}
              sx={{
                px: 1.25,
                py: 1,
                cursor: busy ? 'default' : 'pointer',
                bgcolor: studio.panel,
                borderRadius: `${studio.radius.lg}px`,
                border: `1px solid ${ready ? studio.accentSoftBorder : studio.panelBorder}`,
                borderLeft: `4px solid ${ready ? studio.accent : '#cbd5e1'}`,
                boxShadow: studio.panelShadow,
                '&:hover': { borderColor: studio.accent },
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                <Typography
                  sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.72rem', color: studio.accentDark }}
                >
                  {job.items[0]?.sku ?? job.sku ?? `Job ${job.id}`}
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {heldSince(job)}
                </Typography>
              </Stack>

              <Typography noWrap sx={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>
                {job.name}
              </Typography>

              <Typography
                noWrap
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: ready ? 800 : 600,
                  color: ready ? studio.accentDark : '#7c8899',
                }}
              >
                {ready
                  ? 'parts in — ready to finish'
                  : job.pending_reason
                    ? TARS_PENDING_REASON_LABELS[job.pending_reason]
                    : 'on hold'}
              </Typography>
            </Box>
          );
        })
      )}
    </Stack>
  );
}
