import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { GradeLetter, GradeThirds, QaStatusWord } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { Figure, LetterChip } from '../routines/gradeParts';
import { qaChipColor } from './qaStatus';

export const FLAG_LABELS: Record<string, string> = {
  low_findings: 'Low findings',
  owner_followup: 'Owner follow-up',
  speed: 'Too fast',
  batch: 'Batch submit',
  pairing: 'Pairing',
  rubber_stamp: 'Rubber stamp',
};

export function thirdsLine(thirds?: GradeThirds | null) {
  if (!thirds) return '—';
  return `Spot ${thirds.owner ?? '—'} · Do ${thirds.doing ?? '—'} · Cross ${thirds.cross ?? '—'}`;
}

export function ThirdsStrip({
  letter,
  thirds,
  projected,
}: {
  letter: GradeLetter | null;
  thirds?: GradeThirds | null;
  projected?: (GradeThirds & { letter?: GradeLetter | null }) | null;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <LetterChip letter={letter} size="lg" />
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Figure label="Spot" value={thirds?.owner != null ? String(thirds.owner) : '--'} />
        <Figure label="Do" value={thirds?.doing != null ? String(thirds.doing) : '--'} />
        <Figure label="Cross" value={thirds?.cross != null ? String(thirds.cross) : '--'} />
      </Box>
      {projected ? (
        <Typography sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>
          If the rest is done: {thirdsLine(projected)}
          {projected.letter ? ` → ${projected.letter}` : ''}
        </Typography>
      ) : null}
    </Box>
  );
}

export function QaCard({
  children,
  tone = 'plain',
  id,
}: {
  children: ReactNode;
  tone?: 'plain' | 'warn' | 'good' | 'bad';
  id?: string;
}) {
  const border = tone === 'warn'
    ? dutyColors.amberBg
    : tone === 'good' ? dutyColors.brand
      : tone === 'bad' ? dutyColors.red
        : dutyColors.ink15;
  return (
    <Box
      id={id}
      sx={{
        mb: 1.5,
        px: 1.75,
        py: 2,
        borderRadius: '12px',
        bgcolor: dutyColors.card,
        border: `1px solid ${border}`,
      }}
    >
      {children}
    </Box>
  );
}

export function StatusChip({ status }: { status: QaStatusWord }) {
  const color = qaChipColor(status);
  return (
    <Box
      sx={{
        px: 0.8,
        py: 0.15,
        borderRadius: '999px',
        fontSize: 11,
        fontWeight: 700,
        bgcolor: color.bg,
        color: color.ink,
        border: color.border ? `1px solid ${color.border}` : '1px solid transparent',
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </Box>
  );
}
