import { useEffect, useMemo, useState } from 'react';
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
import Close from '@mui/icons-material/Close';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import { Link as RouterLink } from 'react-router-dom';
import type { ProcessingWorkspaceOrderDTO, ProcessingWorkspaceRollupsDTO } from '../../../types/inventory.types';
import { formatCurrency } from '../../../utils/format';
import { processingTokens } from './processingTokens';

export interface ProcessingWorkspaceOrderPickRow {
  id: number;
  order_number: string;
  vendor_name: string;
  item_count?: number;
  ordered_date?: string | null;
  delivered_date?: string | null;
}

type MetricTone = 'default' | 'good' | 'warning' | 'error';

interface HeaderMetric {
  id: string;
  label: string;
  value: string;
  suffix?: string;
  helper: string;
  detail: string[];
  tone?: MetricTone;
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

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatCompactDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

function formatDeliveredPickerDate(value: string | null | undefined): string {
  if (!value) return '—';
  return formatCompactDate(value);
}

function formatOrderedDeliveredDates(order: ProcessingWorkspaceOrderDTO): string {
  const ordered = formatCompactDate(order.ordered_date);
  const delivered = formatCompactDate(order.delivered_date || order.expected_delivery);
  return `${ordered} · ${delivered}`;
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addBusinessDaysToDate(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return result;
}

function businessDaysUntilDeadline(deadline: Date, from = new Date()): number {
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  if (fromDay.getTime() === toDay.getTime()) return 0;
  if (fromDay.getTime() > toDay.getTime()) {
    let count = 0;
    const cursor = new Date(toDay);
    while (cursor < fromDay) {
      cursor.setDate(cursor.getDate() + 1);
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) count += 1;
    }
    return -count;
  }
  let count = 0;
  const cursor = new Date(fromDay);
  while (cursor < toDay) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

function formatDisputeDeadline(value: string | null | undefined): { value: string; tooltip: string } {
  const delivered = parseDateOnly(value);
  if (!delivered) return { value: '-', tooltip: '' };

  const deadlineDate = addBusinessDaysToDate(delivered, 4);
  const dateStr = formatDate(deadlineDate.toISOString().slice(0, 10));
  const daysLeft = businessDaysUntilDeadline(deadlineDate);

  let daysLabel: string;
  if (daysLeft > 1) daysLabel = `${daysLeft} days left`;
  else if (daysLeft === 1) daysLabel = '1 day left';
  else if (daysLeft === 0) daysLabel = 'Today';
  else daysLabel = 'Closed';

  const tooltip =
    daysLeft >= 0
      ? `${dateStr} — ${daysLeft} business day${daysLeft === 1 ? '' : 's'} remaining (delivery + 4 business days).`
      : `${dateStr} — dispute window closed.`;

  return { value: `${dateStr} · ${daysLabel}`, tooltip };
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
  rollups?: ProcessingWorkspaceRollupsDTO;
  addItemVisible?: boolean;
  onAddItem?: () => void;
  pendingUnits: number;
  orderComplete: boolean;
  closeLoading: boolean;
  onCloseClick: () => void;
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
  rollups,
  addItemVisible,
  onAddItem,
  pendingUnits,
  orderComplete,
  closeLoading,
  onCloseClick,
}: ProcessingWorkspaceHeaderProps) {
  const sessionStartRef = useState(() => Date.now())[0];
  const [, tick] = useState(0);
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);
  const [orderAnchorEl, setOrderAnchorEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => tick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const disp = hasManifestRows && manifestTotalQty > 0 ? manifestDispositioned : itemTotal > 0 ? itemDispositioned : 0;
  const tot = hasManifestRows && manifestTotalQty > 0 ? manifestTotalQty : itemTotal > 0 ? itemTotal : 0;
  const pct = tot > 0 ? Math.round((100 * disp) / tot) : 0;
  const elapsedMs = Date.now() - sessionStartRef;
  const elapsedHours = Math.max(elapsedMs / 3600000, 1 / 3600);
  const itemsPerHour = Math.round(sessionCheckInCount / elapsedHours);
  const disputeDeadline = formatDisputeDeadline(order.delivered_date || order.expected_delivery);

  const metrics = useMemo<HeaderMetric[]>(() => {
    const expected = rollups?.expected_qty ?? tot;
    const done = rollups?.dispositioned_qty ?? disp;
    const remaining = rollups?.remaining_qty ?? Math.max(0, expected - done);
    const overage = rollups?.overage_qty ?? 0;
    const onShelfValue = rollups?.on_shelf_value;
    const soldValue = rollups?.sold_value;

    return [
      {
        id: 'progress',
        label: 'Done',
        value: `${pct}%`,
        helper: `${fmtQty(done)} / ${fmtQty(expected)} units`,
        tone: pct >= 100 ? 'good' : pct >= 60 ? 'default' : 'warning',
        detail: [
          `Manifest basis: ${hasManifestRows ? 'manifest rows' : 'item records'}`,
          `Dispositioned units: ${fmtQty(done)}`,
          `Expected units: ${fmtQty(expected)}`,
          `Remaining units: ${fmtQty(remaining)}`,
        ],
      },
      {
        id: 'remaining',
        label: 'Left',
        value: fmtQty(remaining),
        helper: overage > 0 ? `Overage +${fmtQty(overage)}` : 'Units left',
        tone: remaining > 0 ? 'warning' : 'good',
        detail: [`Remaining units: ${fmtQty(remaining)}`, `Overage units: ${fmtQty(overage)}`],
      },
      {
        id: 'shelf',
        label: 'On shelf',
        value: fmtMoney(onShelfValue),
        helper: 'Checked-in shelf value',
        tone: onShelfValue ? 'good' : 'default',
        detail: [`On-shelf value: ${fmtMoney(onShelfValue)}`, `Sold value: ${fmtMoney(soldValue)}`],
      },
      {
        id: 'sold',
        label: 'Sold',
        value: fmtQty(rollups?.sold_qty ?? 0),
        helper: fmtMoney(soldValue),
        detail: [`Sold units: ${fmtQty(rollups?.sold_qty ?? 0)}`, `Sold value: ${fmtMoney(soldValue)}`],
      },
      {
        id: 'rate',
        label: 'Rate',
        value: String(itemsPerHour),
        suffix: '/hr',
        helper: `${sessionCheckInCount} this session`,
        tone: itemsPerHour >= 100 ? 'good' : sessionCheckInCount > 0 ? 'warning' : 'default',
        detail: [`Session check-ins: ${fmtQty(sessionCheckInCount)}`, `Session elapsed: ${fmtElapsed(elapsedMs)}`, 'Target: 100 items/hr'],
      },
      {
        id: 'elapsed',
        label: 'Elapsed',
        value: fmtElapsed(elapsedMs),
        helper: 'Current session',
        detail: [`Started when this page loaded.`, `Session check-ins: ${fmtQty(sessionCheckInCount)}`],
      },
    ];
  }, [disp, elapsedMs, hasManifestRows, itemsPerHour, pct, rollups, sessionCheckInCount, tot]);

  const selectedMetric = metrics.find((m) => m.id === selectedMetricId);

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
          onOpen={(el) => setOrderAnchorEl(el)}
        />
        <OrderFact label="Vendor" value={order.vendor || order.vendor_code || '-'} />
        <OrderFact
          label="Load description"
          value={order.load_type || '-'}
          minWidth={260}
          maxWidth={480}
          showFullValueOnHover
          href={order.load_type ? `/inventory/orders/${order.id}` : undefined}
        />
        <OrderFact
          label="Ordered · Delivered"
          value={formatOrderedDeliveredDates(order)}
          monospace
          minWidth={132}
          maxWidth={176}
        />
        <OrderFact
          label="Last day to dispute"
          value={disputeDeadline.value}
          tooltip={disputeDeadline.tooltip}
          monospace
          minWidth={150}
          maxWidth={220}
        />
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
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0.35, py: 1, px: 1.5 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5, width: '100%' }}>
              <Typography sx={{ fontFamily: processingTokens.monoFontFamily, fontSize: 12, fontWeight: 800 }}>
                {option.order_number}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                {option.item_count != null ?
                  `${new Intl.NumberFormat().format(option.item_count)} item${option.item_count === 1 ? '' : 's'}`
                : '— items'}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', lineHeight: 1.25 }}>
              Ordered {formatCompactDate(option.ordered_date)} · Delivered {formatDeliveredPickerDate(option.delivered_date)}
            </Typography>
          </MenuItem>
        ))}
      </Menu>

      <Box
        sx={{
          display: 'flex',
          width: '100%',
          minHeight: 58,
          overflowX: 'auto',
          bgcolor: processingTokens.statsHeaderBg,
          color: processingTokens.statsHeaderText,
        }}
      >
        {metrics.map((metric, index) => (
          <StatBlock key={metric.id} metric={metric} first={index === 0} onClick={() => setSelectedMetricId(metric.id)} />
        ))}
      </Box>

      <Dialog open={Boolean(selectedMetric)} onClose={() => setSelectedMetricId(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 800 }}>
              Processing stat
            </Typography>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              {selectedMetric?.label}
            </Typography>
          </Box>
          <IconButton aria-label="Close stat detail" onClick={() => setSelectedMetricId(null)}>
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
        </DialogContent>
      </Dialog>
    </Box>
  );
}

