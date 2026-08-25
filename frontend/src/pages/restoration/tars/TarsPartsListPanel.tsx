import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNew from '@mui/icons-material/OpenInNew';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import type {
  RestorationPartCategory,
  RestorationPartDTO,
  RestorationPartsLineInspectPayload,
  RestorationPartsOrderDTO,
  RestorationPartsOrderWritePayload,
} from '../../../types/inventory.types';
import { PartsReceiveInspectForm } from '../parts/PartsReceiveInspectForm';
import { orderNeedsInspect } from '../parts/partsReceiveInspect';
import { TarsPartsOrderDialog } from './TarsPartsOrderDialog';
import type { TarsBenchPlan } from './tarsBenchPlan';
import { parseMoney, parseQty } from './tarsMoney';
import { tarsPaneCardSx, tarsPaneScrollSx } from './tarsPaneScroll';
import {
  isInactiveDraftOrder,
  isLivePartsOrder,
  moneyNumber,
  orderNetValue,
  partsOrderStatusWord,
  requestIntent,
  sortOrdersForDesk,
  summarizePartsList,
} from './tarsPartsOrders';
import { fmtUsd } from './tarsProfit';
import { BenchPaneHeader } from './studio/BenchPaneHeader';
import { PANEL, RADIUS, SP, TYPE } from './studio/benchScale';
import { studio } from './studio/tarsStudioTheme';
import { PURCHASE_SECTION_LABELS, PURCHASE_SECTIONS } from './tarsPurchase';
import { absoluteUrl } from './tarsUrl';

const LINE_HEIGHT = 56;
const ORDER_TILE_HEIGHT = 56;
const ACTION_W = 80;
const ACTION_H = 22;
const ACTION_SLOT = {
  boxSizing: 'border-box',
  height: ACTION_H,
  minHeight: ACTION_H,
  maxHeight: ACTION_H,
  width: ACTION_W,
  minWidth: ACTION_W,
} as const;
const actionBtnSx = {
  ...ACTION_SLOT,
  px: 0,
  py: 0,
  fontSize: 10,
  fontWeight: 800,
  lineHeight: 1,
  letterSpacing: '0.02em',
  textTransform: 'none',
  boxShadow: 'none',
  borderRadius: `${RADIUS.sm}px`,
  '&.MuiButton-root': {
    minHeight: ACTION_H,
    height: ACTION_H,
    maxHeight: ACTION_H,
    minWidth: ACTION_W,
    width: ACTION_W,
    padding: 0,
    boxShadow: 'none',
  },
  '&:hover': { boxShadow: 'none' },
} as const;
const SECTION_SHORT: Record<RestorationPartCategory, string> = {
  parts: 'Parts',
  supplies: 'Supp.',
  ffe: 'FFE',
};
const mono = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontVariantNumeric: 'tabular-nums',
} as const;

export const PARTS_PANE_KICKER = 'PARTS';
export const ORDERS_PANE_KICKER = 'ORDERS';

interface SharedDeskProps {
  jobId: number | null;
  parts: RestorationPartDTO[];
  orders: RestorationPartsOrderDTO[];
  readOnly?: boolean;
  gradeOptions?: string[];
  currentGrade?: string;
  gradeValues?: Record<string, number>;
  plan?: TarsBenchPlan;
  busy?: boolean;
  onCreatePart?: () => void;
  onUpdatePart?: (id: number, patch: Partial<Pick<RestorationPartDTO, 'description' | 'url' | 'qty' | 'unit_price' | 'category'>>) => void;
  onDeletePart?: (id: number) => void;
  onSaveOrder?: (payload: RestorationPartsOrderWritePayload, existingId?: number) => void;
  onCancelOrder?: (id: number) => void;
  onRequestOrder?: (order: RestorationPartsOrderDTO) => void;
  onWithdrawOrder?: (id: number) => void;
  onRequestCancel?: (blockingId: number, replacementId?: number) => void;
  onReceiveOrder?: (order: RestorationPartsOrderDTO) => void;
  onInspectOrder?: (order: RestorationPartsOrderDTO, lines: RestorationPartsLineInspectPayload[]) => void;
  onDropQueue?: (id: number) => void;
}

