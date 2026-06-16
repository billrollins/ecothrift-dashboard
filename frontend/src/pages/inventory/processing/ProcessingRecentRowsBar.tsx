import { Box, Chip, Typography } from '@mui/material';
import type { ProcessingRecentRowEntry } from './processingRecentRows';
import { processingTokens } from './processingTokens';

export interface ProcessingRecentRowsBarProps {
  rows: ProcessingRecentRowEntry[];
  onOpenRow: (processingRowId: number) => void;
}

/** Horizontal quick links for recently opened queue rows (client-only). */
export function ProcessingRecentRowsBar({ rows, onOpenRow }: ProcessingRecentRowsBarProps) {
  if (rows.length === 0) return null;

  return (
    <Box
      sx={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1,
        py: 0.45,
        minHeight: 34,
        borderBottom: 1,
        borderColor: processingTokens.border,
        bgcolor: processingTokens.surfaceTint,
        minWidth: 0,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          flexShrink: 0,
          fontWeight: 800,
          fontSize: '0.625rem',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: processingTokens.textMute,
        }}
      >
        Recent
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          minWidth: 0,
          flex: 1,
          overflowX: 'auto',
          pb: 0.1,
          '&::-webkit-scrollbar': { height: 4 },
        }}
      >
        {rows.map((row) => (
          <Chip
            key={row.processingRowId}
            size="small"
            label={`#${row.rowNum} · ${row.title}`}
            title={`Row ${row.rowNum} · ${row.title}`}
            onClick={() => onOpenRow(row.processingRowId)}
            sx={{
              flexShrink: 0,
              maxWidth: 220,
              height: 22,
              fontSize: '0.6875rem',
              fontWeight: 700,
              '& .MuiChip-label': {
                px: 0.85,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              },
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
