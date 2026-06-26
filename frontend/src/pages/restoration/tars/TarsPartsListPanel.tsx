import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import OpenInNew from '@mui/icons-material/OpenInNew';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Divider,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import type { TarsPartLine, TarsProcurementGroup, TarsWorkSession } from './tarsWorkTypes';
import { fmtUsd } from './tarsProfit';
import { TarsPartsOrderDialog, orderPartLines } from './TarsPartsOrderDialog';
import {
  addSessionPart,
  allOrdersFeesTotal,
  collectSessionParts,
  listSessionOrders,
  orderGrandTotal,
  orderPartsSubtotal,
  partLineTotal,
  partsGrandTotal,
  partsSubtotal,
  PARTS_DRAWER_WIDTH,
  removeSessionOrder,
  removeSessionPart,
  updateSessionPart,
  upsertSessionOrder,
} from './tarsPartsListSession';

interface TarsPartsListPanelProps {
  session: TarsWorkSession | undefined;
  itemLabel?: string;
  readOnly?: boolean;
  onSessionChange?: (session: TarsWorkSession) => void;
}

type PartsTab = 'parts' | 'orders';

function parseQty(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseMoney(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function PartLineRow({
  part,
  readOnly,
  onChange,
  onRemove,
}: {
  part: TarsPartLine;
  readOnly: boolean;
  onChange: (patch: Partial<TarsPartLine>) => void;
  onRemove: () => void;
}) {
  const lineTotal = partLineTotal(part);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: readOnly
          ? 'minmax(0, 2.2fr) minmax(0, 1.4fr) 56px 92px 90px'
          : 'minmax(0, 2.2fr) minmax(0, 1.4fr) 56px 92px 90px 32px',
        gap: 0.6,
        alignItems: 'center',
        py: 0.45,
        px: 0.6,
        borderRadius: 1,
        border: '1px solid #e2e8f0',
        bgcolor: '#fff',
        '&:hover': { bgcolor: readOnly ? '#fff' : '#f8fafc' },
      }}
    >
      <TextField
        size="small"
        placeholder="Description"
        value={part.description}
        onChange={(e) => onChange({ description: e.target.value })}
        disabled={readOnly}
        slotProps={{ input: { sx: { fontSize: 13, py: 0.85 } } }}
      />
      <TextField
        size="small"
        placeholder="URL"
        value={part.url}
        onChange={(e) => onChange({ url: e.target.value })}
        disabled={readOnly}
        slotProps={{
          input: {
            sx: { fontSize: 13, py: 0.85 },
            endAdornment:
              part.url.trim() ?
                <Link href={part.url} target="_blank" rel="noopener noreferrer" sx={{ display: 'flex', lineHeight: 0 }}>
                  <OpenInNew sx={{ fontSize: 14 }} />
                </Link>
              : undefined,
          },
        }}
      />
      <TextField
        size="small"
        placeholder="Qty"
        type="number"
        value={part.qty}
        onChange={(e) => onChange({ qty: parseQty(e.target.value) })}
        disabled={readOnly}
        slotProps={{ htmlInput: { min: 1 }, input: { sx: { fontSize: 13, py: 0.85 } } }}
      />
      <TextField
        size="small"
        placeholder="Price"
        type="number"
        value={part.unitPriceEstimate || ''}
        onChange={(e) => onChange({ unitPriceEstimate: parseMoney(e.target.value) })}
        disabled={readOnly}
        slotProps={{
          htmlInput: { min: 0, step: 0.01 },
          input: {
            sx: { fontSize: 13, py: 0.85 },
            startAdornment: <InputAdornment position="start">$</InputAdornment>,
          },
        }}
      />
      <Typography fontFamily="monospace" fontWeight={800} textAlign="right" sx={{ fontSize: 13, pr: 0.5 }}>
        {fmtUsd(lineTotal)}
      </Typography>
      {!readOnly ?
        <IconButton size="small" aria-label="Remove part" onClick={onRemove} sx={{ p: 0.25 }}>
          <Delete sx={{ fontSize: 16 }} />
        </IconButton>
      : null}
    </Box>
  );
}

