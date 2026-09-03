import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { FloorNav } from './FloorNav';

export const FLOOR_BAND_HEIGHT = 60;

/**
 * One compact row shared by every desk floor page: title (and an optional
 * subtitle or chips) on the left, the same FloorNav on the right.
 */
export function FloorPageBand({
  title,
  subtitle,
  chips,
}: {
  title: string;
  subtitle?: string;
  chips?: ReactNode;
}) {
  return (
    <Box
      sx={{
        flex: '0 0 auto',
        height: FLOOR_BAND_HEIGHT,
        px: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 3,
        background: 'linear-gradient(160deg, #3d8b40 0%, #2e7d32 58%, #1b5e20 100%)',
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
        <Typography
          component="h1"
          noWrap
          sx={{
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: '-0.015em',
            lineHeight: 1.2,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {title}
        </Typography>
        {subtitle ? (
          <Typography noWrap sx={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', minWidth: 0 }}>
            {subtitle}
          </Typography>
        ) : null}
        {chips ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, minHeight: 24 }}>
            {chips}
          </Box>
        ) : null}
      </Box>
      <FloorNav />
    </Box>
  );
}