function OrderSelectorCell({
  orderNumber,
  onOpen,
}: {
  orderNumber: string;
  onOpen: (el: HTMLElement) => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      sx={{
        appearance: 'none',
        border: 0,
        borderRight: 1,
        borderColor: processingTokens.orderHeaderBorder,
        bgcolor: 'transparent',
        cursor: 'pointer',
        height: 34,
        px: 1.25,
        mr: 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        minWidth: 150,
        textAlign: 'left',
        color: 'text.primary',
        transition: (theme) => theme.transitions.create('background-color'),
        '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
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
        <Typography sx={{ fontFamily: processingTokens.monoFontFamily, fontSize: 13, fontWeight: 900, lineHeight: 1.2 }} noWrap>
          {orderNumber}
        </Typography>
      </Box>
      <KeyboardArrowDown sx={{ fontSize: 16, color: processingTokens.orderHeaderMutedText }} />
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
}: {
  label: string;
  value: string;
  monospace?: boolean;
  minWidth?: number;
  maxWidth?: number;
  showFullValueOnHover?: boolean;
  tooltip?: string;
  href?: string;
}) {
  const hoverTitle = tooltip ?? (showFullValueOnHover && value !== '-' ? value : undefined);
  const valueTypography = (
    <Typography
      noWrap
      component={href && value !== '-' ? RouterLink : 'span'}
      {...(href && value !== '-' ? { to: href } : {})}
      sx={{
        display: 'block',
        fontSize: 12.5,
        fontWeight: 700,
        fontFamily: monospace ? processingTokens.monoFontFamily : undefined,
        lineHeight: 1.25,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        color: href && value !== '-' ? 'primary.main' : processingTokens.orderHeaderText,
        ...(href && value !== '-' ?
          {
            textDecoration: 'none',
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
  const toneColor =
    metric.tone === 'good' ? processingTokens.accentGreen
    : metric.tone === 'warning' ? processingTokens.accentAmber
    : metric.tone === 'error' ? processingTokens.accentRed
    : processingTokens.statsHeaderText;

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        appearance: 'none',
        border: 0,
        borderLeft: first ? 0 : 1,
        borderBottom: 1,
        borderColor: processingTokens.statsHeaderBorder,
        bgcolor: 'transparent',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        flex: '1 0 112px',
        minWidth: 104,
        px: 1.25,
        py: 0.85,
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
              bgcolor:
                metric.tone === 'good' ? processingTokens.accentGreen
                : metric.tone === 'warning' ? processingTokens.accentAmber
                : processingTokens.accentRed,
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
      <Typography sx={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: toneColor, lineHeight: 1.05, mt: 0.25 }}>
        {metric.value}
        {metric.suffix ? (
          <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 11 }}>
            {metric.suffix}
          </Typography>
        ) : null}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.2, maxWidth: 132, fontSize: '0.64rem' }}>
        {metric.helper}
      </Typography>
    </Box>
  );
}
