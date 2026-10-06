/**
 * "If it all sells" (inventory_effort Phase 5, owner 2026-10-06): each order's profit if everything still unsold
 * sells at X% of today's price. Same numbers as the Orders page (`purchase_order_financials`), plus:
 *
 * - **Left at X%** = unsold left (today's price of items on the shelf, in processing or returned) × X.
 * - **Est. profit** = Sold + Left at X% − Cost. **% of cost** = Est. profit ÷ Cost.
 */
import { Box, Chip, Paper, Tooltip, Typography } from '@mui/material';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { formatCurrencyWhole } from '../../../utils/format';
import type { OrderListRowView } from './orderListColumns';

const num = (v: string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? null : n;
};
const money = (n: number | null) => (n == null ? '-' : formatCurrencyWhole(String(n)));

export interface ProfitNumbers {
  cost: number | null;
  retail: number | null;
  priced: number | null;
  sold: number | null;
  left: number | null;
  leftAtX: number | null;
  profit: number | null;
  profitPct: number | null;
}

/** The view's numbers from an order's (or a total's) Orders-page numbers. */
export function profitNumbers(
  m: { cost?: string | null; manifest_retail?: string | null; priced_start?: string | null; sold?: string | null; unsold_left?: string | null } | null | undefined,
  sellAt: number,
): ProfitNumbers {
  const cost = num(m?.cost);
  const sold = num(m?.sold) ?? 0;
  const left = num(m?.unsold_left);
  const leftAtX = left == null ? 0 : (left * sellAt) / 100;
  const profit = cost == null ? null : sold + leftAtX - cost;
  return {
    cost,
    retail: num(m?.manifest_retail),
    priced: num(m?.priced_start),
    sold: m ? sold : null,
    left,
    leftAtX: left == null ? null : leftAtX,
    profit,
    profitPct: profit != null && cost ? Math.round((100 * profit) / cost) : null,
  };
}

const profitColor = (p: number | null) => (p == null ? 'text.secondary' : p < 0 ? '#b91c1c' : '#15803d');

function Money({ n, strong, color }: { n: number | null; strong?: boolean; color?: string }) {
  return (
    <Typography component="span" sx={{ fontSize: 13, fontWeight: strong ? 800 : 500, fontVariantNumeric: 'tabular-nums', color }}>
      {money(n)}
    </Typography>
  );
}

export function buildProfitColumns(sellAt: number): GridColDef<OrderListRowView>[] {
  const nums = (row: OrderListRowView) => profitNumbers(row.metrics, sellAt);
  const moneyCol = (field: string, headerName: string, pick: (p: ProfitNumbers) => number | null, description: string, extra: Partial<GridColDef<OrderListRowView>> = {}): GridColDef<OrderListRowView> => ({
    field,
    headerName,
    description,
    width: 112,
    align: 'right',
    headerAlign: 'right',
    sortable: false,
    renderCell: (p: GridRenderCellParams<OrderListRowView>) => <Money n={p.row.metrics ? pick(nums(p.row)) : null} />,
    ...extra,
  });
  return [
    {
      field: 'order_number',
      headerName: 'Order',
      flex: 1,
      minWidth: 220,
      sortable: true,
      renderCell: (p: GridRenderCellParams<OrderListRowView>) => {
        const old = p.row.metrics?.flags.includes('old_system_unsold');
        return (
          <Box sx={{ minWidth: 0, lineHeight: 1.25 }}>
            <Typography noWrap sx={{ fontSize: 13, fontWeight: 700, fontFamily: '"DM Mono", ui-monospace, monospace' }}>
              {p.row.order_number}
              {old && (
                <Tooltip title={`Old system: ${p.row.metrics?.legacy_unsold?.toLocaleString() ?? ''} items have no recorded sale and are left out. Its Sold may be incomplete.`}>
                  <Chip size="small" label="Old system" sx={{ ml: 0.75, height: 18, fontSize: 10 }} />
                </Tooltip>
              )}
            </Typography>
            <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }} title={p.row.description || ''}>
              {p.row.description || p.row.vendor_name}
            </Typography>
          </Box>
        );
      },
    },
    moneyCol('cost', 'Cost', (n) => n.cost, 'Total cost', { sortable: true }),
    moneyCol('retail', 'Retail', (n) => n.retail, 'Manifest total retail'),
    moneyCol('priced', 'Priced', (n) => n.priced, 'Priced (starting): every item checked in, at its price at check-in'),
    moneyCol('sold', 'Sold', (n) => n.sold, 'Net sold so far'),
    moneyCol('left', 'Left now', (n) => n.left, "Today's price of what has not sold (on the shelf, in processing, returned)"),
    moneyCol('left_at_x', `Left at ${sellAt}%`, (n) => n.leftAtX, `What is left, if it sells at ${sellAt}% of today's price`, { width: 120 }),
    {
      field: 'est_profit',
      headerName: 'Est. profit',
      description: `Sold + Left at ${sellAt}% − Cost`,
      width: 120,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      renderCell: (p: GridRenderCellParams<OrderListRowView>) => {
        const n = nums(p.row);
        return <Money n={p.row.metrics ? n.profit : null} strong color={profitColor(n.profit)} />;
      },
    },
    {
      field: 'profit_pct',
      headerName: '% of cost',
      description: 'Est. profit ÷ Cost',
      width: 96,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      renderCell: (p: GridRenderCellParams<OrderListRowView>) => {
        const n = nums(p.row);
        return (
          <Typography component="span" sx={{ fontSize: 13, fontWeight: 700, color: profitColor(n.profit) }}>
            {n.profitPct == null ? '-' : `${n.profitPct}%`}
          </Typography>
        );
      },
    },
  ];
}

/** The Total line: the same numbers over every order in the filter (or the selected ones). */
export function ProfitTotal({ totals, sellAt, label, loading }: { totals: ProfitNumbers | null; sellAt: number; label: string; loading?: boolean }) {
  const cells: [string, number | null, boolean?][] = totals
    ? [
        ['Cost', totals.cost],
        ['Retail', totals.retail],
        ['Priced', totals.priced],
        ['Sold', totals.sold],
        ['Left now', totals.left],
        [`Left at ${sellAt}%`, totals.leftAtX],
        ['Est. profit', totals.profit, true],
      ]
    : [];
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderColor: '#e2e8f0', borderRadius: 2, bgcolor: '#fff' }}>
      <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.75 }}>
        Total · {label}
      </Typography>
      {loading || !totals ? (
        <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>Working it out…</Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', sm: 'repeat(4, minmax(0,1fr))', lg: 'repeat(8, minmax(0,1fr))' }, gap: 1.5 }}>
          {cells.map(([lab, v, strong]) => (
            <Box key={lab}>
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{lab}</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: strong ? 800 : 700, fontVariantNumeric: 'tabular-nums', color: strong ? profitColor(v) : undefined }}>
                {money(v)}
              </Typography>
            </Box>
          ))}
          <Box>
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>% of cost</Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 800, color: profitColor(totals.profit) }}>
              {totals.profitPct == null ? '-' : `${totals.profitPct}%`}
            </Typography>
          </Box>
        </Box>
      )}
    </Paper>
  );
}
