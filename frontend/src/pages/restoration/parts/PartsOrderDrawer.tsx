import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import type { RestorationPartsOrderDTO, RestorationPartsOrderLineDTO } from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';
import { moneyNumber } from '../tars/tarsPartsOrders';
import { fmtUsd } from '../tars/tarsProfit';
import { formatShortDate, timingLine } from './partsBoard';
import type { HistoryItemGroup } from './partsHistory';

function statusWord(order: RestorationPartsOrderDTO): string {
  if (order.status === 'purchased') return 'Ordered';
  return `${order.status[0].toUpperCase()}${order.status.slice(1)}`;
}

function LineRow({ line }: { line: RestorationPartsOrderLineDTO }) {
  return (
    <Box sx={{ py: 0.75, borderBottom: `1px solid ${studio.rule}`, minHeight: 44 }}>
      <Typography sx={{ fontWeight: 700, color: studio.ink }}>{line.description || 'Part'}</Typography>
      <Typography sx={{ fontSize: '0.78rem', color: studio.inkMuted, fontVariantNumeric: 'tabular-nums' }}>
        {line.qty} × {fmtUsd(moneyNumber(line.unit_cost))} · {line.category}
        {line.url ? (
          <>
            {' · '}
            <Link href={line.url} target="_blank" rel="noreferrer">
              Open link
            </Link>
          </>
        ) : null}
      </Typography>
    </Box>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minHeight: 36 }}>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: studio.inkLabel }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '0.85rem', color: studio.ink, minHeight: 20 }}>{value || '-'}</Typography>
    </Box>
  );
}

function OrderBody({ order }: { order: RestorationPartsOrderDTO }) {
  const actors = [
    order.requested_by_name && `Asked by ${order.requested_by_name}`,
    order.approved_by_name && `Accepted by ${order.approved_by_name}`,
    order.purchased_by_name && `Ordered by ${order.purchased_by_name}`,
    order.received_by_name && `Received by ${order.received_by_name}`,
  ].filter(Boolean);

  return (
    <Box>
      <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: studio.ink }}>{order.name}</Typography>
      <Typography sx={{ color: studio.inkMuted, mb: 1.5, minHeight: 20 }}>
        {statusWord(order)}
        {order.target_grade ? ` · ${order.target_grade}` : ''}
        {order.expected_delivery_on ? ` · ${formatShortDate(order.expected_delivery_on)}` : ''}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
        <Fact label="Total" value={fmtUsd(moneyNumber(order.total))} />
        <Fact label="Parts" value={fmtUsd(moneyNumber(order.parts_cost))} />
        <Fact label="Timing" value={timingLine(order)} />
        <Fact
          label="Asked"
          value={order.cancel_requested ? `Cancel: ${order.cancel_reason || 'no reason'}` : order.denied_reason}
        />
      </Box>
      {actors.length > 0 ? (
        <Typography sx={{ fontSize: '0.78rem', color: studio.inkMuted, mb: 1.5, minHeight: 20 }}>
          {actors.join(' · ')}
        </Typography>
      ) : (
        <Box sx={{ minHeight: 20, mb: 1.5 }} />
      )}
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: studio.inkLabel, mb: 0.5 }}>
        Lines
      </Typography>
      {order.lines.length === 0 ? (
        <Typography sx={{ color: studio.inkFaint, minHeight: 44 }}>No lines on this order.</Typography>
      ) : (
        order.lines.map((line) => <LineRow key={line.id} line={line} />)
      )}
    </Box>
  );
}

export function PartsOrderDrawer({
  order,
  group,
  canAct,
  onClose,
  onOpenBench,
  onCancel,
}: {
  order: RestorationPartsOrderDTO | null;
  group: HistoryItemGroup | null;
  canAct: boolean;
  onClose: () => void;
  onOpenBench: (jobId: number) => void;
  onCancel?: (order: RestorationPartsOrderDTO) => void;
}) {
  const open = order != null || group != null;
  const jobId = order?.job ?? group?.job;
  const heading = group
    ? `${group.sku} · ${group.name || 'Item'}`
    : order
      ? `${order.job_sku || `Job ${order.job}`} · ${order.job_name || 'Item'}`
      : 'Order';

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 420 },
          p: 2,
          bgcolor: studio.panel,
          borderLeft: `1.5px solid ${studio.panelBorder}`,
        },
      }}
    >
      <Typography sx={{ fontWeight: 800, mb: 0.5 }}>{heading}</Typography>
      {group ? (
        <Typography sx={{ color: studio.inkMuted, mb: 2, minHeight: 20 }}>
          {group.finished
            ? `${group.startingGrade || '-'} → ${group.finalGrade || '-'}`
            : 'Not finished'}
          {` · spent ${fmtUsd(group.spent)}`}
          {group.valueAdded != null ? ` · value added ${fmtUsd(group.valueAdded)}` : ''}
        </Typography>
      ) : (
        <Box sx={{ minHeight: 20, mb: 2 }} />
      )}
      <Box sx={{ minHeight: 36, mb: 2, display: 'flex', gap: 1 }}>
        {jobId != null ? (
          <Button size="small" variant="outlined" onClick={() => onOpenBench(jobId)}>
            Open bench
          </Button>
        ) : null}
        {canAct && order?.status === 'purchased' && !order.cancel_requested && onCancel ? (
          <Button size="small" color="error" onClick={() => onCancel(order)}>
            Cancel
          </Button>
        ) : (
          <Box sx={{ minWidth: 72, minHeight: 30 }} />
        )}
      </Box>
      {group
        ? group.orders.map((row) => (
            <Box key={row.id} sx={{ mb: 2.5, pb: 2, borderBottom: `1px solid ${studio.rule}` }}>
              <OrderBody order={row} />
            </Box>
          ))
        : order ? (
            <OrderBody order={order} />
          ) : null}
    </Drawer>
  );
}
