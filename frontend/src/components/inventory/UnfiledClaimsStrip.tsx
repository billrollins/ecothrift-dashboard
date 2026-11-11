/**
 * The count-down (Dash Updates #88): trucks with a claim worth filing that nobody has filed, soonest due first.
 * Shown on the Orders list. A click opens that truck's Close the truck step. Nothing shows when there are none.
 */
import { Box, Chip, Typography } from '@mui/material';
import { useUnfiledClaims } from '../../hooks/useTruckClose';
import { dueWords, wholeDollars } from '../../pages/inventory/truck/closeTruckDisplay';
import { useObjectModal } from '../objects/ObjectModal';

export function UnfiledClaimsStrip() {
  const { data } = useUnfiledClaims();
  const { openObject } = useObjectModal();
  if (!data || data.length === 0) return null;
  return (
    <Box
      role="status"
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5, px: 1.5, py: 0.75,
        border: 1, borderColor: 'warning.light', borderRadius: 1.5, bgcolor: '#fff8e1',
      }}
    >
      <Typography sx={{ fontSize: 13, fontWeight: 800 }}>
        {data.length === 1 ? '1 truck claim is not filed' : `${data.length} truck claims are not filed`}
      </Typography>
      {data.map((c) => {
        const due = dueWords(c.days_left);
        return (
          <Chip
            key={c.order_id}
            size="small"
            clickable
            color={due.tone === 'error' ? 'error' : 'warning'}
            variant="outlined"
            label={`${c.order_number}: ${wholeDollars(c.worth)}, ${due.text}`}
            onClick={() => openObject({ type: 'close-truck', id: c.order_id })}
            sx={{ bgcolor: 'background.paper', fontWeight: 600 }}
          />
        );
      })}
    </Box>
  );
}
