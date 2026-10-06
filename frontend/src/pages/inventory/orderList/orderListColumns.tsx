import type { ReactNode } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import LocalShipping from '@mui/icons-material/LocalShipping';
import type {
  GridColDef,
  GridColumnVisibilityModel,
  GridRenderCellParams,
} from '@mui/x-data-grid';
import { StatusBadge } from '../../../components/common/StatusBadge';
import {
  formatOrderPickerDate,
  formatRelevantOrderDateLine,
  pickMostRelevantOrderDate,
  type OrderPickerDateFields,
} from '../../../utils/orderPickerDisplay';
import { formatCurrencyWhole, formatNumber } from '../../../utils/format';
import type {
  PurchaseOrderCondition,
  PurchaseOrderFinancialMetrics,
  PurchaseOrderListRow,
  PurchaseOrderStatus,
} from '../../../types/inventory.types';

export type OrderListRowView = PurchaseOrderListRow & {
  metrics?: PurchaseOrderFinancialMetrics | null;
};

function quietCurrency(value: string | null | undefined): string {
  if (value == null || value === '') return '-';
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return '-';
  return formatCurrencyWhole(value);
}

function quietItems(n: number | null | undefined): string {
  if (n == null || n === 0) return '-';
  return formatNumber(n);
}

function parseMoney(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

/** Zero/empty money reads as noise on a two-line cell - drop the whole line. */
function hasMoney(value: string | null | undefined): boolean {
  const n = parseMoney(value);
  return n != null && n !== 0;
}

function pctOf(part: number | null, whole: number | null): string | null {
  if (part == null || whole == null || whole === 0) return null;
  const pct = Math.round((part / whole) * 100);
  return `${pct}%`;
}

function pctRatio(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null || whole === 0) return null;
  return (part / whole) * 100;
}

