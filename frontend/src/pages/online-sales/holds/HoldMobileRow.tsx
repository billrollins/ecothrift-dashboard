import ChevronRight from '@mui/icons-material/ChevronRight';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { Reservation } from '../../../api/webstore.api';
import { formatCurrency } from '../../../utils/format';
import { describeWhen, HoldStatusChip, messagesHrefForHold } from '../presentation';

type Emphasis = 'expires' | 'requested' | 'completed' | 'released';

type Props = {
  reservation: Reservation;
  onSelect: (id: number) => void;
  emphasis?: Emphasis;
  /** Show gross on completed sales. */
  showMoney?: boolean;
};

function emphasisStamp(row: Reservation, emphasis: Emphasis) {
  if (emphasis === 'expires') {
    return describeWhen(row.expires_at, new Date(), 'deadline');
  }
  if (emphasis === 'completed') {
    return describeWhen(row.completed_at, new Date(), 'happened');
  }
  if (emphasis === 'released') {
    return describeWhen(row.updated_at, new Date(), 'happened');
  }
  return describeWhen(row.created_at, new Date(), 'happened');
}

function emphasisColor(bucket: string | undefined, emphasis: Emphasis): string {
  if (emphasis !== 'expires') {
    if (bucket === 'today') return 'success.dark';
    return 'text.secondary';
  }
  if (bucket === 'expired') return 'error.main';
  if (bucket === 'today') return 'warning.dark';
  if (bucket === 'tomorrow') return 'info.dark';
  return 'text.secondary';
}

/**
 * Field-app style hold row: whole card is the hit target, status + code up
 * front, secondary line for customer / listing, trailing chevron.
 */
export default function HoldMobileRow({
  reservation,
  onSelect,
  emphasis = 'expires',
  showMoney = false,
}: Props) {
  const navigate = useNavigate();
  const stamp = emphasisStamp(reservation, emphasis);
  const code = (reservation.pickup_code || '').trim().toUpperCase();
  const unread = reservation.unread || 0;
  const messagesHref = messagesHrefForHold(reservation);
  const showMessages = Boolean(messagesHref && (reservation.has_messages || unread > 0));

  return (
    <Box
      component="button"
      type="button"
      onClick={() => onSelect(reservation.id)}
      sx={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        gap: 1.25,
        px: 1.5,
        py: 1.25,
        minHeight: 72,
        textAlign: 'left',
        border: '1.5px solid',
        borderColor: unread > 0 ? 'error.light' : 'divider',
        borderRadius: 2.5,
        bgcolor: unread > 0 ? 'action.hover' : 'background.paper',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        transition: 'transform 120ms ease, background-color 120ms ease',
        '&:active': { transform: 'scale(0.985)' },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
          {code ? (
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 0.75,
                py: 0.2,
                borderRadius: 1,
                bgcolor: 'grey.100',
                border: '1px solid',
                borderColor: 'divider',
                fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                fontSize: '0.8125rem',
                fontWeight: 800,
                letterSpacing: '0.12em',
                lineHeight: 1.3,
              }}
            >
              {code}
            </Box>
          ) : null}
          <HoldStatusChip status={reservation.status} timeline={reservation.timeline} />
          {showMessages ? (
            <Chip
              size="small"
              color={unread > 0 ? 'error' : 'default'}
              variant={unread > 0 ? 'filled' : 'outlined'}
              label={unread > 0 ? `${unread} msg` : 'Messages'}
              onClick={(e) => {
                e.stopPropagation();
                if (messagesHref) navigate(messagesHref);
              }}
              sx={{ height: 22, '& .MuiChip-label': { px: 0.75, fontWeight: 700 } }}
            />
          ) : null}
        </Stack>

        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 800, lineHeight: 1.25 }}
          noWrap
        >
          {reservation.customer_name || 'Guest'}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {reservation.listing_title}
          {reservation.quantity > 1 ? ` · qty ${reservation.quantity}` : ''}
        </Typography>

        <Stack
          direction="row"
          spacing={1}
          alignItems="baseline"
          sx={{ mt: 0.5 }}
          flexWrap="wrap"
          useFlexGap
        >
          {stamp ? (
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: emphasisColor(stamp.bucket, emphasis) }}
            >
              {emphasis === 'expires' && stamp.bucket !== 'expired'
                ? `Due ${stamp.dayLabel.toLowerCase()}`
                : stamp.dayLabel}
              {stamp.timeLabel ? ` · ${stamp.timeLabel}` : ''}
            </Typography>
          ) : null}
          {showMoney ? (
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {formatCurrency(reservation.line_total)}
            </Typography>
          ) : null}
          {emphasis === 'released' && reservation.release_reason?.trim() ? (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '100%' }}>
              {reservation.release_reason.trim()}
            </Typography>
          ) : null}
        </Stack>
      </Box>

      <ChevronRight sx={{ color: 'text.disabled', flexShrink: 0 }} />
    </Box>
  );
}
