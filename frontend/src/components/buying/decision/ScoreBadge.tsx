import { Box } from '@mui/material';

/** The truck score (Priority 1-99) in a circle: solid blue when strong, pale when middling. */
export function ScoreBadge({ score, size = 40 }: { score: number | null | undefined; size?: number }) {
  const value = score ?? 0;
  const strong = value >= 80;
  const middling = value >= 60;
  return (
    <Box
      aria-label={`Score ${value}`}
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: size * 0.4,
        fontVariantNumeric: 'tabular-nums',
        bgcolor: strong ? 'primary.main' : middling ? 'primary.light' : 'action.selected',
        color: strong || middling ? 'primary.contrastText' : 'text.primary',
      }}
    >
      {score ?? '-'}
    </Box>
  );
}
