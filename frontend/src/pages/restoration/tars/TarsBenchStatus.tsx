/**
 * What is on the bench: what it is, what it came with, what it needs bought.
 *
 * Everything here is about the item as a whole, which is why it sits apart from
 * the grade list — that answers "which grade is worth chasing", this answers
 * "what am I holding".
 *
 * Two things used to live here and no longer do. Where the item stands is now a
 * mark on the grade it stands at, because saying it twice in two places invited
 * them to disagree. The ways it can leave are in the header, where the controls
 * that end a session are all together.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { studio } from './studio/tarsStudioTheme';
import { formatDuration } from './tarsActions';
import { fmtUsd } from './tarsProfit';

export function TarsBenchStatus({
  job,
  busy,
  partsCount,
  partsCost,
  onParts,
}: {
  job: RestorationJobDTO;
  busy?: boolean;
  partsCount: number;
  /** What those parts come to, at actual price where known and estimate otherwise. */
  partsCost: number;
  onParts: () => void;
}) {
  const note = job.queue_note?.trim();
  const sku = job.items[0]?.sku ?? job.sku ?? `Job ${job.id}`;
  const detail = [job.brand, job.category].filter(Boolean).join(' · ');

  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      <Panel>
        <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.78rem', color: studio.accentDark }}>
          {sku}
        </Typography>
        <Typography sx={{ fontWeight: 900, fontSize: '1.05rem', color: '#0f172a', lineHeight: 1.25 }}>
          {job.name}
        </Typography>
        {detail ? (
          <Typography sx={{ fontSize: '0.73rem', color: '#8593a5', mt: 0.15 }}>{detail}</Typography>
        ) : null}

        <Stack direction="row" spacing={1.5} sx={{ mt: 0.85 }}>
          <Stat label="RETAIL" value={job.retail ? fmtUsd(Number(job.retail)) : '—'} />
          <Stat label="ON ITEM" value={formatDuration(job.look_seconds ?? 0)} />
          <Stat label="ON GRADES" value={formatDuration(job.work_seconds ?? 0)} />
        </Stack>

        {note ? (
          <Box
            sx={{
              mt: 0.85,
              px: 0.85,
              py: 0.6,
              borderRadius: `${studio.radius.sm}px`,
              bgcolor: '#f8fafc',
              border: '1px solid #eef2f6',
            }}
          >
            <Typography sx={{ fontSize: '0.76rem', color: '#475569', lineHeight: 1.4 }}>{note}</Typography>
          </Box>
        ) : null}
      </Panel>

      <Panel>
        {/*
          A count on its own does not tell you whether to look: three washers
          and three mainboards are the same number and a very different
          decision. The money is what changes what you do, so it comes along.
        */}
        <Button
          fullWidth
          size="small"
          variant="outlined"
          disabled={busy}
          onClick={onParts}
          sx={{ ...secondaryButton, justifyContent: 'space-between' }}
        >
          Parts list
          <Box
            component="span"
            sx={{
              px: 0.7,
              borderRadius: '999px',
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              fontWeight: 900,
              bgcolor: partsCount > 0 ? studio.accentSoft : '#f1f5f9',
              color: partsCount > 0 ? studio.accentDark : '#94a3b8',
            }}
          >
            {partsCount === 0 ? 'none' : `${partsCount} · ${fmtUsd(partsCost)}`}
          </Box>
        </Button>
      </Panel>
    </Stack>
  );
}

const secondaryButton = {
  textTransform: 'none' as const,
  fontWeight: 800,
  fontSize: '0.78rem',
  borderColor: studio.panelBorder,
  color: '#334155',
  '&:hover': { borderColor: studio.accent, bgcolor: studio.accentSoft },
};

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        px: 1.25,
        py: 1,
        borderRadius: `${studio.radius.lg}px`,
        bgcolor: studio.panel,
        border: `1px solid ${studio.panelBorder}`,
        boxShadow: studio.panelShadow,
      }}
    >
      {children}
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0}>
      <Typography sx={{ fontSize: '0.56rem', fontWeight: 900, letterSpacing: 0.4, color: '#94a3b8' }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.86rem', fontWeight: 900, color: '#334155' }}>
        {value}
      </Typography>
    </Stack>
  );
}
