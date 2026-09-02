import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { GradeLetter } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { letterTone } from './gradeWeek';

const LETTER_FILL: Record<string, { bg: string; ink: string }> = {
  green: { bg: dutyColors.brandSoft, ink: dutyColors.brandDark },
  amber: { bg: '#FDF3DC', ink: dutyColors.amberInk },
  red: { bg: '#FBE9E6', ink: dutyColors.red },
  plain: { bg: dutyColors.ink08, ink: dutyColors.ink40 },
};

/**
 * The letter itself, big enough to read across a room. A day with nothing to
 * grade shows a dash in the same box rather than an empty one, so the strip
 * keeps its rhythm.
 */
export function LetterChip({
  letter,
  size = 'md',
}: {
  letter: GradeLetter | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const fill = LETTER_FILL[letterTone(letter)];
  const box = size === 'lg' ? 54 : size === 'md' ? 38 : 28;
  return (
    <Box
      sx={{
        width: box,
        height: box,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '11px',
        bgcolor: fill.bg,
        color: fill.ink,
        fontSize: box * 0.5,
        fontWeight: 800,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {letter ?? '-'}
    </Box>
  );
}

export function GradeBand({ title, hint }: { title: string; hint: string }) {
  return (
    <Box sx={{ px: 2.5, pt: 2.25, pb: 0.75 }}>
      <Typography
        sx={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: dutyColors.ink40,
        }}
      >
        {title}
      </Typography>
      <Typography noWrap sx={{ fontSize: 12.5, color: dutyColors.ink60, minHeight: 18 }}>
        {hint}
      </Typography>
    </Box>
  );
}

export function GradeCard({
  children,
  tone = 'plain',
}: {
  children: ReactNode;
  tone?: 'plain' | 'warn' | 'good';
}) {
  const border = tone === 'warn'
    ? dutyColors.amberBg
    : tone === 'good' ? dutyColors.brand : dutyColors.ink08;
  return (
    <Box
      sx={{
        mx: 2.5,
        mb: 1,
        px: 1.75,
        py: 1.5,
        borderRadius: '12px',
        bgcolor: dutyColors.card,
        border: `1px solid ${border}`,
      }}
    >
      {children}
    </Box>
  );
}

/** A number with its name under it, for the row of week figures. */
export function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography noWrap sx={{ fontSize: 17, fontWeight: 750, color: dutyColors.ink, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      <Typography noWrap sx={{ fontSize: 11, color: dutyColors.ink40 }}>
        {label}
      </Typography>
    </Box>
  );
}

/** Nothing-to-show copy that occupies the same room as the rows it replaces. */
export function GradeEmpty({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ px: 2.5, fontSize: 12.5, color: dutyColors.ink40, minHeight: 40, pt: 0.5 }}>
      {children}
    </Typography>
  );
}
