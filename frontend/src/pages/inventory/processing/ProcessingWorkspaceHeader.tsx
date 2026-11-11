/**
 * The top of Processing (Dash Update #81). Three rows:
 * 1. the order: number (opens the Order window; the arrow switches orders), vendor, manifest, load description
 *    (opens the Truck Plan), delivered, dispute due;
 * 2. the Truck Plan in one line, marked "Default plan" while the truck follows the store default (never blank);
 * 3. the numbers in four groups: Money (Paid, Target, On track), Items (Total, Left, Added), Disputes (Disputed,
 *    Worth) and Work (Pallet, Rate). Hover a block for the sum behind it; click for the same lines in a window.
 * Money, disputes and dates come from `GET /inventory/orders/<id>/truck-summary/` (`services/truck_plan.py`).
 */
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import { Link as RouterLink } from 'react-router-dom';
import { OrderPickerOptionRow } from '../../../components/inventory/OrderPickerOptionRow';
import { PurchaseOrderManifestDialog } from '../../../components/inventory/PurchaseOrderManifestDialog';
import { useOptionalObjectModal } from '../../../components/objects/ObjectModal';
import type { ProcessingWorkspaceOrderDTO, ProcessingWorkspaceRollupsDTO } from '../../../types/inventory.types';
import { formatCurrency } from '../../../utils/format';
import { orderPickerProcessingBadgeColors } from '../../../utils/orderPickerDisplay';
import { processingTokens } from './processingTokens';
import type { TruckPalletLedgerDTO } from '../../../api/truckPallets.api';
import type { TruckSummaryDTO } from '../../../api/truckPlan.api';
import { missingHeadline, palletHeadline } from './palletLedgerDisplay';
import {
  businessDaysUntil,
  disputeDueLabel,
  disputedHeadline,
  onTrackHeadline,
  paidHeadline,
  planLineParts,
  shortDay,
  targetHeadline,
  worthHeadline,
} from './truckSummaryDisplay';
import { notFiledLine } from '../truck/closeTruckDisplay';
import { IconClose as Close } from '../../../icons/ecoIcons';

export interface ProcessingWorkspaceOrderPickRow {
  id: number;
  order_number: string;
  vendor_name: string;
  vendor_code?: string | null;
  description?: string | null;
  item_count?: number;
  status?: string | null;
  processing_status?: string | null;
  ordered_date?: string | null;
  paid_date?: string | null;
  shipped_date?: string | null;
  delivered_date?: string | null;
}

type MetricTone = 'default' | 'good' | 'warning' | 'error';

interface HeaderMetric {
  id: string;
  label: string;
  value: string;
  suffix?: string;
  helper: string;
  /** The lines behind the number: shown on hover and when the block is clicked. */
  detail: string[];
  tone?: MetricTone;
  /** Colour the helper line too (On track: over or under the target). */
  helperTone?: MetricTone;
  /** What a click opens instead of the stat detail. */
  opens?: 'pallets';
  /** The button in the block's window: where the number leads. */
  leadsTo?: { label: string; go: 'plan' | 'close' | 'open' | 'disputes' | 'unmanifested' };
  /** Wider block (the disputed number sits beside its 5% line). */
  wide?: boolean;
}

