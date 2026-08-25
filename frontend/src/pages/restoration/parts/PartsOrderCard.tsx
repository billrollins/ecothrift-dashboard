import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { RestorationPartsOrderDTO } from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';
import { moneyNumber } from '../tars/tarsPartsOrders';
import { fmtUsd } from '../tars/tarsProfit';
import {
  attentionRibbon,
  partsOwnerAction,
  timingLine,
  type PartsLaneId,
} from './partsBoard';
import { ACTION_SLOT, CARD_HEIGHT, DANGER_ACTION, DANGER_GHOST, GHOST_ACTION, PRIMARY_ACTION, WARN_ACTION, cardAccent } from './partsChrome';

export function PartsOrderCard({
  order,
  lane,
  canAct,
  busy,
  onOpen,
  onAccept,
  onDeny,
  onMarkOrdered,
  onMarkDelivered,
  onReviseEta,
  onCancel,
  onKeep,
  onReview,
}: {
  order: RestorationPartsOrderDTO;
  lane: PartsLaneId;
  canAct: boolean;
  busy: boolean;
  onOpen: () => void;
  onAccept: () => void;
  onDeny: () => void;
  onMarkOrdered: () => void;
  onMarkDelivered: () => void;
  onReviseEta: () => void;
  onCancel: () => void;
  onKeep: () => void;
  onReview: () => void;
}) {
  const action = partsOwnerAction(order);
  const accent = cardAccent(order.attention, lane);
  const exception = order.attention === 'cancel_ask' || order.attention === 'late' || order.attention === 'review';
  const sku = order.job_sku || `Job ${order.job}`;
  const timing = timingLine(order);

  return (
    <Box
      component="article"
      onClick={onOpen}
      sx={{
        height: CARD_HEIGHT,
        minHeight: CARD_HEIGHT,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        px: 1.1,
        py: 0.85,
        borderRadius: `${studio.radius.md}px`,
        border: `1px solid ${exception ? accent : studio.rule}`,
        borderLeft: `3px solid ${accent}`,
        bgcolor: studio.panel,
        cursor: 'pointer',
        boxShadow: exception ? `0 0 0 1px ${accent}33` : 'none',
        '&:hover': { borderColor: exception ? accent : studio.panelBorder },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 0.75, minHeight: 18 }}>
        <Typography noWrap title={sku} sx={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: 0.2, color: studio.inkMuted }}>
          {sku}
        </Typography>
        <Typography
          sx={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontWeight: 800,
            fontSize: '0.95rem',
            fontVariantNumeric: 'tabular-nums',
            color: studio.ink,
            flexShrink: 0,
          }}
        >
          {fmtUsd(moneyNumber(order.total))}
        </Typography>
      </Box>
      <Typography
        noWrap
        title={order.job_name || order.name}
        sx={{ fontWeight: 800, fontSize: '0.84rem', color: studio.ink, minHeight: 20, mt: 0.15 }}
      >
        {order.job_name || order.name || 'Item'}
      </Typography>
      <Typography noWrap title={`${order.name} · ${order.target_grade}`} sx={{ minHeight: 16, fontSize: '0.72rem', color: studio.inkMuted }}>
        {[order.name, order.target_grade].filter(Boolean).join(' · ') || '-'}
      </Typography>
      <Typography
        sx={{
          minHeight: 16,
          mt: 0.15,
          fontSize: '0.68rem',
          fontWeight: 800,
          letterSpacing: exception ? 0.3 : 0,
          textTransform: exception ? 'uppercase' : 'none',
          color: exception ? accent : timing ? studio.inkFaint : 'transparent',
        }}
      >
        {exception ? attentionRibbon(order.attention) : timing || '.'}
      </Typography>
      <Box
        sx={{ display: 'flex', gap: 0.6, mt: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        {canAct ? (
          <OwnerButtons
            action={action}
            busy={busy}
            onAccept={onAccept}
            onDeny={onDeny}
            onMarkOrdered={onMarkOrdered}
            onMarkDelivered={onMarkDelivered}
            onReviseEta={onReviseEta}
            onCancel={onCancel}
            onKeep={onKeep}
            onReview={onReview}
          />
        ) : (
          <>
            <Box sx={ACTION_SLOT} />
            <Box sx={ACTION_SLOT} />
          </>
        )}
      </Box>
    </Box>
  );
}

function OwnerButtons({
  action,
  busy,
  onAccept,
  onDeny,
  onMarkOrdered,
  onMarkDelivered,
  onReviseEta,
  onCancel,
  onKeep,
  onReview,
}: {
  action: ReturnType<typeof partsOwnerAction>;
  busy: boolean;
  onAccept: () => void;
  onDeny: () => void;
  onMarkOrdered: () => void;
  onMarkDelivered: () => void;
  onReviseEta: () => void;
  onCancel: () => void;
  onKeep: () => void;
  onReview: () => void;
}) {
  if (action === 'accept_deny') {
    return (
      <>
        <Button size="small" variant="contained" disabled={busy} onClick={onAccept} sx={PRIMARY_ACTION}>
          Accept
        </Button>
        <Button size="small" variant="outlined" disabled={busy} onClick={onDeny} sx={DANGER_GHOST}>
          Deny
        </Button>
      </>
    );
  }
  if (action === 'order_or_cancel') {
    return (
      <>
        <Button size="small" variant="contained" disabled={busy} onClick={onMarkOrdered} sx={PRIMARY_ACTION}>
          Order
        </Button>
        <Button size="small" variant="outlined" disabled={busy} onClick={onCancel} sx={DANGER_GHOST}>
          Cancel
        </Button>
      </>
    );
  }
  if (action === 'deliver_or_revise') {
    return (
      <>
        <Button size="small" variant="contained" disabled={busy} onClick={onMarkDelivered} sx={PRIMARY_ACTION}>
          Received
        </Button>
        <Button size="small" variant="outlined" disabled={busy} onClick={onReviseEta} sx={GHOST_ACTION}>
          ETA
        </Button>
      </>
    );
  }
  if (action === 'resolve_cancel') {
    return (
      <>
        <Button size="small" variant="contained" disabled={busy} onClick={onCancel} sx={DANGER_ACTION}>
          Cancel
        </Button>
        <Button size="small" variant="outlined" disabled={busy} onClick={onKeep} sx={GHOST_ACTION}>
          Keep
        </Button>
      </>
    );
  }
  if (action === 'review') {
    return (
      <>
        <Button size="small" variant="contained" disabled={busy} onClick={onReview} sx={WARN_ACTION}>
          Review
        </Button>
        <Box sx={ACTION_SLOT} />
      </>
    );
  }
  return (
    <>
      <Box sx={ACTION_SLOT} />
      <Box sx={ACTION_SLOT} />
    </>
  );
}
