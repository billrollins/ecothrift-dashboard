import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { RestorationPartsLineInspectPayload, RestorationPartsOrderDTO } from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';
import { fmtUsd } from '../tars/tarsProfit';
import { laneTotal, type PartsLaneId } from './partsBoard';
import { CARD_HEIGHT, LANE_ACCENT, LANE_WASH } from './partsChrome';
import { PartsOrderCard } from './PartsOrderCard';
import { PartsReceiveInspectForm } from './PartsReceiveInspectForm';

export function PartsLane({
  lane,
  label,
  orders,
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
  onInspect,
}: {
  lane: PartsLaneId;
  label: string;
  orders: RestorationPartsOrderDTO[];
  canAct: boolean;
  busy: boolean;
  onOpen: (order: RestorationPartsOrderDTO) => void;
  onAccept: (order: RestorationPartsOrderDTO) => void;
  onDeny: (order: RestorationPartsOrderDTO) => void;
  onMarkOrdered: (order: RestorationPartsOrderDTO) => void;
  onMarkDelivered: (order: RestorationPartsOrderDTO) => void;
  onReviseEta: (order: RestorationPartsOrderDTO) => void;
  onCancel: (order: RestorationPartsOrderDTO) => void;
  onKeep: (order: RestorationPartsOrderDTO) => void;
  onInspect: (order: RestorationPartsOrderDTO, lines: RestorationPartsLineInspectPayload[]) => void;
}) {
  const accent = LANE_ACCENT[lane];
  const total = laneTotal(orders);

  return (
    <Box
      sx={{
        minWidth: 200,
        minHeight: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${studio.panelBorder}`,
        borderRadius: `${studio.radius.lg}px`,
        bgcolor: studio.panel,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: 1.15,
          minHeight: 40,
          bgcolor: LANE_WASH[lane],
          borderBottom: `1px solid ${studio.rule}`,
          borderTop: `3px solid ${accent}`,
        }}
      >
        <Typography
          sx={{
            fontSize: '0.66rem',
            fontWeight: 800,
            letterSpacing: 0.7,
            textTransform: 'uppercase',
            color: accent,
          }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: '0.78rem',
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            color: orders.length ? studio.ink : studio.inkFaint,
          }}
        >
          {orders.length} · {fmtUsd(total)}
        </Typography>
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          p: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.85,
          bgcolor: LANE_WASH[lane],
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': { bgcolor: studio.rule, borderRadius: 3 },
        }}
      >
        {orders.length === 0 ? (
          <Box
            aria-hidden
            sx={{
              height: CARD_HEIGHT,
              minHeight: CARD_HEIGHT,
              border: `1px dashed ${studio.rule}`,
              borderRadius: `${studio.radius.md}px`,
              bgcolor: 'transparent',
            }}
          />
        ) : (
          orders.map((order) =>
            lane === 'received' ? (
              <PartsReceiveInspectForm
                key={order.id}
                order={order}
                canSubmit={canAct}
                busy={busy}
                onSubmit={(lines) => onInspect(order, lines)}
              />
            ) : (
              <PartsOrderCard
                key={order.id}
                order={order}
                lane={lane}
                canAct={canAct}
                busy={busy}
                onOpen={() => onOpen(order)}
                onAccept={() => onAccept(order)}
                onDeny={() => onDeny(order)}
                onMarkOrdered={() => onMarkOrdered(order)}
                onMarkDelivered={() => onMarkDelivered(order)}
                onReviseEta={() => onReviseEta(order)}
                onCancel={() => onCancel(order)}
                onKeep={() => onKeep(order)}
                onReview={() => undefined}
              />
            ),
          )
        )}
      </Box>
    </Box>
  );
}