interface MetricGroup {
  id: string;
  label: string;
  metrics: HeaderMetric[];
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ss = s % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function fmtQty(value: number | null | undefined): string {
  if (value == null) return '-';
  return new Intl.NumberFormat().format(value);
}

function fmtMoney(value: string | number | null | undefined): string {
  if (value == null || value === '') return '-';
  return formatCurrency(value);
}

function toneColor(tone: MetricTone | undefined): string | undefined {
  return tone === 'good' ? processingTokens.accentGreen
    : tone === 'warning' ? processingTokens.accentAmber
    : tone === 'error' ? processingTokens.accentRed
    : undefined;
}

export interface ProcessingWorkspaceHeaderProps {
  order: ProcessingWorkspaceOrderDTO;
  pickerOrders: ProcessingWorkspaceOrderPickRow[];
  onSelectOrderId: (id: number) => void;
  manifestDispositioned: number;
  manifestTotalQty: number;
  itemDispositioned: number;
  itemTotal: number;
  hasManifestRows: boolean;
  sessionCheckInCount: number;
  /** Epoch ms of the first check-in this session (rate timer starts here, not page load). */
  sessionStartedAt: number | null;
  rollups?: ProcessingWorkspaceRollupsDTO;
  addItemVisible?: boolean;
  onAddItem?: () => void;
  pendingUnits: number;
  orderComplete: boolean;
  closeLoading: boolean;
  onCloseClick: () => void;
  /** Truck pallet ledger (E1): current pallet and the running missing %. */
  pallets?: TruckPalletLedgerDTO;
  onOpenPallets?: () => void;
  /** Paid, Target, On track, disputes so far, dates and the Truck Plan (undefined while it loads). */
  summary?: TruckSummaryDTO;
  /** Show these lines in the list under the header (Left, Added, Disputed lead there). */
  onShowRows?: (filter: 'open' | 'disputes' | 'unmanifested') => void;
}

export function ProcessingWorkspaceHeader({
  order,
  pickerOrders,
  onSelectOrderId,
  manifestDispositioned,
  manifestTotalQty,
  itemDispositioned,
  itemTotal,
  hasManifestRows,
  sessionCheckInCount,
  sessionStartedAt,
  rollups,
  addItemVisible,
  onAddItem,
  pendingUnits,
  orderComplete,
  closeLoading,
  onCloseClick,
  pallets,
  onOpenPallets,
  summary,
  onShowRows,
}: ProcessingWorkspaceHeaderProps) {
  const [, tick] = useState(0);
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);
  const [orderAnchorEl, setOrderAnchorEl] = useState<HTMLElement | null>(null);
  const [manifestViewerOpen, setManifestViewerOpen] = useState(false);
  const objectModal = useOptionalObjectModal();
  const openOrderWindow = objectModal ? () => objectModal.openObject({ type: 'order', id: order.id }) : undefined;
  const openPlan = objectModal ? () => objectModal.openObject({ type: 'truck-plan', id: order.id }) : undefined;
  const openCloseTruck = objectModal ? () => objectModal.openObject({ type: 'close-truck', id: order.id }) : undefined;