function numberOrNull(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function wholeMoney(value: string | null | undefined): string {
  return value == null || value === '' ? '-' : formatCurrencyWhole(value);
}

/** A small warning mark in front of a number that is missing or doubtful (the tooltip says why). */
function FlagMark() {
  return (
    <Box component="span" aria-label="Check this number" sx={{ color: '#b45309', fontWeight: 900, mr: 0.4 }}>
      !
    </Box>
  );
}

type CoverageStyle = {
  color: string;
  fontWeight: number;
};

/**
 * Share of the manifest (processed, or approved retail): near 100% is normal.
 * Thresholds: &lt;75 → &lt;85 → &lt;90 → &lt;95 → &lt;100 green → 100%+ bright green.
 */
function coverageStyle(pct: number | null): CoverageStyle {
  if (pct == null) return { color: '#64748b', fontWeight: 600 };
  if (pct < 75) return { color: '#991b1b', fontWeight: 600 };
  if (pct < 85) return { color: '#c2410c', fontWeight: 600 };
  if (pct < 90) return { color: '#b45309', fontWeight: 600 };
  if (pct < 95) return { color: '#a16207', fontWeight: 600 };
  if (pct < 100) return { color: '#166534', fontWeight: 700 };
  return { color: '#16a34a', fontWeight: 800 };
}

/**
 * Recovery vs cost (expected on Cost, actual on Profit) - 100% is break-even.
 * &lt;100 dark red → 150 warm → 200 dark green → 250+ super green.
 */
function recoveryStyle(pct: number | null): CoverageStyle {
  if (pct == null) return { color: '#64748b', fontWeight: 600 };
  if (pct < 100) return { color: '#7f1d1d', fontWeight: 700 };
  if (pct < 150) return { color: '#9a3412', fontWeight: 700 };
  if (pct < 200) return { color: '#a16207', fontWeight: 700 };
  if (pct < 250) return { color: '#14532d', fontWeight: 800 };
  return { color: '#16a34a', fontWeight: 900 };
}

/** Primary-line colors so the money columns read as a progression: spend → potential → tagged → realized. */
const MONEY_COLOR = {
  cost: '#7f1d1d',
  retail: '#0f172a',
  priced: '#14532d',
  sold: '#22a35a',
} as const;

/**
 * Column widths are sized to worst-case content at 0.875rem with tabular
 * numerals, so digits never reflow: `$722,476` over `$268,449 (100%)` is the
 * widest money cell, `PAID · Jul 29, 2026` the widest date.
 *
 * Fixed total (with checkbox) ≈ 1115px. Description is the only `flex` column
 * and absorbs the remainder, so the money columns stay pinned right. Breakpoints
 * in `OrderListPage` drop Priced below ~1300px and Sold below ~1100px to keep
 * `fixed + descriptionMin` under the viewport instead of scrolling sideways.
 */
const W = {
  status: 126,
  orderNumber: 130,
  descriptionMin: 180,
  descriptionMinCompact: 132,
  dates: 146,
  items: 74,
  cost: 122,
  retail: 148,
  priced: 140,
  sold: 150,
  profit: 122,
} as const;

const CHECKBOX_W = 50;

/** Order in which money columns give up their space when the grid is too narrow. */
const DROP_ORDER = ['priced', 'sold', 'retail', 'profit', 'cost'] as const;

/** Description switches to its tighter floor once the grid gets small. */
export function orderListIsCompact(gridWidth: number): boolean {
  return gridWidth > 0 && gridWidth < 1040;
}

/**
 * Hide the fewest columns that make the width budget fit `gridWidth`.
 *
 * Measured container width beats viewport media queries here: the staff sidebar
 * and the browser window both change how much room the grid actually has.
 */
export function orderListColumnVisibility(gridWidth: number): GridColumnVisibilityModel {
  const model: GridColumnVisibilityModel = {};
  if (gridWidth <= 0) return model;

  const descriptionMin = orderListIsCompact(gridWidth)
    ? W.descriptionMinCompact
    : W.descriptionMin;
  let needed =
    CHECKBOX_W +
    W.status +
    W.orderNumber +
    descriptionMin +
    W.dates +
    W.items +
    W.cost +
    W.retail +
    W.priced +
    W.sold +
    W.profit;

  for (const field of DROP_ORDER) {
    if (needed <= gridWidth) break;
    model[field] = false;
    needed -= W[field];
  }
  return model;
}

function conditionLabel(val: PurchaseOrderCondition | string): string {
  const map: Record<string, string> = {
    new: 'NEW',
    like_new: 'LIKE NEW',
    good: 'GOOD',
    fair: 'FAIR',
    salvage: 'SALV',
    mixed: 'MIXED',
  };
  return map[val] ?? (val ? String(val).toUpperCase() : '-');
}

function statusEligibleForReceiving(status: PurchaseOrderStatus): boolean {
  return !['delivered', 'complete', 'cancelled'].includes(status);
}

function TwoLineCell({
  primary,
  secondary,
  emphasize,
  align = 'left',
  primaryColor,
  secondaryStyle,
}: {
  primary: ReactNode;
  secondary?: ReactNode | null;
  emphasize?: 'profit' | 'loss' | null;
  align?: 'left' | 'right';
  primaryColor?: string;
  secondaryStyle?: CoverageStyle | null;
}) {
  const color =
    primaryColor ??
    (emphasize === 'profit' ? 'success.main' : emphasize === 'loss' ? 'error.main' : '#0f172a');
  const sec = secondaryStyle ?? { color: '#64748b', fontWeight: 600 };
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 0.15,
        lineHeight: 1.2,
        py: 0.5,
        width: '100%',
        textAlign: align,
        minWidth: 0,
      }}
    >
      <Typography
        variant="body2"
        component="div"
        sx={{
          fontWeight: emphasize ? 700 : 600,
          color,
          fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.25,
        }}
      >
        {primary}
      </Typography>
      {secondary ? (
        <Typography
          variant="caption"
          component="div"
          sx={{
            display: 'block',
            fontVariantNumeric: 'tabular-nums',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: sec.fontWeight,
            color: sec.color,
            lineHeight: 1.2,
          }}
        >
          {secondary}
        </Typography>
      ) : null}
    </Box>
  );
}

function MoneyCell({
  value,
  emphasize,
}: {
  value: string | null | undefined;
  emphasize?: 'profit' | 'loss' | null;
}) {
  return (
    <TwoLineCell primary={quietCurrency(value)} emphasize={emphasize} align="right" />
  );
}

