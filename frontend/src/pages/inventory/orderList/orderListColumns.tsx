import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import LocalShipping from '@mui/icons-material/LocalShipping';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
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
  if (value == null || value === '') return '—';
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return formatCurrencyWhole(value);
}

function quietItems(n: number | null | undefined): string {
  if (n == null || n === 0) return '—';
  return formatNumber(n);
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
  return map[val] ?? (val ? String(val).toUpperCase() : '—');
}

function statusEligibleForReceiving(status: PurchaseOrderStatus): boolean {
  return !['delivered', 'complete', 'cancelled'].includes(status);
}

function milestoneTooltip(dates: OrderPickerDateFields): string {
  const lines = [
    dates.delivered_date ? `Delivered ${formatOrderPickerDate(dates.delivered_date)}` : null,
    dates.shipped_date ? `Shipped ${formatOrderPickerDate(dates.shipped_date)}` : null,
    dates.paid_date ? `Paid ${formatOrderPickerDate(dates.paid_date)}` : null,
    dates.ordered_date ? `Ordered ${formatOrderPickerDate(dates.ordered_date)}` : null,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : 'No dates';
}

function MoneyCell({
  value,
  emphasize,
}: {
  value: string | null | undefined;
  emphasize?: 'profit' | 'loss' | null;
}) {
  const color =
    emphasize === 'profit' ? 'success.main' : emphasize === 'loss' ? 'error.main' : '#334155';
  return (
    <Typography
      variant="body2"
      sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: emphasize ? 700 : 500, color }}
    >
      {quietCurrency(value)}
    </Typography>
  );
}

/** Prefer full order #; when cramped, collapse the middle (`ABC…XYZ`). */
function MiddleEllipsisOrderNumber({ value }: { value: string }) {
  if (!value) {
    return (
      <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
        —
      </Typography>
    );
  }
  const splitAt = Math.max(6, Math.ceil(value.length * 0.6));
  const head = value.slice(0, splitAt);
  const tail = value.slice(splitAt);
  return (
    <Tooltip title={value}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          maxWidth: '100%',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: '#0f172a',
          fontSize: '0.875rem',
          lineHeight: 1.43,
        }}
      >
        <Box
          component="span"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {head}
        </Box>
        {tail ? (
          <Box component="span" sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            {tail}
          </Box>
        ) : null}
      </Box>
    </Tooltip>
  );
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
      width: 148,
      minWidth: 130,
      sortable: true,
      renderCell: (p: GridRenderCellParams<OrderListRowView>) => (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
            width: '100%',
            height: '100%',
          }}
        >
          <StatusBadge status={p.row.status} size="small" />
          {statusEligibleForReceiving(p.row.status) ? (
            <Tooltip title="Receive shipment">
              <IconButton
                size="small"
                aria-label={`Receive shipment — order ${p.row.order_number}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onReceive(p.row.id);
                }}
                sx={{ flexShrink: 0, p: 0.35 }}
              >
                <LocalShipping fontSize="small" sx={{ color: '#2e7d32' }} />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>
      ),
    },
    {
      field: 'order_number',
      headerName: 'Order #',
      width: 132,
      minWidth: 112,
      sortable: true,
      renderCell: (p: GridRenderCellParams<OrderListRowView>) => (
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', minWidth: 0 }}>
          <MiddleEllipsisOrderNumber value={p.row.order_number || ''} />
        </Box>
      ),
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 2,
      minWidth: compact ? 160 : 240,
      sortable: false,
      renderCell: (p: GridRenderCellParams<OrderListRowView>) => (
        <Tooltip title={p.row.description || ''} disableHoverListener={!p.row.description}>
          <Typography variant="body2" noWrap sx={{ color: '#475569', maxWidth: '100%' }}>
            {p.row.description || '—'}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'dates',
      headerName: 'Dates',
      width: 168,
      minWidth: 150,
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
          <Tooltip title={<Box sx={{ whiteSpace: 'pre-line' }}>{milestoneTooltip(dates)}</Box>}>
            <Box sx={{ lineHeight: 1.25, py: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                {formatRelevantOrderDateLine(dates)}
              </Typography>
              {secondary ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {secondary}
                </Typography>
              ) : null}
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'condition',
      headerName: 'Cond.',
      width: 88,
      minWidth: 72,
      sortable: false,
      renderCell: (p) => (
        <Typography variant="caption" sx={{ letterSpacing: 0.06, fontWeight: 700, color: '#64748b' }}>
          {conditionLabel(p.row.condition)}
        </Typography>
      ),
    },
    {
      field: 'item_count',
      headerName: 'Items',
      width: 78,
      minWidth: 70,
      align: 'right',
      headerAlign: 'right',
      sortable: true,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', color: '#334155' }}>
          {quietItems(p.row.item_count)}
        </Typography>
      ),
    },
    {
      field: 'cost',
      headerName: 'Cost',
      width: 100,
      minWidth: 88,
      align: 'right',
      headerAlign: 'right',
      sortable: true,
      valueGetter: (_v, row) => row.metrics?.cost ?? row.total_cost,
      renderCell: (p) => <MoneyCell value={p.row.metrics?.cost ?? p.row.total_cost} />,
    },
    {
      field: 'retail',
      headerName: 'Retail',
      width: 100,
      minWidth: 88,
      align: 'right',
      headerAlign: 'right',
      sortable: true,
      valueGetter: (_v, row) => row.metrics?.retail ?? row.retail_value,
      renderCell: (p) => <MoneyCell value={p.row.metrics?.retail ?? p.row.retail_value} />,
    },
    {
      field: 'priced',
      headerName: 'Priced',
      width: 100,
      minWidth: 88,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      valueGetter: (_v, row) => row.metrics?.priced ?? null,
      renderCell: (p) => <MoneyCell value={p.row.metrics?.priced} />,
    },
    {
      field: 'sold',
      headerName: 'Sold',
      width: 100,
      minWidth: 88,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      valueGetter: (_v, row) => row.metrics?.sold ?? null,
      renderCell: (p) => <MoneyCell value={p.row.metrics?.sold} />,
    },
    {
      field: 'profit',
      headerName: 'Profit',
      width: 104,
      minWidth: 92,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      valueGetter: (_v, row) => row.metrics?.profit ?? null,
      renderCell: (p) => {
        const raw = p.row.metrics?.profit;
        const n = raw != null ? Number.parseFloat(raw) : NaN;
        const emphasize =
          Number.isNaN(n) || n === 0 ? null : n > 0 ? 'profit' : 'loss';
        return <MoneyCell value={raw} emphasize={emphasize} />;
      },
    },
  ];
}