function OrderCard({
  order,
  orderIndex,
  session,
  partLines,
  readOnly,
  onEdit,
  onDelete,
}: {
  order: TarsProcurementGroup;
  orderIndex: number;
  session: TarsWorkSession;
  partLines: TarsPartLine[];
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const items = orderPartLines(partLines, order);
  const total = orderGrandTotal(session, order);
  const name = order.supplierName.trim() || `Order ${orderIndex + 1}`;

  const chargeBits: string[] = [`${items.length} item${items.length === 1 ? '' : 's'}`];
  if (order.shipping > 0) chargeBits.push(`Ship ${fmtUsd(order.shipping)}`);
  if (order.tax > 0) chargeBits.push(`Tax ${fmtUsd(order.tax)}`);
  if (order.fees > 0) chargeBits.push(`Fees ${fmtUsd(order.fees)}`);

  return (
    <Card variant="outlined" sx={{ borderColor: '#cbd5e1' }}>
      <CardActionArea onClick={readOnly ? undefined : onEdit} disabled={readOnly}>
        <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle2" fontWeight={800} noWrap title={name}>
                {name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {chargeBits.join(' · ')}
              </Typography>
            </Box>
            <Typography variant="subtitle2" fontWeight={900} fontFamily="monospace" sx={{ flexShrink: 0 }}>
              {fmtUsd(total)}
            </Typography>
            {!readOnly ?
              <IconButton
                size="small"
                aria-label="Delete order"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                sx={{ flexShrink: 0, ml: -0.25 }}
              >
                <Delete fontSize="small" />
              </IconButton>
            : null}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export function TarsPartsListPanel({
  session,
  itemLabel,
  readOnly = false,
  onSessionChange,
}: TarsPartsListPanelProps) {
  const [tab, setTab] = useState<PartsTab>('parts');
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<TarsProcurementGroup | null>(null);

  const parts = session ? collectSessionParts(session) : [];
  const partLines = useMemo(() => parts.map((row) => row.part), [parts]);
  const orders = session ? listSessionOrders(session) : [];
  const canEdit = Boolean(session && onSessionChange && !readOnly);

  if (!session) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ px: 1.25, py: 2 }}>
        Select an item to view its parts list.
      </Typography>
    );
  }

  const commit = (next: TarsWorkSession) => {
    onSessionChange?.(next);
  };

  const openNewOrder = () => {
    setEditingOrder(null);
    setOrderDialogOpen(true);
  };

  const openEditOrder = (order: TarsProcurementGroup) => {
    setEditingOrder(order);
    setOrderDialogOpen(true);
  };

  return (
    <Stack spacing={1} sx={{ px: 1.25, py: 1, minWidth: PARTS_DRAWER_WIDTH - 32 }}>
      {itemLabel ?
        <Typography variant="caption" color="text.secondary" fontWeight={700} noWrap title={itemLabel}>
          {itemLabel}
        </Typography>
      : null}

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v as PartsTab)}
        sx={{ minHeight: 36, borderBottom: 1, borderColor: 'divider', mb: 0.25 }}
      >
        <Tab value="parts" label={`Parts (${parts.length})`} sx={{ minHeight: 36, py: 0.5, fontSize: 13, fontWeight: 700 }} />
        <Tab value="orders" label={`Orders (${orders.length})`} sx={{ minHeight: 36, py: 0.5, fontSize: 13, fontWeight: 700 }} />
      </Tabs>

      {tab === 'parts' ?
        <Stack spacing={0.75}>
          {canEdit ?
            <Button
              size="small"
              variant="outlined"
              startIcon={<Add />}
              onClick={() => commit(addSessionPart(session))}
              sx={{ alignSelf: 'flex-start', minHeight: 28, fontSize: 12, fontWeight: 700 }}
            >
              Add part
            </Button>
          : null}

          {parts.length > 0 ?
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: readOnly
                  ? 'minmax(0, 2.2fr) minmax(0, 1.4fr) 56px 92px 90px'
                  : 'minmax(0, 2.2fr) minmax(0, 1.4fr) 56px 92px 90px 32px',
                gap: 0.6,
                px: 0.6,
              }}
            >
              <Typography variant="caption" fontWeight={800} color="text.secondary">
                Description
              </Typography>
              <Typography variant="caption" fontWeight={800} color="text.secondary">
                URL
              </Typography>
              <Typography variant="caption" fontWeight={800} color="text.secondary">
                Qty
              </Typography>
              <Typography variant="caption" fontWeight={800} color="text.secondary">
                Price
              </Typography>
              <Typography variant="caption" fontWeight={800} color="text.secondary" textAlign="right">
                Line
              </Typography>
              {!readOnly ? <span /> : null}
            </Box>
          : null}

          {parts.length === 0 ?
            <Typography variant="body2" color="text.secondary">
              {readOnly ? 'No parts on this item yet.' : 'No parts yet. Use Add part to start a list.'}
            </Typography>
          : parts.map(({ part }) => (
              <PartLineRow
                key={part.id}
                part={part}
                readOnly={!canEdit}
                onChange={(patch) => commit(updateSessionPart(session, part.id, patch))}
                onRemove={() => commit(removeSessionPart(session, part.id))}
              />
            ))
          }

          {parts.length > 0 ?
            <>
              <Divider sx={{ my: 0.5 }} />
              <Stack spacing={0.35} sx={{ px: 0.5 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>
                    Parts subtotal
                  </Typography>
                  <Typography variant="caption" fontFamily="monospace" fontWeight={800}>
                    {fmtUsd(partsSubtotal(session))}
                  </Typography>
                </Stack>
                {orders.length > 0 ?
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      Order fees (all orders)
                    </Typography>
                    <Typography variant="caption" fontFamily="monospace" fontWeight={800}>
                      {fmtUsd(allOrdersFeesTotal(session))}
                    </Typography>
                  </Stack>
                : null}
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" fontWeight={900}>
                    Grand total
                  </Typography>
                  <Typography variant="body2" fontFamily="monospace" fontWeight={900}>
                    {fmtUsd(partsGrandTotal(session))}
                  </Typography>
                </Stack>
              </Stack>
            </>
          : null}
        </Stack>
      : null}

      {tab === 'orders' ?
        <Stack spacing={1}>
          {canEdit ?
            <Button
              size="small"
              variant="contained"
              startIcon={<Add />}
              onClick={openNewOrder}
              disabled={partLines.length === 0}
              sx={{ alignSelf: 'flex-start', minHeight: 28, fontSize: 12, fontWeight: 700 }}
            >
              New order
            </Button>
          : null}

          {partLines.length === 0 ?
            <Typography variant="body2" color="text.secondary">
              Add parts on the Parts tab before creating an order.
            </Typography>
          : orders.length === 0 ?
            <Typography variant="body2" color="text.secondary">
              {readOnly ? 'No orders yet.' : 'No orders yet. Group parts into an order with shipping and fees.'}
            </Typography>
          : orders.map((order, index) => (
              <OrderCard
                key={order.id}
                order={order}
                orderIndex={index}
                session={session}
                partLines={partLines}
                readOnly={!canEdit}
                onEdit={() => openEditOrder(order)}
                onDelete={() => commit(removeSessionOrder(session, order.id))}
              />
            ))
          }
        </Stack>
      : null}

      <TarsPartsOrderDialog
        open={orderDialogOpen}
        parts={partLines}
        existing={editingOrder}
        orderIndex={editingOrder ? orders.findIndex((o) => o.id === editingOrder.id) : orders.length}
        onClose={() => {
          setOrderDialogOpen(false);
          setEditingOrder(null);
        }}
        onSave={({ order, partUpdates }) => {
          let next = session;
          for (const update of partUpdates) {
            const { id, ...patch } = update;
            next = updateSessionPart(next, id, patch);
          }
          commit(upsertSessionOrder(next, order));
          setOrderDialogOpen(false);
          setEditingOrder(null);
        }}
        onDelete={
          editingOrder && canEdit
            ? () => commit(removeSessionOrder(session, editingOrder.id))
            : undefined
        }
      />
    </Stack>
  );
}

export { collectSessionParts } from './tarsPartsListSession';
