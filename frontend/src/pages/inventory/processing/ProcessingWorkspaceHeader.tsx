/**
 * The top of Processing (Dash Update #81). Three rows:
 * 1. the order: number (opens the Order window; the arrow switches orders), vendor, manifest, load description
 *    (opens the Truck Plan), delivered, dispute due;
 * 2. the Truck Plan in one line, or "No truck plan yet" with a button (it never blocks processing);
 * 3. the numbers in four groups: Money (Paid, Target, On track), Items (Total, Left, Added), Disputes (Disputed,
 *    Worth) and Work (Pallet, Rate). Hover a block for the sum behind it; click for the same lines in a window.
 * Money, disputes and dates come from `GET /inventory/orders/<id>/truck-summary/` (`services/truck_plan.py`).
 */
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  Box,
  Button,
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
  opens?: 'pallets' | 'plan';
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
  const pct = tot > 0 ? Math.round((100 * disp) / tot) : 0;
  const elapsedMs = sessionStartedAt != null ? Date.now() - sessionStartedAt : 0;
  const elapsedHours = Math.max(elapsedMs / 3600000, 1 / 3600);
  const itemsPerHour = sessionStartedAt != null ? Math.round(sessionCheckInCount / elapsedHours) : 0;

  const disputeDue = disputeDueLabel(summary?.dates);
  // The count-down (#88): a claim worth filing that is not filed yet, with the days left.
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
    const missing = missingHeadline(pallets);

    const money: HeaderMetric[] = [
      { id: 'paid', label: 'Paid', ...paidHeadline(summary) },
      { id: 'target', label: 'Target', ...targetHeadline(summary), opens: 'plan' },
      { id: 'on-track', label: 'On track', ...onTrack, helperTone: onTrack.tone },
    ];
    const items: HeaderMetric[] = [
      {
        id: 'items',
        label: 'Total',
        value: fmtQty(expected),
        helper: `${fmtQty(done)} done · ${pct}%`,
        tone: pct >= 100 ? 'good' : 'default',
        detail: [
          `Counted from: ${hasManifestRows ? 'the manifest' : 'item records'}.`,
          `Total: ${fmtQty(expected)} units. Done: ${fmtQty(done)}. Left: ${fmtQty(remaining)}.`,
          `On the shelf: ${fmtQty(rollups?.on_shelf_qty ?? 0)} units, ${fmtMoney(rollups?.on_shelf_value)} in tags.`,
          `Sold: ${fmtQty(rollups?.sold_qty ?? 0)} units for ${fmtMoney(rollups?.sold_value)}.`,
        ],
      },
      {
        id: 'left',
        label: 'Left',
        value: fmtQty(remaining),
        helper: overage > 0 ? `${fmtQty(overage)} over the manifest` : 'Units to process',
        tone: remaining > 0 ? 'warning' : 'good',
        detail: [`Units left: ${fmtQty(remaining)}.`, `Over the manifest: ${fmtQty(overage)} units.`],
      },
      {
        id: 'added',
        label: 'Added',
        value: fmtQty(added),
        helper: 'Not on the manifest',
        detail: [`Items added so far that were not on the manifest: ${fmtQty(added)}.`],
      },
    ];
    const disputes: HeaderMetric[] = [
      { id: 'disputed', label: 'Disputed', ...disputedHeadline(summary) },
      { id: 'worth', label: 'Dispute worth', ...worthHeadline(summary) },
    ];
    const work: HeaderMetric[] = [
      ...(onOpenPallets
        ? [{
            id: 'pallet',
            label: 'Pallet',
            ...palletHeadline(pallets),
            detail: [`Missing on finished pallets: ${missing.value === '-' ? missing.helper : `${missing.value}, ${missing.helper}`}.`],
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
          : 'Starts at the first check-in',
        tone: itemsPerHour >= 100 ? 'good' : sessionCheckInCount > 0 ? 'warning' : 'default',
        detail: [
          `Checked in this session: ${fmtQty(sessionCheckInCount)}.`,
          `Time since the first check-in: ${sessionStartedAt != null ? fmtElapsed(elapsedMs) : 'not started'}.`,
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
    else if (metric.opens === 'plan' && openPlan) openPlan();
    else setSelectedMetricId(metric.id);
  };

  return (
    <Box sx={{ flexShrink: 0, borderBottom: 1, borderColor: processingTokens.statsHeaderBorder, bgcolor: 'background.paper' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 48,
          px: 1,
          borderBottom: 1,
          borderColor: processingTokens.orderHeaderBorder,
          overflow: 'hidden',
          bgcolor: processingTokens.orderHeaderBg,
          color: processingTokens.orderHeaderText,
        }}
      >
        <OrderSelectorCell
          orderNumber={order.number}
          onOpenOrder={openOrderWindow}
          onOpenPicker={(el) => setOrderAnchorEl(el)}
        />
        <OrderFact label="Vendor" value={order.vendor || order.vendor_code || '-'} />
        {order.has_manifest ? (
          <OrderFact
            label="Manifest"
            value={order.manifest_filename || 'View CSV'}
            minWidth={120}
            maxWidth={220}
            showFullValueOnHover
            onClick={() => setManifestViewerOpen(true)}
          />
        ) : null}
        <OrderFact
          label="Load description"
          value={order.load_type || 'Truck plan'}
          minWidth={220}
          maxWidth={480}
          tooltip={order.load_type ? `${order.load_type} (opens the Truck Plan)` : 'Opens the Truck Plan'}
          onClick={openPlan}
          href={openPlan ? undefined : `/inventory/orders/${order.id}`}
        />
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
          value={disputeDue.value}
          tooltip={disputeDue.tooltip}
          valueColor={toneColor(disputeDue.tone)}
          monospace
          minWidth={150}
          maxWidth={200}
        />
        {notFiled && openCloseTruck ? (
          <Tooltip title="A claim is worth filing on this truck and is not filed yet. Opens Close the truck." enterDelay={300}>
            <Button
              size="small"
              color="error"
              variant="outlined"
              onClick={openCloseTruck}
              sx={{ ml: 1, minHeight: 28, py: 0.25, flexShrink: 0, whiteSpace: 'nowrap', fontWeight: 800 }}
            >
              {notFiled}
            </Button>
          </Tooltip>
        ) : null}
        <Box sx={{ flex: 1, minWidth: 8 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
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
          {openCloseTruck ? (
            <Button
              size="small"
              variant="outlined"
              color={truckClosed ? 'success' : 'primary'}
              onClick={openCloseTruck}
              sx={{ minHeight: 28, py: 0.25, whiteSpace: 'nowrap' }}
            >
              {truckClosed ? 'Truck closed' : 'Close the truck'}
            </Button>
          ) : null}
          <Button
            size="small"
            variant="contained"
            color="success"
            disabled={closeLoading || pendingUnits > 0 || orderComplete}
            onClick={onCloseClick}
            sx={{ minHeight: 28, py: 0.25, boxShadow: 'none', '&:hover': { boxShadow: 'none' } }}
          >
            Close PO
          </Button>
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
        hasPlan={summary?.plan != null}
        parts={planParts}
        orderNotes={orderNotes}
        onOpenPlan={openPlan}
      />

      <Box
        sx={{
          display: 'flex',
          width: '100%',
          minHeight: 72,
          overflowX: 'auto',
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
              flex: `${group.metrics.length} 1 0`,
              minWidth: group.metrics.length * 92,
              borderLeft: groupIndex === 0 ? 0 : 2,
              borderColor: processingTokens.borderStrong,
            }}
          >
            <Typography
              sx={{
                px: 1.25,
                pt: 0.4,
                fontSize: '0.56rem',
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
          {openPlan && (selectedMetric?.id === 'paid' || selectedMetric?.id === 'on-track') ? (
            <Button
              size="small"
              sx={{ mt: 1 }}
              onClick={() => {
                setSelectedMetricId(null);
                openPlan();
              }}
            >
              Open the Truck Plan
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
            fontSize: '0.56rem',
            fontWeight: 800,
            letterSpacing: 0.8,
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

/** The Truck Plan in one line, or "No truck plan yet" with a button. It never blocks processing. */
function TruckPlanLine({
  loaded,
  hasPlan,
  parts,
  orderNotes,
  onOpenPlan,
}: {
  loaded: boolean;
  hasPlan: boolean;
  parts: ReturnType<typeof planLineParts>;
  orderNotes: string;
  onOpenPlan?: () => void;
}) {
  const label = (
    <Typography
      sx={{
        flexShrink: 0,
        fontSize: '0.56rem',
        fontWeight: 900,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: processingTokens.textMute,
      }}
    >
      Truck plan
    </Typography>
  );
  const planButton = (text: string) =>
    onOpenPlan ? (
      <Button size="small" variant="outlined" onClick={onOpenPlan} sx={{ minHeight: 22, py: 0, px: 1, fontSize: 12, flexShrink: 0 }}>
        {text}
      </Button>
    ) : null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 30,
        px: 1.25,
        borderBottom: 1,
        borderColor: processingTokens.orderHeaderBorder,
        bgcolor: hasPlan || !loaded ? processingTokens.orderHeaderBg : processingTokens.amberSoft,
        overflow: 'hidden',
      }}
    >
      {label}
      {!loaded ? null : !hasPlan ? (
        <>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>No truck plan yet</Typography>
          {planButton('Make the plan')}
        </>
      ) : parts.length === 0 ? (
        <>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>Nothing written in the plan yet</Typography>
          {planButton('Open the plan')}
        </>
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
              gap: 1.5,
              overflow: 'hidden',
              '&:hover .plan-text': { textDecoration: onOpenPlan ? 'underline' : 'none' },
            }}
          >
            {parts.map((p) => (
              <Typography
                key={p.label}
                noWrap
                sx={{ fontSize: 12.5, minWidth: 0, flex: p.text.length > 30 ? '0 1 auto' : '0 0 auto' }}
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
}: {
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
  const hoverTitle = tooltip || (showFullValueOnHover && value !== '-' ? value : undefined);
  const isInteractive = Boolean((href || onClick) && value !== '-');
  const valueTypography = (
    <Typography
      noWrap
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
        lineHeight: 1.25,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
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
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        justifyContent: 'center',
        height: 34,
        minWidth,
        maxWidth,
        flex: maxWidth > 160 ? '1 1 auto' : undefined,
        px: 1.1,
        borderRight: 1,
        borderColor: 'divider',
        minHeight: 0,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          color: processingTokens.orderHeaderMutedText,
          fontSize: '0.56rem',
          fontWeight: 800,
          letterSpacing: 0.8,
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
        flex: '1 1 0',
        minWidth: 92,
        px: 1.25,
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
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.58rem', fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', lineHeight: 1 }}>
        {metric.label}
      </Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: valueColor, lineHeight: 1.05, mt: 0.25 }}>
        {metric.value}
        {metric.suffix ? (
          <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 11 }}>
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
          fontSize: helperColor ? '0.72rem' : '0.64rem',
          fontWeight: helperColor ? 800 : 400,
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
