import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { areaWord } from '../../pages/admin/enhancementRequestsTable';
import { AREA_PALETTE } from './requestsBoardLayout';
import type { EnhancementArea } from '../../types/enhancementRequests.types';

/**
 * The area, colour-coded. Same badge in the table, the detail header, and the
 * dropdowns, so the colour means one thing everywhere.
 */
export function AreaBadge({
  area,
  size = 'default',
}: {
  area: EnhancementArea;
  size?: 'compact' | 'default';
}) {
  const key = AREA_PALETTE[area];
  const compact = size === 'compact';
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: compact ? 0.5 : 0.75,
        height: compact ? 16 : 20,
        borderRadius: 0.75,
        fontSize: compact ? 9 : 11,
        fontWeight: 800,
        letterSpacing: 0.2,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        color: (theme) => theme.palette[key].dark,
        bgcolor: (theme) => alpha(theme.palette[key].main, 0.16),
        border: '1px solid',
        borderColor: (theme) => alpha(theme.palette[key].main, 0.45),
      }}
    >
      {areaWord(area)}
    </Box>
  );
}
