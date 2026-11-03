/**
 * A bill or coin's name in its colour (2026-11-03, Bill: "color code the denominations or anything possible for less
 * likely mistakes"): the real note's colour, coins in metal, the label always written (never colour alone).
 */
import { Box, type SxProps, type Theme } from '@mui/material';
import { EDGES, TONES, edgeStripes, type CashKey } from '../../utils/cashCounts';

export default function CashLabel({ k, label, sx }: { k: CashKey | string; label: string; sx?: SxProps<Theme> }) {
  const tone = TONES[k as CashKey];
  if (!tone) return <Box component="span" sx={{ fontWeight: 800, ...sx }}>{label}</Box>;
  const ridges = edgeStripes(EDGES[k as CashKey]);
  return (
    <Box
      component="span"
      data-tone={k}
      sx={{
        display: 'inline-block', px: 1, py: 0.25, borderRadius: 1, fontWeight: 800, lineHeight: 1.3,
        bgcolor: tone.bg, color: tone.fg, whiteSpace: 'nowrap',
        // The coin's ridges (quarter wide, dime fine) along the top edge.
        ...(ridges && { backgroundImage: ridges, backgroundSize: '100% 4px', backgroundRepeat: 'no-repeat' }),
        ...sx,
      }}
    >
      {label}
    </Box>
  );
}
