/**
 * One item waiting for a bench, sized to be read across a room.
 *
 * Fixed geometry: every slot is always rendered, empty or not, so a card never
 * changes height when a note is added or a grade is filled in. Nothing on this
 * card mounts or unmounts in response to state.
 */
import ArrowForward from '@mui/icons-material/ArrowForward';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';
import { fmtUsd } from '../tars/tarsProfit';
import {
  destinationLabel,
  formatWaiting,
  handoffSummary,
  isStale,
  missingGrades,
  valuePotential,
} from './restorationQueueModel';

const CARD_HEIGHT = 104;

export function RestorationQueueCard({
  job,
  scaleGrades,
  busy,
  onOpenDetails,
  onStart,
}: {
  job: RestorationJobDTO;
  scaleGrades: string[];
  busy?: boolean;
  onOpenDetails: (job: RestorationJobDTO) => void;
  onStart?: (job: RestorationJobDTO) => void;
}) {
  const missing = missingGrades(job, scaleGrades);
  const ready = Boolean(job.scale) && missing.length === 0;
  const potential = valuePotential(job);
  const stale = isStale(job);
  const sku = job.items[0]?.sku ?? job.sku ?? `Job ${job.id}`;
  const note = job.queue_note?.trim();
  const destination = destinationLabel(job.intended_destination);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 132px 116px' },
        alignItems: 'stretch',
        gap: 1.5,
        height: { xs: 'auto', md: CARD_HEIGHT },
        px: 1.5,
        py: 1.1,
        bgcolor: studio.panel,
        borderRadius: `${studio.radius.lg}px`,
        border: `1px solid ${ready ? studio.panelBorder : '#e3b23c'}`,
        borderLeft: `4px solid ${ready ? studio.accent : '#e3b23c'}`,
        boxShadow: studio.panelShadow,
      }}
    >
      {/* Identity and context */}
      <Stack spacing={0.15} sx={{ minWidth: 0, justifyContent: 'center' }}>
        <Stack direction="row" spacing={0.9} alignItems="baseline" sx={{ minWidth: 0 }}>
          <Typography
            sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.76rem', color: studio.accentDark }}
          >
            {sku}
          </Typography>
          <Typography noWrap sx={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', minWidth: 0 }}>
            {job.name}
          </Typography>
        </Stack>

        <Typography noWrap sx={{ fontSize: '0.72rem', color: '#7c8899' }}>
          {[job.brand, job.category, job.scale || 'no scale'].filter(Boolean).join(' · ')}
        </Typography>

        <Typography
          noWrap
          sx={{
            fontSize: '0.74rem',
            color: note ? '#334155' : '#94a3b8',
            fontStyle: note ? 'normal' : 'italic',
          }}
        >
          {note || handoffSummary(job)}
        </Typography>

        <Stack direction="row" spacing={0.6} sx={{ height: 20, alignItems: 'center' }}>
          <Tag label={destination || 'no destination'} muted={!destination} />
          <Tag
            label={ready ? 'ready' : `needs ${missing.length || 'a'} ${missing.length === 1 ? 'grade' : 'grades'}`}
            warn={!ready}
          />
        </Stack>
      </Stack>

      {/* The money on the table */}
      <Stack
        spacing={0}
        sx={{
          justifyContent: 'center',
          alignItems: { xs: 'flex-start', md: 'flex-end' },
          textAlign: { xs: 'left', md: 'right' },
        }}
      >
        <Tooltip
          arrow
          title="Best grade minus worst. What is on the table if the work goes well, against doing nothing."
        >
          <Typography
            sx={{
              fontFamily: 'monospace',
              fontWeight: 900,
              fontSize: '1.5rem',
              lineHeight: 1.1,
              color: potential == null ? '#b6c0cd' : '#0f172a',
              cursor: 'help',
            }}
          >
            {potential == null ? '—' : fmtUsd(potential)}
          </Typography>
        </Tooltip>
        <Typography sx={{ fontSize: '0.63rem', color: '#94a3b8', fontWeight: 800, letterSpacing: 0.4 }}>
          AT STAKE
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', color: '#7c8899' }}>
          retail {job.retail ? fmtUsd(Number(job.retail)) : '—'}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.7rem',
            fontWeight: 800,
            color: stale ? '#b26a00' : '#7c8899',
          }}
        >
          waiting {formatWaiting(job)}
        </Typography>
      </Stack>

      {/* Actions */}
      <Stack spacing={0.6} sx={{ justifyContent: 'center' }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => onOpenDetails(job)}
          sx={{
            textTransform: 'none',
            fontWeight: 800,
            fontSize: '0.75rem',
            borderColor: studio.panelBorder,
            color: '#334155',
          }}
        >
          Details
        </Button>
        {onStart ? (
          <Tooltip arrow title={ready ? '' : 'Add the missing grade values first'} disableHoverListener={ready}>
            <span>
              <Button
                fullWidth
                size="small"
                variant="contained"
                disabled={!ready || busy}
                endIcon={<ArrowForward sx={{ fontSize: 15 }} />}
                onClick={() => onStart(job)}
                sx={{
                  textTransform: 'none',
                  fontWeight: 900,
                  fontSize: '0.75rem',
                  bgcolor: studio.accentDark,
                  '&:hover': { bgcolor: studio.accentDark },
                }}
              >
                Bench
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </Stack>
    </Box>
  );
}

function Tag({ label, warn, muted }: { label: string; warn?: boolean; muted?: boolean }) {
  return (
    <Box
      sx={{
        px: 0.65,
        borderRadius: '4px',
        fontSize: '0.64rem',
        fontWeight: 800,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        bgcolor: warn ? '#fdf2dc' : muted ? '#f1f5f9' : studio.accentSoft,
        color: warn ? '#8a5200' : muted ? '#94a3b8' : studio.accentDark,
        border: `1px solid ${warn ? '#efd39a' : muted ? '#e2e8f0' : studio.accentSoftBorder}`,
      }}
    >
      {label}
    </Box>
  );
}