/** Trailing tag naming the ratio on a secondary line: REC, PRC, MFT. */
function MetricTag({ label }: { label: string }) {
  return (
    <Box
      component="span"
      sx={{ ml: 0.4, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.04em', opacity: 0.7 }}
    >
      {label}
    </Box>
  );
}

/**
 * Order numbers are long and middle-heavy (`TRGET-ORD-G511`). Keep the vendor
 * prefix and the unique tail: segments before the first dash and after the last,
 * or first 3 / last 4 characters when there is no dash to split on.
 */
export function abbreviateOrderNumber(value: string): string {
  const text = value.trim();
  if (!text) return '';
  const parts = text.split('-').filter(Boolean);
  if (parts.length >= 3) return `${parts[0]}…${parts[parts.length - 1]}`;
  if (parts.length === 2) return text;
  if (text.length <= 7) return text;
  return `${text.slice(0, 3)}…${text.slice(-4)}`;
}

function OrderNumberCell({ value }: { value: string }) {
  return (
    <Typography
      variant="body2"
      noWrap
      sx={{
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        color: '#0f172a',
        lineHeight: 1.25,
      }}
    >
      {abbreviateOrderNumber(value) || '-'}
    </Typography>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-08` → `EXP · Oct 8` (the line under the status; null when there is no date). */
export function expectedLine(value: string | null | undefined): string | null {
  const m = (value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `EXP · ${month} ${Number(m[3])}` : null;
}

function orderSecondaryLine(row: OrderListRowView): string | null {
  const vendor = (row.vendor_name || '').trim();
  const cond = row.condition ? conditionLabel(row.condition) : '';
  if (vendor && cond && cond !== '-') return `${vendor} · ${cond}`;
  if (vendor) return vendor;
  if (cond && cond !== '-') return cond;
  return null;
}

export function buildOrderListColumns(opts: {
  onReceive: (orderId: number) => void;
  compact?: boolean;
}): GridColDef<OrderListRowView>[] {
  const { onReceive, compact } = opts;
  return [
    {
      field: 'status',
      headerName: 'Status',
      width: W.status,
      minWidth: W.status,
      flex: 0,
      sortable: true,
      renderCell: (p: GridRenderCellParams<OrderListRowView>) => {
        const expected = expectedLine(p.row.expected_delivery);
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, width: '100%', height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, minHeight: 26 }}>
              <StatusBadge status={p.row.status} size="small" />
              {statusEligibleForReceiving(p.row.status) ? (
                <IconButton
                  size="small"
                  aria-label={`Receive shipment - order ${p.row.order_number}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReceive(p.row.id);
                  }}
                  sx={{ flexShrink: 0, p: 0.35 }}
                >
                  <LocalShipping fontSize="small" sx={{ color: '#2e7d32' }} />
                </IconButton>
              ) : null}
            </Box>
            {expected ? (
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                title={`Expected delivery ${p.row.expected_delivery}`}
                sx={{ display: 'block', lineHeight: 1.2, mt: 0.25, pl: 0.25, fontWeight: 600, letterSpacing: '0.02em' }}
              >
                {expected}
              </Typography>
            ) : null}
          </Box>
        );
      },
    },
    {
      field: 'order_number',
      headerName: 'Order #',
      width: W.orderNumber,
      minWidth: W.orderNumber,
      flex: 0,
      sortable: true,
      renderCell: (p: GridRenderCellParams<OrderListRowView>) => {
        const secondary = orderSecondaryLine(p.row);
        return (
          <Tooltip title={p.row.order_number || ''} disableHoverListener={!p.row.order_number}>
            <Box sx={{ width: '100%', minWidth: 0 }}>
              <OrderNumberCell value={p.row.order_number || ''} />
              {secondary ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  noWrap
                  sx={{ display: 'block', lineHeight: 1.2 }}
                >
                  {secondary}
                </Typography>
              ) : null}
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 1,
      minWidth: compact ? W.descriptionMinCompact : W.descriptionMin,
      sortable: false,
      renderCell: (p: GridRenderCellParams<OrderListRowView>) => {
        const desc = p.row.description || '';
        return (
          <Tooltip title={desc} disableHoverListener={!desc}>
            <Typography
              variant="body2"
              sx={{
                color: '#475569',
                width: '100%',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                // DataGrid cells are nowrap by default, which defeats line clamping.
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                lineHeight: 1.3,
              }}
            >
              {desc || '-'}
            </Typography>
          </Tooltip>
        );
      },
    },
    {
      field: 'dates',
      headerName: 'Dates',
      width: W.dates,
      minWidth: W.dates,
      flex: 0,
      sortable: false,
      renderCell: (p: GridRenderCellParams<OrderListRowView>) => {
        const dates: OrderPickerDateFields = {
          delivered_date: p.row.delivered_date,
          shipped_date: p.row.shipped_date,
          paid_date: p.row.paid_date,
          ordered_date: p.row.ordered_date,
        };
        const primary = pickMostRelevantOrderDate(dates);
        const secondary =
          primary?.shortLabel !== 'ORD' && dates.ordered_date
            ? `ORD · ${formatOrderPickerDate(dates.ordered_date)}`
            : null;
        return (
          <TwoLineCell primary={formatRelevantOrderDateLine(dates)} secondary={secondary} />
        );
      },
    },
    {
      field: 'item_count',
      headerName: 'Items',
      width: W.items,
      minWidth: W.items,
      flex: 0,
      align: 'right',
      headerAlign: 'right',
      sortable: true,
      renderCell: (p) => {
        const pallets = p.row.pallet_count;
        const palSecondary =
          pallets != null && pallets > 0
            ? `${formatNumber(pallets)} pal`
            : null;
        return (
          <TwoLineCell
            primary={quietItems(p.row.item_count)}
            secondary={palSecondary}
            align="right"
          />
        );
      },
    },
    {
      field: 'cost',
      headerName: 'Cost',
      description: 'Total cost: price + fees + shipping. Under it: recovery expected, the starting price of everything checked in ÷ total cost.',
      width: W.cost,
      minWidth: W.cost,
      flex: 0,
      align: 'right',
      headerAlign: 'right',
      sortable: true,
      valueGetter: (_v, row) => row.metrics?.cost ?? row.total_cost,
      renderCell: (p) => {
        const m = p.row.metrics;
        const cost = m?.cost ?? p.row.total_cost;
        const rec = numberOrNull(m?.recovery_expected);
        return (
          <Tooltip title={rec != null ? `Recovery expected: ${rec}% (starting price ÷ total cost)` : ''}>
            <Box sx={{ width: '100%' }}>
              <TwoLineCell
                primary={quietCurrency(cost)}
                secondary={rec != null ? `${rec}% recovery` : null}
                primaryColor={MONEY_COLOR.cost}
                secondaryStyle={recoveryStyle(rec)}
                align="right"
              />
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'retail',
      headerName: 'Retail',
      description: 'Total retail from the manifest. Under it: the manifest retail of the items checked in from it (not disputed), and its % of the manifest.',
      width: W.retail,
      minWidth: W.retail,
      flex: 0,
      align: 'right',
      headerAlign: 'right',
      sortable: true,
      valueGetter: (_v, row) => row.metrics?.manifest_retail ?? row.retail_value,
      renderCell: (p) => {
        const m = p.row.metrics;
        if (!m) return <TwoLineCell primary={quietCurrency(p.row.retail_value)} align="right" />;
        const flagged = m.flags.includes('manifest_mismatch') || m.flags.includes('no_manifest') || m.flags.includes('manifest_without_retail');
        const tip = [
          m.manifest_retail != null ? `Manifest total ${wholeMoney(m.manifest_retail)}` : 'No manifest retail on this order',
          m.listing_retail != null ? `listing ${wholeMoney(m.listing_retail)}` : 'no listing retail',
        ].join(', ') + (m.flags.includes('manifest_mismatch') ? '. They differ by more than 2%.' : '.')
          + (m.retail_processed != null ? ` Processed from the manifest: ${wholeMoney(m.retail_processed)} (${m.retail_processed_pct ?? '-'}%).` : '');
        return (
          <Tooltip title={tip}>
            <Box sx={{ width: '100%' }}>
              <TwoLineCell
                primary={
                  <>
                    {flagged && <FlagMark />}
                    {m.manifest_retail != null ? quietCurrency(m.manifest_retail) : '-'}
                  </>
                }
                secondary={m.retail_processed != null ? `${quietCurrency(m.retail_processed)} · ${m.retail_processed_pct ?? '-'}%` : null}
                primaryColor={MONEY_COLOR.retail}
                secondaryStyle={coverageStyle(numberOrNull(m.retail_processed_pct))}
                align="right"
              />
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'priced',
      headerName: 'Priced',
      description: 'Priced (starting): the price at check-in of everything checked in, extras included. Under it: the approved retail of everything checked in ÷ the manifest total (near 100% is normal).',
      width: W.priced,
      minWidth: W.priced,
      flex: 0,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      valueGetter: (_v, row) => row.metrics?.priced_start ?? null,
      renderCell: (p) => {
        const m = p.row.metrics;
        const pct = numberOrNull(m?.approved_pct_of_manifest);
        const tip = m
          ? `Starting price of ${formatNumber(m.items_checked_in)} checked-in items: ${wholeMoney(m.priced_start)}. `
            + `Their approved retail: ${wholeMoney(m.approved_retail)}${pct != null ? `, ${pct}% of the manifest` : ''}.`
            + (m.flags.includes('no_price_history') ? ' No price history on these items, so starting = today\'s price.' : '')
            + (m.legacy_unsold ? ` ${m.legacy_unsold.toLocaleString()} old-system items with no recorded sale are left out.` : '')
          : '';
        return (
          <Tooltip title={tip}>
            <Box sx={{ width: '100%' }}>
              <TwoLineCell
                primary={quietCurrency(m?.priced_start)}
                secondary={pct != null ? `${pct}% of manifest` : null}
                primaryColor={MONEY_COLOR.priced}
                secondaryStyle={coverageStyle(pct)}
                align="right"
              />
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'sold',
      headerName: 'Sold',
      description: 'Net sold. Under it: % sold (sold ÷ starting price) and unsold left (today\'s price of items not sold yet, shrink not counted).',
      width: W.sold,
      minWidth: W.sold,
      flex: 0,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      valueGetter: (_v, row) => row.metrics?.sold ?? null,
      renderCell: (p) => {
        const m = p.row.metrics;
        const pct = m?.sold_pct;
        const left = m?.unsold_left;
        const secondary = pct != null || hasMoney(left)
          ? `${pct != null ? `${pct}%` : '-'} · ${hasMoney(left) ? `${quietCurrency(left)} left` : 'none left'}`
          : null;
        return (
          <Tooltip title={m ? `Sold ${wholeMoney(m.sold)}: ${pct ?? '-'}% of the starting price. Unsold left: ${wholeMoney(left)} at today's prices (the most it could still bring in).` : ''}>
            <Box sx={{ width: '100%' }}>
              <TwoLineCell primary={quietCurrency(m?.sold)} secondary={secondary} primaryColor={MONEY_COLOR.sold} align="right" />
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'profit',
      headerName: 'Profit',
      width: W.profit,
      minWidth: W.profit,
      flex: 0,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      valueGetter: (_v, row) => row.metrics?.profit ?? null,
      renderCell: (p) => {
        const raw = p.row.metrics?.profit;
        const sold = p.row.metrics?.sold;
        const n = parseMoney(raw);
        const emphasize =
          n == null || n === 0 ? null : n > 0 ? 'profit' : 'loss';
        // Actual recovery so far, the realized twin of Cost's EST REC.
        const actRatio = hasMoney(sold)
          ? pctRatio(parseMoney(sold), parseMoney(p.row.metrics?.cost ?? p.row.total_cost))
          : null;
        const actPct = actRatio != null ? `${Math.round(actRatio)}%` : null;
        return (
          <TwoLineCell
            primary={quietCurrency(raw)}
            secondary={
              actPct ? (
                <>
                  {actPct}
                  <MetricTag label="ACT REC" />
                </>
              ) : null
            }
            emphasize={emphasize}
            secondaryStyle={recoveryStyle(actRatio)}
            align="right"
          />
        );
      },
    },
  ];
}