export function TarsPurchaseDesk(props: SharedDeskProps) {
  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
        gap: 0.6,
      }}
    >
      <TarsPartsLinesPane {...props} />
      <TarsPartsOrdersPane {...props} />
    </Box>
  );
}

function NoneYet() {
  return (
    <Typography
      sx={{
        ...TYPE.body,
        height: LINE_HEIGHT,
        minHeight: LINE_HEIGHT,
        px: 0.85,
        color: PANEL.faint,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      None yet
    </Typography>
  );
}

function PartLineRow({
  part,
  readOnly,
  onChange,
  onRemove,
}: {
  part: RestorationPartDTO;
  readOnly: boolean;
  onChange: (patch: Partial<Pick<RestorationPartDTO, 'description' | 'url' | 'qty' | 'unit_price' | 'category'>>) => void;
  onRemove: () => void;
}) {
  const [description, setDescription] = useState(part.description);
  const [url, setUrl] = useState(part.url);
  const [qty, setQty] = useState(String(part.qty));
  const [price, setPrice] = useState(part.unit_price === '0.00' ? '' : String(moneyNumber(part.unit_price)));
  const [linkEl, setLinkEl] = useState<HTMLElement | null>(null);

  function commitUrl(next: string) {
    if (next !== part.url) onChange({ url: next });
  }

  return (
    <Box
      sx={{
        height: LINE_HEIGHT,
        minHeight: LINE_HEIGHT,
        display: 'grid',
        gridTemplateColumns: '88px minmax(0, 1fr) 28px',
        gridTemplateRows: '26px 24px',
        columnGap: 0.45,
        rowGap: 0.25,
        alignItems: 'center',
        px: 0.55,
        py: 0.25,
        borderBottom: '1px solid #e8eee9',
        bgcolor: '#fff',
      }}
    >
      <TextField
        select
        size="small"
        value={part.category}
        onChange={(e) => onChange({ category: e.target.value as RestorationPartCategory })}
        disabled={readOnly}
        slotProps={{ input: { sx: { fontSize: 11, py: 0.15, fontWeight: 800 } } }}
        inputProps={{ 'aria-label': 'Category' }}
        sx={{ '& .MuiInputBase-root': { height: 26 } }}
      >
        {PURCHASE_SECTIONS.map((section) => (
          <MenuItem key={section} value={section} sx={{ fontSize: 12 }}>
            {SECTION_SHORT[section]}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => {
          if (description !== part.description) onChange({ description });
        }}
        disabled={readOnly}
        slotProps={{ input: { sx: { fontSize: 12, py: 0.15 } } }}
        sx={{ '& .MuiInputBase-root': { height: 26 } }}
      />
      {!readOnly ? (
        <IconButton size="small" aria-label="Remove part" onClick={onRemove} sx={{ p: 0.2 }}>
          <Delete sx={{ fontSize: 15 }} />
        </IconButton>
      ) : (
        <Box sx={{ width: 28, height: 26 }} />
      )}

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="center"
        sx={{ width: 88, minHeight: 24, gap: url.trim() ? 1.5 : 0 }}
      >
        <IconButton
          size="small"
          aria-label={url.trim() ? 'Edit part link' : 'Add part link'}
          onClick={(e) => setLinkEl(e.currentTarget)}
          disabled={readOnly}
          sx={{
            p: 0.5,
            minWidth: 32,
            minHeight: 32,
            color: url.trim() ? studio.accentDark : '#94a3b8',
          }}
        >
          <LinkIcon sx={{ fontSize: 15 }} />
        </IconButton>
        {url.trim() ? (
          <IconButton
            size="small"
            aria-label="Open part link"
            href={absoluteUrl(url)}
            target="_blank"
            rel="noopener noreferrer"
            component="a"
            sx={{ p: 0.5, minWidth: 32, minHeight: 32, color: studio.accentDark }}
          >
            <OpenInNew sx={{ fontSize: 15 }} />
          </IconButton>
        ) : null}
      </Stack>
      <Stack direction="row" alignItems="center" spacing={0.4} sx={{ minWidth: 0 }}>
        <TextField
          size="small"
          placeholder="Qty"
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => {
            const next = parseQty(qty);
            if (next !== part.qty) onChange({ qty: next });
          }}
          disabled={readOnly}
          slotProps={{ htmlInput: { min: 1, max: 999 }, input: { sx: { fontSize: 12, py: 0.1 } } }}
          sx={{ width: 56, '& .MuiInputBase-root': { height: 24 } }}
        />
        <TextField
          size="small"
          placeholder="Price"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => {
            const next = parseMoney(price);
            if (next !== moneyNumber(part.unit_price)) onChange({ unit_price: String(next) });
          }}
          disabled={readOnly}
          slotProps={{
            htmlInput: { min: 0, step: 0.01 },
            input: {
              sx: { fontSize: 12, py: 0.1 },
              startAdornment: <InputAdornment position="start" sx={{ mr: 0.25 }}>$</InputAdornment>,
            },
          }}
          sx={{ width: 108, '& .MuiInputBase-root': { height: 24 } }}
        />
        <Typography fontWeight={800} textAlign="right" sx={{ flex: 1, fontSize: 12, pr: 0.25, ...mono }}>
          {fmtUsd(moneyNumber(part.line_total))}
        </Typography>
      </Stack>
      <Box sx={{ width: 28 }} />

      <Popover
        open={linkEl != null}
        anchorEl={linkEl}
        onClose={() => {
          commitUrl(url);
          setLinkEl(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ p: 1, width: 280 }}>
          <TextField
            size="small"
            placeholder="URL"
            value={url}
            autoFocus
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => commitUrl(url)}
            disabled={readOnly}
            fullWidth
            slotProps={{ input: { sx: { fontSize: 13 } } }}
          />
          {url.trim() ? (
            <IconButton
              size="small"
              aria-label="Open part link"
              href={absoluteUrl(url)}
              target="_blank"
              rel="noopener noreferrer"
              component="a"
            >
              <OpenInNew sx={{ fontSize: 16 }} />
            </IconButton>
          ) : (
            <Box sx={{ width: 28, height: 28 }} />
          )}
        </Stack>
      </Popover>
    </Box>
  );
}

function orderTileTone(statusWord: string): { color: string; bgcolor: string; border: string } {
  if (statusWord === 'requested') {
    return { color: '#8a6420', bgcolor: '#faf2e2', border: '#e4d2ac' };
  }
  if (statusWord === 'approved') {
    return { color: '#1b5e20', bgcolor: '#e8f5e9', border: '#a5d6a7' };
  }
  if (statusWord === 'ordered') {
    return { color: '#1e4d7b', bgcolor: '#e3f2fd', border: '#90caf9' };
  }
  if (statusWord === 'received') {
    return { color: '#0d5c4d', bgcolor: '#d4f0e8', border: '#6fbf90' };
  }
  if (statusWord === 'queued' || statusWord === 'cancel asked') {
    return { color: studio.warning, bgcolor: '#fff8e1', border: '#ffe082' };
  }
  return { color: '#64748b', bgcolor: '#fff', border: '#e2e8f0' };
}

function OrderTile({
  order,
  orders,
  currentGrade,
  gradeValues,
  plan,
  readOnly,
  requesting,
  onEdit,
  onRequest,
  onWithdraw,
  onAskCancel,
  onAskCancelOwn,
  onReceive,
  onDropQueue,
}: {
  order: RestorationPartsOrderDTO;
  orders: RestorationPartsOrderDTO[];
  currentGrade: string;
  gradeValues: Record<string, number>;
  plan?: TarsBenchPlan;
  readOnly: boolean;
  requesting: boolean;
  onEdit: () => void;
  onRequest: () => void;
  onWithdraw: () => void;
  onAskCancel: () => void;
  onAskCancelOwn: () => void;
  onReceive: () => void;
  onDropQueue: () => void;
}) {
  const targetValue = gradeValues[order.target_grade];
  const currentValue = gradeValues[currentGrade];
  const minutes = plan?.estimates[order.target_grade]?.minutes ?? 0;
  const net = orderNetValue({
    targetValue: Number.isFinite(targetValue) ? targetValue : null,
    currentValue: Number.isFinite(currentValue) ? currentValue : null,
    laborMinutes: minutes,
    partsCost: moneyNumber(order.parts_cost),
  });
  const inactive = isInactiveDraftOrder(order, orders);
  const canRequest = order.status === 'draft' && !readOnly && !order.queued_behind && !inactive;
  const canWithdraw = order.status === 'requested' && !readOnly;
  const canAskCancelOwn = order.status === 'approved' && !readOnly && !order.cancel_requested;
  const canReceive = order.status === 'purchased' && !readOnly;
  const queued = Boolean(order.queued_behind);
  const canEdit = order.status === 'draft' && !readOnly && !inactive;
  const intent = canRequest ? requestIntent(orders, order) : { kind: 'free' as const };
  const statusWord = partsOrderStatusWord(order);
  const tone = orderTileTone(statusWord);
  const partWord = order.item_count === 1 ? '1 part' : `${order.item_count} parts`;
  const meta = [
    `To ${order.target_grade || '-'}`,
    partWord,
    `Value after ${net == null ? '-' : fmtUsd(net)}`,
    order.expected_delivery_on ? `Arrives ${order.expected_delivery_on}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const action = canRequest ? (
    <Button
      size="small"
      variant="contained"
      disabled={requesting}
      title={order.target_grade.trim() ? undefined : 'Say which grade this order would achieve.'}
      onClick={intent.kind === 'askCancel' ? onAskCancel : onRequest}
      sx={{ ...actionBtnSx, bgcolor: studio.accentDark }}
    >
      Request
    </Button>
  ) : canWithdraw ? (
    <Button size="small" color="inherit" disabled={requesting} onClick={onWithdraw} sx={actionBtnSx}>
      Cancel
    </Button>
  ) : canAskCancelOwn ? (
    <Button size="small" color="inherit" disabled={requesting} onClick={onAskCancelOwn} sx={actionBtnSx}>
      Cancel
    </Button>
  ) : canReceive ? (
    <Button size="small" variant="contained" disabled={requesting} onClick={onReceive} sx={{ ...actionBtnSx, bgcolor: studio.accentDark }}>
      Received
    </Button>
  ) : queued && !readOnly ? (
    <Button size="small" color="inherit" disabled={requesting} onClick={onDropQueue} sx={actionBtnSx}>
      Drop
    </Button>
  ) : (
    <Box sx={ACTION_SLOT} />
  );

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        alignItems: 'center',
        columnGap: `${SP.sm}px`,
        boxSizing: 'border-box',
        height: ORDER_TILE_HEIGHT,
        minHeight: ORDER_TILE_HEIGHT,
        px: `${SP.sm}px`,
        py: `${SP.xs}px`,
        borderRadius: `${RADIUS.sm}px`,
        opacity: inactive ? 0.48 : 1,
        border: `1px solid ${tone.border}`,
        bgcolor: tone.bgcolor,
      }}
    >
      <Box
        sx={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '1px',
        }}
      >
        <Typography
          noWrap
          sx={{
            height: 12,
            lineHeight: '12px',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: tone.color,
          }}
        >
          {statusWord}
        </Typography>
        <Box
          component={canEdit ? 'button' : 'div'}
          type={canEdit ? 'button' : undefined}
          onClick={canEdit ? onEdit : undefined}
          title={order.name}
          sx={{
            minWidth: 0,
            height: 16,
            textAlign: 'left',
            fontWeight: 800,
            fontSize: 12,
            lineHeight: '16px',
            color: studio.ink,
            cursor: canEdit ? 'pointer' : 'default',
            border: 0,
            p: 0,
            bgcolor: 'transparent',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {order.name}
        </Box>
        <Typography
          noWrap
          title={meta}
          sx={{
            minWidth: 0,
            height: 14,
            lineHeight: '14px',
            fontSize: 10,
            fontWeight: 700,
            color: studio.inkMuted,
          }}
        >
          {meta}
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: `${SP.xs}px`,
          height: '100%',
        }}
      >
        <Typography
          noWrap
          sx={{
            height: 16,
            fontSize: 16,
            fontWeight: 700,
            lineHeight: '16px',
            color: studio.ink,
            textAlign: 'right',
            ...mono,
          }}
        >
          {fmtUsd(moneyNumber(order.total))}
        </Typography>
        {action}
      </Box>
    </Box>
  );
}

export function TarsPartsLinesPane({
  jobId,
  parts,
  readOnly = false,
  busy = false,
  onCreatePart,
  onUpdatePart,
  onDeletePart,
}: SharedDeskProps) {
  const canEdit = Boolean(jobId && !readOnly);
  const bySection = summarizePartsList(parts);
  const total = `${bySection.all.count} · ${fmtUsd(bySection.all.cost)}`;
  const detail = PURCHASE_SECTIONS.map((section) => {
    const row = bySection[section];
    return `${PURCHASE_SECTION_LABELS[section]} ${fmtUsd(row.cost)}`;
  }).join(' · ');

  return (
    <Box sx={tarsPaneCardSx}>
      <BenchPaneHeader
        kicker={PARTS_PANE_KICKER}
        value={total}
        detail={detail}
        action={
          canEdit ? (
            <Button
              size="small"
              startIcon={<Add sx={{ fontSize: 14 }} />}
              onClick={() => onCreatePart?.()}
              disabled={busy}
              sx={{ minHeight: 26, fontSize: 11, fontWeight: 800, px: 0.85 }}
            >
              Add line
            </Button>
          ) : undefined
        }
      />
      <Box sx={{ flex: 1, minHeight: 0, ...tarsPaneScrollSx }}>
        {!jobId ? (
          <Typography sx={{ px: 0.85, py: 1, fontSize: '0.75rem', color: studio.inkMuted, minHeight: LINE_HEIGHT }}>
            Select an item to view its parts list.
          </Typography>
        ) : parts.length === 0 ? (
          <NoneYet />
        ) : (
          parts.map((part) => (
            <PartLineRow
              key={part.id}
              part={part}
              readOnly={!canEdit}
              onChange={(patch) => onUpdatePart?.(part.id, patch)}
              onRemove={() => onDeletePart?.(part.id)}
            />
          ))
        )}
      </Box>
    </Box>
  );
}

export function TarsPartsOrdersPane({
  jobId,
  parts,
  orders,
  readOnly = false,
  gradeOptions = [],
  currentGrade = '',
  gradeValues = {},
  plan,
  busy = false,
  onSaveOrder,
  onCancelOrder,
  onRequestOrder,
  onWithdrawOrder,
  onRequestCancel,
  onReceiveOrder,
  onInspectOrder,
  onDropQueue,
}: SharedDeskProps) {
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<RestorationPartsOrderDTO | null>(null);
  const [cancelAsk, setCancelAsk] = useState<{ blocking: RestorationPartsOrderDTO; replacement: RestorationPartsOrderDTO } | null>(null);
  const [ownCancelAsk, setOwnCancelAsk] = useState<RestorationPartsOrderDTO | null>(null);

  const canEdit = Boolean(jobId && !readOnly);
  const liveOrders = useMemo(() => orders.filter(isLivePartsOrder), [orders]);
  const deskOrders = useMemo(
    () => sortOrdersForDesk(liveOrders, gradeOptions),
    [liveOrders, gradeOptions],
  );
  const waitingInspect = useMemo(
    () => orders.find(orderNeedsInspect) ?? null,
    [orders],
  );
  const lead = deskOrders[0];
  const detail = lead
    ? `${partsOrderStatusWord(lead)} · ${lead.name}`
    : 'No purchase orders yet';

  return (
    <Box sx={tarsPaneCardSx}>
      <BenchPaneHeader
        kicker={ORDERS_PANE_KICKER}
        value={`${orders.length}`}
        detail={detail}
        action={
          canEdit ? (
            <Button
              size="small"
              startIcon={<Add sx={{ fontSize: 14 }} />}
              onClick={() => {
                setEditingOrder(null);
                setOrderDialogOpen(true);
              }}
              disabled={parts.length === 0 || busy}
              sx={{ minHeight: 26, fontSize: 11, fontWeight: 800, px: 0.85 }}
            >
              Add order
            </Button>
          ) : undefined
        }
      />
      <Box sx={{ flex: 1, minHeight: 0, p: 0.4, display: 'flex', flexDirection: 'column', gap: 0.4, ...tarsPaneScrollSx }}>
        {!jobId ? (
          <Typography sx={{ px: 0.45, py: 1, fontSize: '0.75rem', color: studio.inkMuted, minHeight: ORDER_TILE_HEIGHT }}>
            Select an item to view its orders.
          </Typography>
        ) : deskOrders.length === 0 ? (
          <NoneYet />
        ) : (
          deskOrders.map((order) => (
            <OrderTile
              key={order.id}
              order={order}
              orders={liveOrders}
              currentGrade={currentGrade}
              gradeValues={gradeValues}
              plan={plan}
              readOnly={!canEdit}
              requesting={busy}
              onEdit={() => {
                setEditingOrder(order);
                setOrderDialogOpen(true);
              }}
              onRequest={() => onRequestOrder?.(order)}
              onWithdraw={() => onWithdrawOrder?.(order.id)}
              onAskCancel={() => {
                const intent = requestIntent(liveOrders, order);
                if (intent.kind === 'askCancel') setCancelAsk({ blocking: intent.order, replacement: order });
              }}
              onAskCancelOwn={() => setOwnCancelAsk(order)}
              onReceive={() => onReceiveOrder?.(order)}
              onDropQueue={() => onDropQueue?.(order.id)}
            />
          ))
        )}
      </Box>
      <Box sx={{ flexShrink: 0, p: 0.4, pt: 0 }}>
        <PartsReceiveInspectForm
          order={waitingInspect}
          canSubmit={canEdit}
          busy={busy}
          onSubmit={(lines) => {
            if (!waitingInspect) return;
            onInspectOrder?.(waitingInspect, lines);
          }}
        />
      </Box>

      <TarsPartsOrderDialog
        open={orderDialogOpen}
        parts={parts}
        existing={editingOrder}
        gradeOptions={gradeOptions}
        defaultGrade={currentGrade}
        saving={busy}
        onClose={() => {
          setOrderDialogOpen(false);
          setEditingOrder(null);
        }}
        onSave={(payload) => {
          onSaveOrder?.(payload, editingOrder?.id);
          setOrderDialogOpen(false);
          setEditingOrder(null);
        }}
        onDelete={
          editingOrder && canEdit
            ? () => {
                onCancelOrder?.(editingOrder.id);
                setOrderDialogOpen(false);
                setEditingOrder(null);
              }
            : undefined
        }
      />

      <Dialog open={ownCancelAsk != null} onClose={() => setOwnCancelAsk(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Ask to cancel?</DialogTitle>
        <DialogContent>
          <Typography sx={{ minHeight: 56 }}>
            {ownCancelAsk
              ? `${ownCancelAsk.name} is accepted. Ask the owner to cancel it?`
              : ' '}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOwnCancelAsk(null)}>Not now</Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => {
              if (!ownCancelAsk) return;
              onRequestCancel?.(ownCancelAsk.id);
              setOwnCancelAsk(null);
            }}
          >
            Ask to cancel
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cancelAsk != null} onClose={() => setCancelAsk(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel and request?</DialogTitle>
        <DialogContent>
          <Typography sx={{ minHeight: 72 }}>
            {cancelAsk
              ? `${cancelAsk.blocking.name} is already ${cancelAsk.blocking.status}. To request this you have to submit a cancel first. Cancel ${cancelAsk.blocking.name} and then request this?`
              : ' '}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelAsk(null)}>Not now</Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => {
              if (!cancelAsk) return;
              onRequestCancel?.(cancelAsk.blocking.id, cancelAsk.replacement.id);
              setCancelAsk(null);
            }}
          >
            Cancel and request
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
