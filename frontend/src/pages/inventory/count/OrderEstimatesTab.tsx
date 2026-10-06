/**
 * Order estimates (inventory_effort Phase 6, owner 2026-10-06): per order, what it makes if what this inventory
 * found sells.
 *
 * - **If it all sells** = Sold so far + X% of the tag price of the found items still unsold
 *   (+ the not-found items the owner estimated as back stock, when that switch is on).
 * - **Est. profit** = If it all sells − Cost. **% of cost** = Est. profit ÷ Cost.
 * - Found items that sold since the count are already in Sold, so they are not counted twice.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, CircularProgress, FormControlLabel, Paper, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { apiMessage, getOrderEstimates, type OrderEstimate, type OrderEstimates } from '../../../api/stocktake.api';

const num = (v: string | null | undefined) => (v == null || v === '' ? 0 : Number.parseFloat(v) || 0);
const money = (v: number | null) => (v == null ? '-' : `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
const profitColor = (p: number | null) => (p == null ? 'text.secondary' : p < 0 ? '#b91c1c' : '#15803d');

interface Row extends OrderEstimate {
  left: number;
  ifAllSells: number;
  profit: number;
  profitPct: number | null;
}

function figure(o: OrderEstimate, sellAt: number, withBack: boolean): Row {
  const left = num(o.found.price) + (withBack ? num(o.back_stock.price) : 0);
  const ifAllSells = num(o.sold) + (left * sellAt) / 100;
  const profit = ifAllSells - num(o.cost);
  return { ...o, left, ifAllSells, profit, profitPct: num(o.cost) ? Math.round((100 * profit) / num(o.cost)) : null };
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Box sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 2, minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
      <Typography noWrap sx={{ fontSize: 19, fontWeight: 900, lineHeight: 1.25, color, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{sub}</Typography>}
    </Box>
  );
}

export default function OrderEstimatesTab({ countId }: { countId: number }) {
  const navigate = useNavigate();
  const [data, setData] = useState<OrderEstimates | null>(null);
  const [error, setError] = useState('');
  const [sellAt, setSellAt] = useState(100);
  const [custom, setCustom] = useState('');
  const [withBack, setWithBack] = useState(false);

  useEffect(() => {
    setData(null);
    getOrderEstimates(countId)
      .then(setData)
      .catch((e) => setError(apiMessage(e, 'Could not load the order estimates.')));
  }, [countId]);

  const rows = useMemo(() => (data ? data.orders.map((o) => figure(o, sellAt, withBack)) : []), [data, sellAt, withBack]);
  const total = useMemo(() => {
    const t = { cost: 0, sold: 0, found: 0, foundN: 0, back: 0, backN: 0, ifAllSells: 0, profit: 0 };
    for (const r of rows) {
      t.cost += num(r.cost);
      t.sold += num(r.sold);
      t.found += num(r.found.price);
      t.foundN += r.found.n;
      t.back += num(r.back_stock.price);
      t.backN += r.back_stock.n;
      t.ifAllSells += r.ifAllSells;
      t.profit += r.profit;
    }
    return t;
  }, [rows]);

  const columns = useMemo<GridColDef<Row>[]>(() => {
    const moneyCol = (field: keyof Row | string, headerName: string, get: (r: Row) => number, description: string, extra: Partial<GridColDef<Row>> = {}): GridColDef<Row> => ({
      field: String(field),
      headerName,
      description,
      width: 120,
      type: 'number',
      valueGetter: (_v, r) => get(r),
      renderCell: (p) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(get(p.row))}</span>,
      ...extra,
    });
    const cols: GridColDef<Row>[] = [
      { field: 'order_number', headerName: 'Order', flex: 1, minWidth: 160 },
      { field: 'vendor', headerName: 'Vendor', width: 90 },
      { field: 'ordered_date', headerName: 'Ordered', width: 105 },
      moneyCol('cost', 'Cost', (r) => num(r.cost), 'What the order cost, landed.'),
      moneyCol('sold', 'Sold so far', (r) => num(r.sold), 'Everything from this order sold so far, after discounts.'),
      {
        field: 'found_n',
        headerName: 'Found',
        description: 'Items this inventory found that are still unsold.',
        width: 90,
        type: 'number',
        valueGetter: (_v, r) => r.found.n,
      },
      moneyCol('found_price', 'Found at price', (r) => num(r.found.price), "Today's tag price of the found items still unsold."),
    ];
    if (withBack) {
      cols.push(
        { field: 'back_n', headerName: 'Back stock', description: 'Not found, estimated as back stock (Shrinkage tab).', width: 100, type: 'number', valueGetter: (_v, r) => r.back_stock.n },
        moneyCol('back_price', 'Back stock at price', (r) => num(r.back_stock.price), "Today's tag price of the back stock estimates.", { width: 140 }),
      );
    }
    cols.push(
      moneyCol('ifAllSells', 'If it all sells', (r) => r.ifAllSells, `Sold so far + ${sellAt}% of what is left.`, { width: 130 }),
      moneyCol('profit', 'Est. profit', (r) => r.profit, 'If it all sells − Cost.', {
        renderCell: (p) => <span style={{ fontWeight: 800, color: p.row.profit < 0 ? '#b91c1c' : '#15803d', fontVariantNumeric: 'tabular-nums' }}>{money(p.row.profit)}</span>,
      }),
      {
        field: 'profitPct',
        headerName: '% of cost',
        description: 'Est. profit ÷ Cost.',
        width: 95,
        type: 'number',
        valueGetter: (_v, r) => r.profitPct,
        renderCell: (p) => (p.row.profitPct == null ? '-' : `${p.row.profitPct}%`),
      },
    );
    return cols;
  }, [sellAt, withBack]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  const totalPct = total.cost ? Math.round((100 * total.profit) / total.cost) : null;

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap gap={1.25} sx={{ mb: 1.5 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          What the count found sells at
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={[100, 50].includes(sellAt) ? sellAt : 'custom'}
          onChange={(_e, v: number | 'custom' | null) => {
            if (v == null || v === 'custom') return;
            setCustom('');
            setSellAt(v);
          }}
          aria-label="Sell at"
        >
          <ToggleButton value={100} sx={{ textTransform: 'none', fontWeight: 700 }}>
            100%
          </ToggleButton>
          <ToggleButton value={50} sx={{ textTransform: 'none', fontWeight: 700 }}>
            50%
          </ToggleButton>
        </ToggleButtonGroup>
        <TextField
          size="small"
          label="Custom %"
          value={custom || ([100, 50].includes(sellAt) ? '' : String(sellAt))}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9.]/g, '');
            setCustom(raw);
            const x = Number.parseFloat(raw);
            if (Number.isFinite(x) && x >= 0 && x <= 500) setSellAt(x);
          }}
          sx={{ width: 110 }}
          inputProps={{ inputMode: 'decimal', 'aria-label': 'Custom sell-at percent' }}
        />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          of today&apos;s price.
        </Typography>
        <FormControlLabel
          control={<Switch checked={withBack} onChange={(e) => setWithBack(e.target.checked)} />}
          label={`Add back stock estimates (${data.back_stock_marked.toLocaleString()} items)`}
          sx={{ ml: { md: 1 } }}
        />
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Typography sx={{ fontWeight: 800, mb: 1 }}>Total: {rows.length.toLocaleString()} orders</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(3, minmax(0,1fr))', lg: 'repeat(6, minmax(0,1fr))' }, gap: 1 }}>
          <Tile label="Cost" value={money(total.cost)} />
          <Tile label="Sold so far" value={money(total.sold)} />
          <Tile label="Found, unsold" value={money(total.found)} sub={`${total.foundN.toLocaleString()} items at price`} />
          <Tile label="Back stock" value={withBack ? money(total.back) : 'Off'} sub={withBack ? `${total.backN.toLocaleString()} items at price` : 'switch it on to add'} />
          <Tile label={`If it all sells at ${sellAt}%`} value={money(total.ifAllSells)} />
          <Tile label="Est. profit" value={money(total.profit)} sub={totalPct != null ? `${totalPct}% of cost` : undefined} color={profitColor(total.profit)} />
        </Box>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>
          Found = items this inventory counted that are still unsold. Items it found that sold since are in Sold so far.
          {data.no_order.n ? ` ${data.no_order.n.toLocaleString()} found items have no order (${money(num(data.no_order.price))} at price) and are left out.` : ''}
        </Typography>
      </Paper>

      <Box sx={{ height: 640, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          density="compact"
          disableRowSelectionOnClick
          initialState={{ sorting: { sortModel: [{ field: 'found_price', sort: 'desc' }] } }}
          onRowClick={(p) => navigate(`/inventory/orders/${p.row.id}`)}
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>
    </Box>
  );
}
