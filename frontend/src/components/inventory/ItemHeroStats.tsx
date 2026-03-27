import { Box, Grid, Stack, Typography } from '@mui/material';
import { differenceInCalendarDays, format } from 'date-fns';
import { StatusBadge } from '../common/StatusBadge';
import type { Item } from '../../types/inventory.types';

function formatCurrency(value: string | null): string {
  if (value == null) return '—';
  const n = parseFloat(value);
  return Number.isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

const cellSx = {
  height: '100%',
  minHeight: 88,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  py: 1.5,
  px: 1,
  bgcolor: 'action.hover',
};

export default function ItemHeroStats({ item }: { item: Item }) {
  const daysListed =
    item.listed_at && !item.sold_at
      ? differenceInCalendarDays(new Date(), new Date(item.listed_at))
      : item.sold_at && item.listed_at
        ? differenceInCalendarDays(new Date(item.sold_at), new Date(item.listed_at))
        : null;

  return (
    <Box
      sx={{
        mb: 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <Grid container spacing={0} columns={12} sx={{ alignItems: 'stretch' }}>
        <Grid size={{ xs: 4 }} sx={{ borderRight: 1, borderColor: 'divider' }}>
          <Box sx={{ ...cellSx, textAlign: 'center' }}>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(item.price)}
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.06}>
              LIST PRICE
            </Typography>
          </Box>
        </Grid>
        <Grid size={{ xs: 4 }} sx={{ borderRight: 1, borderColor: 'divider' }}>
          <Box sx={{ ...cellSx, gap: 0.5 }}>
            <StatusBadge status={item.status} />
            <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.06}>
              STATUS
            </Typography>
          </Box>
        </Grid>
        <Grid size={{ xs: 4 }}>
          <Box sx={{ ...cellSx, textAlign: 'center' }}>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
              {daysListed !== null ? `${daysListed}d` : '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.06}>
              DAYS LISTED
            </Typography>
          </Box>
        </Grid>
      </Grid>

      <Box
        sx={{
          borderTop: 1,
          borderColor: 'divider',
          p: 1.25,
          bgcolor: 'action.hover',
        }}
      >
        <Stack direction="row" flexWrap="wrap" sx={{ gap: { xs: 1.25, sm: 2 }, rowGap: 1.25 }}>
          <Box sx={{ minWidth: { xs: '42%', sm: 120 } }}>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Cost
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {formatCurrency(item.cost)}
            </Typography>
          </Box>
          <Box sx={{ minWidth: { xs: '42%', sm: 120 } }}>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Listed
            </Typography>
            <Typography variant="body2" fontWeight={500}>
              {item.listed_at ? format(new Date(item.listed_at), 'MMM d, yyyy') : '—'}
            </Typography>
          </Box>
          <Box sx={{ minWidth: { xs: '42%', sm: 140 } }}>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Sold
            </Typography>
            <Typography variant="body2" fontWeight={500}>
              {item.sold_at
                ? `${format(new Date(item.sold_at), 'MMM d, yyyy')} · ${formatCurrency(item.sold_for)}`
                : '—'}
            </Typography>
          </Box>
          <Box sx={{ minWidth: { xs: '42%', sm: 140 } }}>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Created
            </Typography>
            <Typography variant="body2" fontWeight={500}>
              {item.created_at ? format(new Date(item.created_at), 'MMM d, yyyy HH:mm') : '—'}
            </Typography>
          </Box>
          {item.checked_in_at && (
            <Box sx={{ minWidth: { xs: '42%', sm: 140 } }}>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                Checked in
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {format(new Date(item.checked_in_at), 'MMM d, yyyy HH:mm')}
              </Typography>
            </Box>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
