/**
 * The count-down (Dash Updates #88): trucks with a dispute worth filing that nobody has filed, soonest due first.
 * A dispute whose day has passed is not counted down; it is shown apart, plainly, as missed.
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
  const open = data.filter((c) => !(c.days_left != null && c.days_left < 0));
  const missed = data.filter((c) => c.days_left != null && c.days_left < 0);
  return (
    <Box
      role="status"
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 1.5, py: 0.5, minWidth: 0,
        flex: { xs: '1 1 100%', md: '0 1 auto' }, order: { xs: 3, md: 0 },
        border: 1, borderColor: open.length ? 'warning.light' : 'divider', borderRadius: 1.5,
        bgcolor: open.length ? '#fff8e1' : 'background.paper',
      }}
    >
      {open.length ? (
        <Typography sx={{ fontSize: 13, fontWeight: 800 }}>
          {open.length === 1 ? '1 truck dispute not filed' : `${open.length} truck disputes not filed`}
        </Typography>
      ) : null}
      {open.map((c) => {
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
            sx={{
              bgcolor: 'background.paper', fontWeight: 600, maxWidth: '100%', height: 'auto', minHeight: 24,
              '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 },
            }}
          />
        );
      })}
      {missed.length ? (
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary' }}>Dispute day passed:</Typography>
      ) : null}
      {missed.map((c) => (
        <Chip
          key={c.order_id}
          size="small"
          clickable
          variant="outlined"
          label={`${c.order_number}: ${wholeDollars(c.worth)} not filed`}
          onClick={() => openObject({ type: 'close-truck', id: c.order_id })}
          sx={{
            bgcolor: 'background.paper', maxWidth: '100%', height: 'auto', minHeight: 24,
            '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 },
          }}
        />
      ))}
    </Box>
  );
}
