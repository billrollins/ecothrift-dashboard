import { Box, Chip, Stack, Typography } from '@mui/material';
import {
  ecoField,
  ecoFieldStatusChipSx,
  ecoFieldSummaryCardCompleteSx,
} from '../../../../theme/deliveryTheme';
import type { DeliveryJob } from '../../../../types/pos.types';

type Props = {
  job: DeliveryJob;
  onActivate?: () => void;
};

function toneForStatus(status: string): 'ok' | 'warn' | 'bad' | 'muted' {
  if (status === 'completed') return 'ok';
  if (status === 'cancelled' || status === 'failed') return 'bad';
  if (status === 'needs_scheduling') return 'warn';
  return 'muted';
}

/** Desktop planning row - shared Delivery tokens at compact density. */
export function DeskPlanningRow({ job, onActivate }: Props) {
  const tone = toneForStatus(job.status);
  const complete = job.status === 'completed';
  const interactive = Boolean(onActivate);

  return (
    <Box
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={() => onActivate?.()}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate?.();
        }
      }}
      sx={{
        ...ecoFieldSummaryCardCompleteSx(complete, 'compact'),
        cursor: interactive ? 'pointer' : 'default',
        mb: 1,
        transition: 'filter 120ms ease, box-shadow 120ms ease',
        ...(interactive
          ? {
              '&:hover': {
                filter: 'brightness(0.985)',
                boxShadow: '0 6px 18px rgba(20,32,26,.1)',
              },
              '&:focus-visible': {
                outline: `2px solid ${ecoField.green}`,
                outlineOffset: 2,
              },
            }
          : {}),
      }}
    >
      <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={1} alignItems="baseline">
          <Typography fontWeight={800} sx={{ color: ecoField.ink }} noWrap>
            {job.customer_name}
          </Typography>
          <Typography variant="caption" fontWeight={700} sx={{ color: ecoField.muted }}>
            {job.item_count} item{job.item_count === 1 ? '' : 's'}
          </Typography>
        </Stack>
        <Typography variant="body2" noWrap sx={{ color: ecoField.muted }}>
          {job.delivery_address || job.address}
        </Typography>
        <Typography variant="caption" noWrap sx={{ color: ecoField.muted }}>
          {job.phone} · {job.items_delivered}
        </Typography>
      </Stack>
      <Chip size="small" label={job.status} sx={{ ...ecoFieldStatusChipSx(tone), fontWeight: 750 }} />
    </Box>
  );
}