  useEffect(() => {
    // The 1 Hz tick only feeds the items/hour rate, which renders as a static
    // placeholder until the session starts - don't re-render the header until then.
    if (sessionStartedAt == null) return;
    const id = window.setInterval(() => tick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [sessionStartedAt]);

  const disp = hasManifestRows && manifestTotalQty > 0 ? manifestDispositioned : itemTotal > 0 ? itemDispositioned : 0;
  const tot = hasManifestRows && manifestTotalQty > 0 ? manifestTotalQty : itemTotal > 0 ? itemTotal : 0;
  const pct = tot > 0 ? Math.min(100, Math.floor((100 * Math.min(disp, tot)) / tot)) : 0;
  const elapsedMs = sessionStartedAt != null ? Date.now() - sessionStartedAt : 0;
  const elapsedHours = Math.max(elapsedMs / 3600000, 1 / 3600);
  const itemsPerHour = sessionStartedAt != null ? Math.round(sessionCheckInCount / elapsedHours) : 0;

  const disputeDue = disputeDueLabel(summary?.dates);
  // The count-down (#88): a dispute worth filing that is not filed yet, with the days left (or missed, once passed).
  const dueDay = summary?.dates.dispute_due ? new Date(`${summary.dates.dispute_due}T00:00:00`) : null;
  const notFiled = notFiledLine(summary?.claim?.not_filed, dueDay ? businessDaysUntil(dueDay, new Date()) : null);
  const truckClosed = Boolean(summary?.claim?.finalized_at);
  const deliveredDay = order.delivered_date || order.expected_delivery;
  const planParts = planLineParts(summary?.plan);
  const orderNotes = (summary?.order.notes || '').replace(/\s+/g, ' ').trim();

  const groups = useMemo<MetricGroup[]>(() => {
    const expected = rollups?.expected_qty ?? tot;
    const done = rollups?.dispositioned_qty ?? disp;
    const remaining = rollups?.remaining_qty ?? Math.max(0, expected - done);
    const overage = rollups?.overage_qty ?? 0;
    const added = rollups?.unmanifested_qty ?? 0;
    const onTrack = onTrackHeadline(summary);
    const planLead = { label: 'Open the Truck Plan', go: 'plan' as const };
    // Left is counted line by line (the same count On track and the Truck Plan use). Extra units on one line do not
    // make another line less open, so it can be more than Total minus Done; the hover says by how much.
    const left = summary ? summary.on_track.units_left : remaining;
    // Units that came on a line beyond what the manifest said for that line. They count as done, not as left.
    const extra = Math.max(0, done + left - expected);
    const leftPct = expected > 0 ? Math.min(100, Math.floor((100 * Math.max(0, expected - left)) / expected)) : pct;
    const addsUp = extra > 0
      ? `${fmtQty(expected)} on the manifest - ${fmtQty(left)} left + ${fmtQty(extra)} extra on lines that came over = ${fmtQty(done)} done.`
      : `${fmtQty(expected)} on the manifest - ${fmtQty(left)} left = ${fmtQty(done)} done.`;
    const missing = missingHeadline(pallets);

    const money: HeaderMetric[] = [
      { id: 'paid', label: 'Paid', ...paidHeadline(summary), leadsTo: planLead },
      { id: 'target', label: 'Target', ...targetHeadline(summary), leadsTo: planLead },
      { id: 'on-track', label: 'On track', ...onTrack, helperTone: onTrack.tone === 'warning' ? 'warning' : undefined, wide: true, leadsTo: planLead },
    ];
    const items: HeaderMetric[] = [
      {
        id: 'items',
        label: 'Total',
        value: fmtQty(expected),
        helper: `${leftPct}% done`,
        tone: 'default',
        detail: [
          `Counted from: ${hasManifestRows ? 'the manifest' : 'item records'}.`,
          addsUp,
          `On the shelf: ${fmtQty(rollups?.on_shelf_qty ?? 0)} units, ${fmtMoney(rollups?.on_shelf_value)} in tags.`,
          `Sold: ${fmtQty(rollups?.sold_qty ?? 0)} units for ${fmtMoney(rollups?.sold_value)}.`,
        ],
      },
      {
        id: 'left',
        label: 'Left',
        value: fmtQty(left),
        helper: 'To process',
        tone: 'default',
        detail: [
          `Units left on lines still open: ${fmtQty(left)}.`,
          addsUp,
        ],
        leadsTo: { label: 'Show the lines still open', go: 'open' },
      },
      {
        id: 'added',
        label: 'Added',
        value: fmtQty(added),
        helper: 'Off manifest',
        detail: [`Items added so far that were not on the manifest: ${fmtQty(added)}.`],
        leadsTo: { label: 'Show the added items', go: 'unmanifested' },
      },
    ];
    const disputes: HeaderMetric[] = [
      {
        id: 'disputed', label: 'Disputed / 5% line', ...disputedHeadline(summary), wide: true,
        leadsTo: { label: 'Show the disputed lines', go: 'disputes' },
      },
      { id: 'worth', label: 'Dispute worth', ...worthHeadline(summary), wide: true, leadsTo: { label: 'Open Close the truck', go: 'close' } },
    ];
    const work: HeaderMetric[] = [
      ...(onOpenPallets
        ? [{
            id: 'pallet',
            label: 'Pallet',
            ...palletHeadline(pallets),
            detail: [
              pallets && pallets.pallets_total > 0
                ? `${pallets.pallets_done} of ${pallets.pallets_total} pallets are closed (marked done on the pallet list). Items done counts units, so the two can differ. Click to pick the pallet you are on or to mark one done.`
                : 'No pallets are listed for this truck. Click to see the pallet list.',
              !pallets || pallets.has_manifest_pallets
                ? missing.value === '-'
                  ? 'Missing units show here once a pallet is marked done.'
                  : `Missing on finished pallets: ${missing.value}, ${missing.helper}.`
                : 'This manifest does not say which pallet each line is on, so missing units are counted for the whole truck.',
            ],
            opens: 'pallets' as const,
          }]
        : []),
      {
        id: 'rate',
        label: 'Rate',
        value: sessionStartedAt != null ? String(itemsPerHour) : '-',
        suffix: sessionStartedAt != null ? '/hr' : undefined,
        helper: sessionStartedAt != null
          ? `${fmtQty(sessionCheckInCount)} in ${fmtElapsed(elapsedMs)}`
          : 'None yet',
        tone: 'default',
        detail: [
          `Checked in this session: ${fmtQty(sessionCheckInCount)}.`,
          sessionStartedAt != null
            ? `Time since the first check-in: ${fmtElapsed(elapsedMs)}.`
            : 'The clock starts when you check in your first item on this screen.',
          'Goal: 100 items an hour.',
        ],
      },
    ];
    return [
      { id: 'money', label: 'Money', metrics: money },
      { id: 'items', label: 'Items', metrics: items },
      { id: 'disputes', label: 'Disputes so far', metrics: disputes },
      { id: 'work', label: 'Work', metrics: work },
    ];
  }, [disp, elapsedMs, hasManifestRows, itemsPerHour, onOpenPallets, pallets, pct, rollups, sessionCheckInCount, sessionStartedAt, summary, tot]);

  const selectedMetric = groups.flatMap((g) => g.metrics).find((m) => m.id === selectedMetricId);
  const onMetricClick = (metric: HeaderMetric) => {
    if (metric.opens === 'pallets' && onOpenPallets) onOpenPallets();
    else setSelectedMetricId(metric.id);
  };
  const lead = selectedMetric?.leadsTo;
  const leadAction: (() => void) | undefined = !lead ? undefined
    : lead.go === 'plan' ? openPlan
    : lead.go === 'close' ? openCloseTruck
    : onShowRows ? () => onShowRows(lead.go as 'open' | 'disputes' | 'unmanifested')
    : undefined;

  return (
    <Box sx={{ flexShrink: 0, borderBottom: 1, borderColor: processingTokens.statsHeaderBorder, bgcolor: 'background.paper' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          // Below a wide screen the facts take their own line, so the buttons are always in reach.
          flexWrap: { xs: 'wrap', lg: 'nowrap' },
          rowGap: 0.5,
          minHeight: 48,
          px: 1,
          py: { xs: 0.5, lg: 0 },
          borderBottom: 1,
          borderColor: processingTokens.orderHeaderBorder,
          bgcolor: processingTokens.orderHeaderBg,
          color: processingTokens.orderHeaderText,
        }}
      >
        <OrderSelectorCell
          orderNumber={order.number}
          onOpenOrder={openOrderWindow}
          onOpenPicker={(el) => setOrderAnchorEl(el)}
        />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: { xs: 'wrap', lg: 'nowrap' },
            rowGap: 0.5,
            order: { xs: 3, lg: 0 },
            flex: { xs: '1 1 100%', lg: '1 1 0' },
            minWidth: 0,
          }}
        >
        <OrderFact label="Vendor" value={order.vendor || order.vendor_code || '-'} />
        <OrderFact
          label="Load description"
          value={order.load_type || 'Truck plan'}
          minWidth={160}
          grow
          tooltip={order.load_type ? `${order.load_type} (opens the Truck Plan)` : 'Opens the Truck Plan'}
          onClick={openPlan}
          href={openPlan ? undefined : `/inventory/orders/${order.id}`}
        />
        {order.has_manifest ? (
          <OrderFact
            label="Manifest"
            value="View"
            minWidth={88}
            maxWidth={92}
            tooltip={order.manifest_filename ? `Open the manifest: ${order.manifest_filename}` : 'Open the manifest'}
            onClick={() => setManifestViewerOpen(true)}
          />
        ) : null}
        <OrderFact
          label={order.delivered_date ? 'Delivered' : 'Expected'}
          value={shortDay(deliveredDay)}
          tooltip={`Ordered ${shortDay(order.ordered_date)}. ${order.delivered_date ? 'Delivered' : 'Expected'} ${shortDay(deliveredDay)}.`}
          monospace
          minWidth={84}
          maxWidth={120}
        />
        <OrderFact
          label="Dispute due"
          value={truckClosed ? 'Truck closed' : disputeDue.value}
          tooltip={disputeDue.tooltip}
          valueColor={toneColor(disputeDue.tone)}
          monospace
          minWidth={184}
          maxWidth={210}
          last
        />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 0.5, flex: { xs: '1 1 0', lg: '0 0 auto' }, minWidth: 0, ml: 'auto', pl: 1 }}>
          {addItemVisible && onAddItem ? (
            <Button
              size="small"
              variant="outlined"
              onClick={onAddItem}
              sx={{
                minHeight: 28,
                py: 0.25,
                color: processingTokens.orderHeaderText,
                borderColor: processingTokens.orderHeaderMutedText,
                '&:hover': { borderColor: processingTokens.orderHeaderText, bgcolor: 'rgba(255,255,255,0.08)' },
              }}
            >
              Add item
            </Button>
          ) : null}
          <Tooltip
            enterDelay={300}
            title={
              orderComplete ? 'Processing is finished on this order.'
              : pendingUnits > 0 ? `Close PO marks processing finished on this order. ${fmtQty(pendingUnits)} units are still waiting, so it is not ready yet.`
              : 'Close PO marks processing finished on this order. Use it when the last item is checked in.'
            }
          >
            <span>
              <Button
                size="small"
                variant="outlined"
                color="success"
                disabled={closeLoading || pendingUnits > 0 || orderComplete}
                onClick={onCloseClick}
                sx={{ minHeight: 28, py: 0.25, whiteSpace: 'nowrap' }}
              >
                Close PO
              </Button>
            </span>
          </Tooltip>
          {openCloseTruck ? (
            <Tooltip
              enterDelay={300}
              title={truckClosed
                ? 'This truck is closed. Opens what was counted and disputed.'
                : 'For a lead or the owner, after processing: see what did not come, record the B-Stock dispute and close the truck.'}
            >
              <Button
                size="small"
                variant="outlined"
                color={truckClosed ? 'success' : 'primary'}
                onClick={openCloseTruck}
                sx={{ minHeight: 28, py: 0.25, whiteSpace: 'nowrap' }}
              >
                {truckClosed ? 'Truck closed' : 'Close the truck'}
              </Button>
            </Tooltip>
          ) : null}
        </Box>
      </Box>

      <Menu anchorEl={orderAnchorEl} open={Boolean(orderAnchorEl)} onClose={() => setOrderAnchorEl(null)} PaperProps={{ sx: { width: 420, maxWidth: 'calc(100vw - 24px)' } }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.5, py: 0.75, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Processing orders
        </Typography>
        {pickerOrders.map((option) => (
          <MenuItem
            key={option.id}
            selected={option.id === order.id}
            onClick={() => {
              setOrderAnchorEl(null);
              onSelectOrderId(option.id);
            }}
            sx={{ alignItems: 'flex-start', py: 1, px: 1.5 }}
          >
            <OrderPickerOptionRow
              orderNumber={option.order_number}
              description={option.description}
              vendorCode={option.vendor_code}
              monoFontFamily={processingTokens.monoFontFamily}
              badge={orderPickerProcessingBadgeColors({
                status: option.status,
                processing_status: option.processing_status,
              })}
              dates={{
                delivered_date: option.delivered_date,
                shipped_date: option.shipped_date,
                paid_date: option.paid_date,
                ordered_date: option.ordered_date,
              }}
            />
          </MenuItem>
        ))}
      </Menu>

      <TruckPlanLine
        loaded={summary != null}
        isDefault={Boolean(summary?.plan?.is_default)}
        dueSetByHand={Boolean(summary?.plan?.dispute_due_date)}
        parts={planParts}
        orderNotes={orderNotes}
        onOpenPlan={openPlan}
        notFiled={notFiled}
        onOpenCloseTruck={openCloseTruck}
      />

      <Box
        sx={{
          display: 'flex',
          width: '100%',
          minHeight: 74,
          flexWrap: 'wrap',
          bgcolor: processingTokens.statsHeaderBg,
          color: processingTokens.statsHeaderText,
        }}
      >
        {groups.map((group, groupIndex) => (
          <Box
            key={group.id}
            role="group"
            aria-label={group.label}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              flex: `${group.metrics.reduce((n, m) => n + (m.wide ? 1.35 : 1), 0)} 1 0`,
              minWidth: group.metrics.reduce((n, m) => n + (m.wide ? 140 : 96), 0),
              borderLeft: groupIndex === 0 ? 0 : 2,
              borderColor: processingTokens.borderStrong,
            }}
          >
            <Typography
              sx={{
                px: 1.25,
                pt: 0.4,
                fontSize: '0.66rem',
                fontWeight: 900,
                letterSpacing: 1,
                textTransform: 'uppercase',
                lineHeight: 1.3,
                color: processingTokens.textMute,
              }}
            >
              {group.label}
            </Typography>
            <Box sx={{ display: 'flex', flex: 1 }}>
              {group.metrics.map((metric, index) => (
                <StatBlock key={metric.id} metric={metric} first={index === 0} onClick={() => onMetricClick(metric)} />
              ))}
            </Box>
          </Box>
        ))}
      </Box>

      <Dialog open={Boolean(selectedMetric)} onClose={() => setSelectedMetricId(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 800 }}>
              Processing
            </Typography>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              {selectedMetric?.label}
            </Typography>
          </Box>
          <IconButton aria-label="Close" onClick={() => setSelectedMetricId(null)}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="h4" fontWeight={900} sx={{ mb: 0.5 }}>
            {selectedMetric?.value}
            {selectedMetric?.suffix ? (
              <Typography component="span" variant="h6" color="text.secondary">
                {selectedMetric.suffix}
              </Typography>
            ) : null}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {selectedMetric?.helper}
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.25, typography: 'body2', '& li': { mb: 0.75 } }}>
            {(selectedMetric?.detail ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </Box>
          {lead && leadAction ? (
            <Button
              size="small"
              variant="outlined"
              sx={{ mt: 1 }}
              onClick={() => {
                setSelectedMetricId(null);
                leadAction();
              }}
            >
              {lead.label}
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>

      <PurchaseOrderManifestDialog
        open={manifestViewerOpen}
        onClose={() => setManifestViewerOpen(false)}
        orderId={order.id}
        fallbackFilename={order.manifest_filename}
      />
    </Box>
  );
}

/** The order number opens the Order window; the arrow beside it switches to another order. */
function OrderSelectorCell({
  orderNumber,
  onOpenOrder,
  onOpenPicker,
}: {
  orderNumber: string;
  onOpenOrder?: () => void;
  onOpenPicker: (el: HTMLElement) => void;
}) {
  return (
    <Box
      sx={{
        borderRight: 1,
        borderColor: processingTokens.orderHeaderBorder,
        height: 34,
        pl: 1.25,
        pr: 0.25,
        mr: 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        minWidth: 150,
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            color: processingTokens.orderHeaderMutedText,
            fontSize: '0.66rem',
            fontWeight: 800,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          Order
        </Typography>
        <Tooltip title={onOpenOrder ? 'Open the order' : 'Switch order'} enterDelay={300} placement="bottom-start">
          <Typography
            component="button"
            type="button"
            noWrap
            onClick={(e: MouseEvent<HTMLElement>) => (onOpenOrder ? onOpenOrder() : onOpenPicker(e.currentTarget))}
            sx={{
              display: 'block',
              appearance: 'none',
              border: 0,
              p: 0,
              bgcolor: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: processingTokens.monoFontFamily,
              fontSize: 13,
              fontWeight: 900,
              lineHeight: 1.2,
              color: 'primary.main',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {orderNumber}
          </Typography>
        </Tooltip>
      </Box>
      <Tooltip title="Switch order" enterDelay={300}>
        <IconButton size="small" aria-label="Switch order" onClick={(e) => onOpenPicker(e.currentTarget)}>
          <KeyboardArrowDown sx={{ fontSize: 18, color: processingTokens.orderHeaderMutedText }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

/** The Truck Plan in one line, with a small "Default plan" mark while it follows the store default. */
function TruckPlanLine({
  loaded,
  isDefault,
  dueSetByHand,
  parts,
  orderNotes,
  onOpenPlan,
  notFiled,
  onOpenCloseTruck,
}: {
  /** The count-down: a dispute worth filing that is not filed yet (or missed). It sits at the end of this line. */
  notFiled?: { text: string; missed: boolean } | null;
  onOpenCloseTruck?: () => void;
  loaded: boolean;
  isDefault: boolean;
  /** The plan holds a dispute day set by hand (it may hold nothing else). */
  dueSetByHand?: boolean;
  parts: ReturnType<typeof planLineParts>;
  orderNotes: string;
  onOpenPlan?: () => void;
}) {
  const label = (
    <Typography
      sx={{
        flexShrink: 0,
        fontSize: '0.66rem',
        fontWeight: 900,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: processingTokens.textMute,
      }}
    >
      Truck plan
    </Typography>
  );
  const defaultMark = isDefault ? (
    <Chip
      size="small"
      variant="outlined"
      label="Default plan"
      sx={{ height: 20, flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'text.secondary', '& .MuiChip-label': { px: 0.75 } }}
    />
  ) : null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 32,
        px: 1.25,
        borderBottom: 1,
        borderColor: processingTokens.orderHeaderBorder,
        bgcolor: processingTokens.orderHeaderBg,
        overflow: 'hidden',
        flexWrap: { xs: 'wrap', md: 'nowrap' },
        py: { xs: 0.5, md: 0 },
      }}
    >
      {label}
      {loaded ? defaultMark : null}
      {!loaded ? null : parts.length === 0 ? (
        // A plan of its own that holds only a dispute day: say so, and open it on a click.
        <Typography
          component={onOpenPlan ? 'button' : 'span'}
          onClick={onOpenPlan}
          sx={{ appearance: 'none', border: 0, p: 0, bgcolor: 'transparent', font: 'inherit', fontSize: 12.5, cursor: onOpenPlan ? 'pointer' : 'default', '&:hover': { textDecoration: onOpenPlan ? 'underline' : 'none' } }}
        >
          {dueSetByHand ? 'Dispute day set by hand. Nothing else written.' : 'Process it as normal.'}
        </Typography>
      ) : (
        <Tooltip
          enterDelay={300}
          placement="bottom-start"
          title={
            <Box>
              {parts.map((p) => (
                <Box key={p.label} sx={{ mb: 0.25 }}>
                  <b>{p.label}:</b> {p.text}
                </Box>
              ))}
            </Box>
          }
        >
          <Box
            component="button"
            type="button"
            onClick={onOpenPlan}
            sx={{
              appearance: 'none',
              border: 0,
              p: 0,
              bgcolor: 'transparent',
              font: 'inherit',
              color: 'inherit',
              cursor: onOpenPlan ? 'pointer' : 'default',
              textAlign: 'left',
              flex: '1 1 auto',
              minWidth: 0,
              display: 'flex',
              columnGap: 1.5,
              flexWrap: { xs: 'wrap', md: 'nowrap' },
              overflow: 'hidden',
              '&:hover .plan-text': { textDecoration: onOpenPlan ? 'underline' : 'none' },
            }}
          >
            {parts.map((p) => (
              <Typography
                key={p.label}
                noWrap
                sx={{
                  fontSize: 12.5, minWidth: 0, maxWidth: '100%',
                  // Short parts keep their room; the two notes share what is left, so neither is cut to a letter.
                  flex: { xs: '0 1 auto', md: p.text.length > 30 ? '1 1 0' : '0 0 auto' },
                }}
              >
                <Box component="span" sx={{ color: p.strong ? processingTokens.accentAmber : 'text.secondary', fontWeight: 700 }}>
                  {p.label}:
                </Box>{' '}
                <Box component="span" className="plan-text" sx={{ fontWeight: p.strong ? 700 : 500 }}>
                  {p.text}
                </Box>
              </Typography>
            ))}
          </Box>
        </Tooltip>
      )}
      {loaded && orderNotes ? (
        <Tooltip title={orderNotes} enterDelay={300}>
          <Typography noWrap sx={{ fontSize: 12.5, minWidth: 0, flex: '0 1 auto', ml: 'auto', color: 'text.secondary' }}>
            <Box component="span" sx={{ fontWeight: 700 }}>Order notes:</Box> {orderNotes}
          </Typography>
        </Tooltip>
      ) : null}
      {notFiled && onOpenCloseTruck ? (
        <Tooltip
          title={notFiled.missed
            ? 'The day to file this dispute has passed and it was not filed. If it was filed on B-Stock in time, record it in Close the truck.'
            : 'A dispute is worth filing on this truck and is not filed yet. Opens Close the truck.'}
          enterDelay={300}
        >
          <Button
            size="small"
            color={notFiled.missed ? 'inherit' : 'error'}
            variant={notFiled.missed ? 'outlined' : 'contained'}
            onClick={onOpenCloseTruck}
            sx={{
              ml: orderNotes ? 0 : 'auto', minHeight: 22, py: 0, px: 1, fontSize: 12, flexShrink: 0, maxWidth: '100%',
              whiteSpace: { xs: 'normal', md: 'nowrap' }, textAlign: 'left', lineHeight: 1.3,
              fontWeight: 800, boxShadow: 'none', '&:hover': { boxShadow: 'none' },
            }}
          >
            {notFiled.text}
          </Button>
        </Tooltip>
      ) : null}
    </Box>
  );
}

function OrderFact({
  label,
  value,
  monospace,
  minWidth = 82,
  maxWidth = 160,
  showFullValueOnHover = false,
  tooltip,
  href,
  onClick,
  valueColor,
  grow,
  last,
}: {
  /** Takes the room the other facts leave (the load description). */
  grow?: boolean;
  last?: boolean;
  label: string;
  value: string;
  monospace?: boolean;
  minWidth?: number;
  maxWidth?: number;
  showFullValueOnHover?: boolean;
  tooltip?: string;
  href?: string;
  onClick?: () => void;
  valueColor?: string;
}) {
  const twoLines = Boolean(grow);
  const hoverTitle = tooltip || (showFullValueOnHover && value !== '-' ? value : undefined);
  const isInteractive = Boolean((href || onClick) && value !== '-');
  const valueTypography = (
    <Typography
      noWrap={!twoLines}
      component={href && value !== '-' ? RouterLink : onClick && value !== '-' ? 'button' : 'span'}
      {...(href && value !== '-' ? { to: href } : {})}
      {...(onClick && value !== '-' && !href
        ? {
            type: 'button' as const,
            onClick,
          }
        : {})}
      sx={{
        display: 'block',
        fontSize: 12.5,
        fontWeight: 700,
        fontFamily: monospace ? processingTokens.monoFontFamily : undefined,
        lineHeight: twoLines ? 1.2 : 1.25,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        ...(twoLines ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', whiteSpace: 'normal' } : {}),
        color: isInteractive ? 'primary.main' : valueColor ?? processingTokens.orderHeaderText,
        ...(isInteractive
          ? {
              textDecoration: 'none',
              cursor: 'pointer',
              background: 'none',
              border: 0,
              padding: 0,
              textAlign: 'left',
              width: '100%',
              '&:hover': { textDecoration: 'underline' },
            }
          : {}),
      }}
    >
      {value}
    </Typography>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        height: grow ? 'auto' : 34,
        minHeight: 34,
        minWidth,
        maxWidth: grow ? undefined : maxWidth,
        flex: grow ? '1 1 0' : '0 0 auto',
        px: 1.1,
        borderRight: last ? 0 : 1,
        borderColor: 'divider',
      }}
    >
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          color: processingTokens.orderHeaderMutedText,
          fontSize: '0.66rem',
          fontWeight: 800,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          lineHeight: 1.05,
        }}
      >
        {label}
      </Typography>
      {hoverTitle ? (
        <Tooltip title={hoverTitle} enterDelay={300} placement="bottom-start">
          {valueTypography}
        </Tooltip>
      ) : (
        valueTypography
      )}
    </Box>
  );
}

function StatBlock({
  metric,
  first,
  onClick,
}: {
  metric: HeaderMetric;
  first: boolean;
  onClick: () => void;
}) {
  const valueColor = toneColor(metric.tone) ?? processingTokens.statsHeaderText;
  const helperColor = toneColor(metric.helperTone);

  const block = (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={`${metric.label}: ${metric.value}${metric.suffix ?? ''}. ${metric.helper}`}
      sx={{
        appearance: 'none',
        border: 0,
        borderLeft: first ? 0 : 1,
        borderColor: processingTokens.statsHeaderBorder,
        bgcolor: 'transparent',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        flex: metric.wide ? '1.35 1 0' : '1 1 0',
        minWidth: metric.wide ? 140 : 96,
        px: 1,
        pt: 0.35,
        pb: 0.7,
        position: 'relative',
        transition: (theme) => theme.transitions.create('background-color'),
        ...(metric.tone && metric.tone !== 'default' ?
          {
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              width: 3,
              height: '100%',
              bgcolor: toneColor(metric.tone),
              opacity: 0.55,
            },
          }
        : {}),
        '&:hover': {
          bgcolor: processingTokens.surfaceRaised,
        },
      }}
    >
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.68rem', fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 1.1 }}>
        {metric.label}
      </Typography>
      <Typography noWrap sx={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: valueColor, lineHeight: 1.05, mt: 0.25 }}>
        {metric.value}
        {metric.suffix ? (
          <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 13 }}>
            {metric.suffix}
          </Typography>
        ) : null}
      </Typography>
      <Typography
        variant="caption"
        noWrap
        sx={{
          display: 'block',
          mt: 0.2,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: helperColor ? '0.78rem' : '0.72rem',
          fontWeight: helperColor ? 800 : 500,
          color: helperColor ?? 'text.secondary',
        }}
      >
        {metric.helper}
      </Typography>
    </Box>
  );

  if (!metric.detail.length) return block;
  return (
    <Tooltip
      enterDelay={250}
      placement="bottom-start"
      title={
        <Box sx={{ py: 0.25 }}>
          {metric.detail.map((line) => (
            <Box key={line} sx={{ mb: 0.25 }}>{line}</Box>
          ))}
        </Box>
      }
    >
      {block}
    </Tooltip>
  );
}
