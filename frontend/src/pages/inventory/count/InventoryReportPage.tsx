import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  GlobalStyles,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import Download from '@mui/icons-material/Download';
import Print from '@mui/icons-material/Print';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  apiMessage,
  downloadShrinkCsv,
  getInventoryBreakdown,
  getInventorySummary,
  getPriceHistogram,
  getShrinkList,
  type BreakdownBy,
  type BreakdownRow,
  type InventorySummary,
  type PriceHistogram,
  type ShrinkFilter,
  type ShrinkList,
  type ShrinkRow,
} from '../../../api/stocktake.api';

/** Two series everywhere on this page: counted (slot 1) and not found (slot 2). Pie slices use the fixed order. */
const COUNTED = '#2a78d6';
const NOT_FOUND = '#eb6834';
const SLOTS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'];
const OTHER = '#9e9d97';
const GRID = '#e6e5e0';
const INK2 = '#52514e';

const BY_LABEL: Record<BreakdownBy, string> = {
  category: 'Category',
  subcategory: 'Subcategory',
  vendor: 'Vendor',
  order: 'Order',
  age: 'Time on the shelf',
  pct: 'Price as % of retail',
  price_band: 'Price',
  person: 'Who counted it',
};
/** Ordered dimensions keep their order (and get upright bars); the rest sort biggest first. */
const ORDERED: BreakdownBy[] = ['age', 'pct', 'price_band'];
type Measure = 'n' | 'price' | 'retail';
type Show = 'counted' | 'not_found' | 'both';
const MEASURE_LABEL: Record<Measure, string> = { n: 'Items', price: '$ at price', retail: '$ retail' };

const num = (v: string | number) => (typeof v === 'number' ? v : Number(v));
const money = (v: string | number | null | undefined) =>
  v == null || v === '' ? '-' : `$${num(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmt = (m: Measure, v: number) => (m === 'n' ? v.toLocaleString() : money(v));

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'text.secondary' }} noWrap>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{sub}</Typography>}
    </Paper>
  );
}

/** The items behind a slice or a row: the same list as Not found, for counted or not-found items. */
function ItemsDialog({ countId, title, filter, onClose }: { countId: number; title: string; filter: ShrinkFilter | null; onClose: () => void }) {
  const [paging, setPaging] = useState({ page: 0, pageSize: 50 });
  const [data, setData] = useState<ShrinkList | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => setPaging({ page: 0, pageSize: 50 }), [filter]);
  useEffect(() => {
    if (!filter) return;
    setLoading(true);
    getShrinkList(countId, { ...filter, sort: '-price', page: paging.page + 1, page_size: paging.pageSize })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [countId, filter, paging]);
  const columns: GridColDef<ShrinkRow>[] = [
    { field: 'sku', headerName: 'SKU', width: 118, sortable: false },
    { field: 'title', headerName: 'Item', flex: 1, minWidth: 220, sortable: false },
    { field: 'order', headerName: 'Order', width: 150, sortable: false },
    { field: 'category', headerName: 'Category', width: 160, sortable: false },
    { field: 'price', headerName: 'Price', width: 90, sortable: false, renderCell: (p) => `$${Number(p.row.price).toFixed(2)}` },
    { field: 'retail', headerName: 'Retail', width: 90, sortable: false, renderCell: (p) => (p.row.retail ? `$${Number(p.row.retail).toFixed(2)}` : '-') },
  ];
  return (
    <Dialog open={!!filter} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {title}
        {data && (
          <Typography component="span" sx={{ ml: 1, color: 'text.secondary', fontSize: 14 }}>
            {data.filtered.n.toLocaleString()} items · {money(data.filtered.price)} at price
          </Typography>
        )}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="Close">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
          {filter && (
            <Button size="small" startIcon={<Download />} onClick={() => void downloadShrinkCsv(countId, filter)} sx={{ textTransform: 'none' }}>
              CSV
            </Button>
          )}
        </Stack>
        <Box sx={{ height: 520 }}>
          <DataGrid
            rows={data?.rows ?? []}
            columns={columns}
            loading={loading}
            rowCount={data?.filtered.n ?? 0}
            paginationMode="server"
            paginationModel={paging}
            onPaginationModelChange={setPaging}
            pageSizeOptions={[50, 100]}
            disableColumnMenu
            disableRowSelectionOnClick
            sx={{ border: 0 }}
          />
        </Box>
      </DialogContent>
    </Dialog>
  );
}

/** The breakdown row behind a clicked bar or slice (Recharts hands back the data point as ``payload``). */
const rowOf = (d: unknown): BreakdownRow | null =>
  (d as { payload?: { row?: BreakdownRow } } | undefined)?.payload?.row ?? (d as { row?: BreakdownRow } | undefined)?.row ?? null;

/** The filter that lists a breakdown row's items. */
function rowFilter(by: BreakdownBy, row: BreakdownRow, side: 'counted' | 'not_found'): ShrinkFilter {
  const scope = side === 'counted' ? 'counted' : 'missing';
  const base: ShrinkFilter = { scope, outcome: 'all' };
  const key = String(row.key);
  const none = (v: string) => (v === '' ? '__none__' : v);
  switch (by) {
    case 'category':
      return { ...base, category: none(key) };
    case 'subcategory': {
      const [cat, sub] = key.split(' › ');
      return { ...base, category: none(cat ?? ''), subcategory: sub === undefined || sub === '(none)' ? '__none__' : sub };
    }
    case 'vendor':
      return { ...base, vendor: none(key) };
    case 'order':
      return { ...base, order: none(key) };
    case 'age':
      return { ...base, age: key };
    case 'pct':
      return { ...base, pct: key };
    case 'price_band':
      return { ...base, price_band: key };
    case 'person':
      return { ...base, person: key };
  }
}

function BreakdownPanel({ countId, onOpen }: { countId: number; onOpen: (title: string, f: ShrinkFilter) => void }) {
  const [by, setBy] = useState<BreakdownBy>('category');
  const [measure, setMeasure] = useState<Measure>('price');
  const [show, setShow] = useState<Show>('both');
  const [chart, setChart] = useState<'bar' | 'pie'>('bar');
  const [rows, setRows] = useState<BreakdownRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    setError('');
    getInventoryBreakdown(countId, by)
      .then(setRows)
      .catch((e) => setError(apiMessage(e, 'Could not load the breakdown.')));
  }, [countId, by]);

  const effectiveShow: Show = by === 'person' ? 'counted' : show;
  const pie = chart === 'pie' && effectiveShow !== 'both';
  const value = (r: BreakdownRow, side: 'counted' | 'not_found') => num(r[side][measure]);

  // Bars: top 15 groups (+ Other) for named dimensions; every bucket for ordered ones. Pie: top 7 + Other.
  const chartRows = useMemo(() => {
    if (!rows) return [];
    const keep = pie ? 7 : ORDERED.includes(by) ? rows.length : 15;
    const sorted = ORDERED.includes(by) && !pie ? rows : [...rows].sort((a, b) => (value(b, 'counted') + value(b, 'not_found')) - (value(a, 'counted') + value(a, 'not_found')));
    const head = sorted.slice(0, keep).map((r) => ({ row: r, label: r.label, counted: value(r, 'counted'), not_found: value(r, 'not_found') }));
    const rest = sorted.slice(keep);
    if (rest.length) {
      head.push({
        row: null as unknown as BreakdownRow,
        label: `Other (${rest.length})`,
        counted: rest.reduce((n, r) => n + value(r, 'counted'), 0),
        not_found: rest.reduce((n, r) => n + value(r, 'not_found'), 0),
      });
    }
    return head;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, measure, pie, by]);

  const upright = ORDERED.includes(by);
  const totalOf = (side: 'counted' | 'not_found') => (rows ?? []).reduce((n, r) => n + value(r, side), 0);
  const open = (r: BreakdownRow | null, side: 'counted' | 'not_found') => {
    if (!r) return;
    onOpen(`${BY_LABEL[by]}: ${r.label} · ${side === 'counted' ? 'counted' : 'not found'}`, rowFilter(by, r, side));
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ lg: 'center' }} sx={{ mb: 2 }} className="no-print-controls" useFlexGap flexWrap="wrap">
        <Typography variant="h6" sx={{ fontWeight: 800, mr: 1 }}>
          Breakdown
        </Typography>
        <TextField select size="small" label="Group by" value={by} onChange={(e) => setBy(e.target.value as BreakdownBy)} sx={{ minWidth: 200 }}>
          {(Object.keys(BY_LABEL) as BreakdownBy[]).map((k) => (
            <MenuItem key={k} value={k}>
              {BY_LABEL[k]}
            </MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup size="small" exclusive value={measure} onChange={(_e, v: Measure | null) => v && setMeasure(v)} aria-label="Measure">
          {(Object.keys(MEASURE_LABEL) as Measure[]).map((m) => (
            <ToggleButton key={m} value={m} sx={{ textTransform: 'none', fontWeight: 700 }}>
              {MEASURE_LABEL[m]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <ToggleButtonGroup size="small" exclusive value={effectiveShow} onChange={(_e, v: Show | null) => v && setShow(v)} disabled={by === 'person'} aria-label="Show">
          <ToggleButton value="counted" sx={{ textTransform: 'none', fontWeight: 700 }}>Counted</ToggleButton>
          <ToggleButton value="not_found" sx={{ textTransform: 'none', fontWeight: 700 }}>Not found</ToggleButton>
          <ToggleButton value="both" sx={{ textTransform: 'none', fontWeight: 700 }}>Both</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup size="small" exclusive value={chart} onChange={(_e, v: 'bar' | 'pie' | null) => v && setChart(v)} aria-label="Chart">
          <ToggleButton value="bar" sx={{ textTransform: 'none', fontWeight: 700 }}>Bar</ToggleButton>
          <ToggleButton value="pie" sx={{ textTransform: 'none', fontWeight: 700 }}>Pie</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {chart === 'pie' && effectiveShow === 'both' && (
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>A pie shows one side: pick Counted or Not found. Showing bars.</Typography>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress />
        </Box>
      )}
      {rows && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.2fr) minmax(0, 1fr)' }, gap: 2 }}>
          <Box sx={{ height: pie ? 380 : upright ? 340 : Math.max(260, chartRows.length * (effectiveShow === 'both' ? 34 : 26) + 60), minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              {pie ? (
                <PieChart>
                  <Pie
                    data={chartRows.map((r) => ({ name: r.label, value: r[effectiveShow as 'counted' | 'not_found'], row: r.row }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="45%"
                    outerRadius="80%"
                    paddingAngle={1}
                    stroke="#fff"
                    strokeWidth={2}
                    onClick={(d) => open(rowOf(d), effectiveShow as 'counted' | 'not_found')}
                    cursor="pointer"
                  >
                    {chartRows.map((r, i) => (
                      <Cell key={r.label} fill={r.row ? SLOTS[i % SLOTS.length] : OTHER} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(measure, Number(v ?? 0))} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              ) : upright ? (
                <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }} barGap={2}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK2 }} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: INK2 }} tickFormatter={(v) => (measure === 'n' ? Number(v).toLocaleString() : `$${Math.round(Number(v) / 1000)}k`)} width={56} />
                  <Tooltip formatter={(v) => fmt(measure, Number(v ?? 0))} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  {effectiveShow === 'both' && <Legend wrapperStyle={{ fontSize: 12 }} />}
                  {effectiveShow !== 'not_found' && (
                    <Bar dataKey="counted" name="Counted" fill={COUNTED} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d) => open(rowOf(d), 'counted')} />
                  )}
                  {effectiveShow !== 'counted' && (
                    <Bar dataKey="not_found" name="Not found" fill={NOT_FOUND} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d) => open(rowOf(d), 'not_found')} />
                  )}
                </BarChart>
              ) : (
                <BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }} barGap={2}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: INK2 }} tickFormatter={(v) => (measure === 'n' ? Number(v).toLocaleString() : `$${Math.round(Number(v) / 1000)}k`)} />
                  <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11, fill: INK2 }} />
                  <Tooltip formatter={(v) => fmt(measure, Number(v ?? 0))} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  {effectiveShow === 'both' && <Legend wrapperStyle={{ fontSize: 12 }} />}
                  {effectiveShow !== 'not_found' && (
                    <Bar dataKey="counted" name="Counted" fill={COUNTED} radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d) => open(rowOf(d), 'counted')} />
                  )}
                  {effectiveShow !== 'counted' && (
                    <Bar dataKey="not_found" name="Not found" fill={NOT_FOUND} radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d) => open(rowOf(d), 'not_found')} />
                  )}
                </BarChart>
              )}
            </ResponsiveContainer>
          </Box>
          <Box sx={{ maxHeight: 460, overflow: 'auto', minWidth: 0 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>{BY_LABEL[by]}</TableCell>
                  <TableCell align="right">Counted</TableCell>
                  {by !== 'person' && <TableCell align="right">Not found</TableCell>}
                  {by !== 'person' && <TableCell align="right">% not found</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {(ORDERED.includes(by) ? rows : [...rows].sort((a, b) => (value(b, 'counted') + value(b, 'not_found')) - (value(a, 'counted') + value(a, 'not_found')))).map((r) => {
                  const total = r.counted.n + r.not_found.n;
                  return (
                    <TableRow key={String(r.key)} hover>
                      <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>
                        {r.label}
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => open(r, 'counted')} sx={{ textTransform: 'none', minWidth: 0, fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(measure, value(r, 'counted'))}
                        </Button>
                      </TableCell>
                      {by !== 'person' && (
                        <TableCell align="right">
                          <Button size="small" color="warning" onClick={() => open(r, 'not_found')} disabled={!r.not_found.n} sx={{ textTransform: 'none', minWidth: 0, fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(measure, value(r, 'not_found'))}
                          </Button>
                        </TableCell>
                      )}
                      {by !== 'person' && <TableCell align="right">{total ? `${Math.round((100 * r.not_found.n) / total)}%` : '-'}</TableCell>}
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell sx={{ fontWeight: 800 }}>Total</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>{fmt(measure, totalOf('counted'))}</TableCell>
                  {by !== 'person' && <TableCell align="right" sx={{ fontWeight: 800 }}>{fmt(measure, totalOf('not_found'))}</TableCell>}
                  {by !== 'person' && <TableCell />}
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        </Box>
      )}
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>Click a bar, a slice or a number to see its items.</Typography>
    </Paper>
  );
}

function HistogramCard({ hist, edges }: { hist: PriceHistogram; edges: number[] }) {
  const [side, setSide] = useState<'counted' | 'not_found'>('counted');
  const data = hist.bins[side].map((n, pct) => ({ pct, n }));
  const total = hist.bins[side].reduce((a, b) => a + b, 0);
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, breakInside: 'avoid' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          Price as % of retail, in 1% steps
        </Typography>
        <ToggleButtonGroup size="small" exclusive value={side} onChange={(_e, v: 'counted' | 'not_found' | null) => v && setSide(v)}>
          <ToggleButton value="counted" sx={{ textTransform: 'none', fontWeight: 700 }}>Counted</ToggleButton>
          <ToggleButton value="not_found" sx={{ textTransform: 'none', fontWeight: 700 }}>Not found</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>
        {total.toLocaleString()} items with a retail ({hist.no_retail[side].toLocaleString()} have none). Dashed lines: the buckets used in the breakdown. {hist.max}% means {hist.max}% or more.
      </Typography>
      <Box sx={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }} barCategoryGap={0.5}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="pct" tick={{ fontSize: 11, fill: INK2 }} ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]} tickFormatter={(v) => `${v}%`} />
            <YAxis tick={{ fontSize: 11, fill: INK2 }} width={48} />
            <Tooltip formatter={(v) => [`${Number(v ?? 0).toLocaleString()} items`, 'Items']} labelFormatter={(v) => `${v}% of retail`} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            {edges.map((e) => (
              <ReferenceLine key={e} x={e} stroke={INK2} strokeDasharray="3 3" />
            ))}
            <Bar dataKey="n" fill={side === 'counted' ? COUNTED : NOT_FOUND} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

/**
 * The inventory report (inventory_effort Phase 4, owner 2026-10-06): totals, who counted what, a breakdown by any
 * dimension (bar or pie, counted next to not found, click through to the items), and price as % of retail in 1%
 * steps. Prints cleanly; CSV of the counted items.
 */
/** The Summary tab of an inventory: totals, who counted, breakdowns and the price histogram. */
export default function InventoryReportPage({ countId }: { countId: number }) {
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [hist, setHist] = useState<PriceHistogram | null>(null);
  const [error, setError] = useState('');
  const [items, setItems] = useState<{ title: string; filter: ShrinkFilter } | null>(null);

  useEffect(() => {
    getInventorySummary(countId)
      .then(setSummary)
      .catch((e) => setError(apiMessage(e, 'Could not load the report. Check the connection and reload.')));
    getPriceHistogram(countId).then(setHist).catch(() => setHist(null));
  }, [countId]);

  const s = summary;
  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <GlobalStyles
        styles={{
          '@media print': {
            'nav, header, .MuiDrawer-root, .no-print, .no-print-controls .MuiToggleButtonGroup-root, .no-print-controls .MuiTextField-root': { display: 'none !important' },
            'main, body': { margin: '0 !important', padding: '0 !important' },
          },
        }}
      />
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-end' }} gap={1} sx={{ mb: 2 }}>
        <Typography sx={{ color: 'text.secondary' }}>
          {s ? (s.status === 'open' ? 'In progress: the numbers change as scans come in.' : 'Done: what the inventory found.') : ''}
        </Typography>
        <Stack direction="row" spacing={1} className="no-print">
          <Button startIcon={<Download />} variant="outlined" onClick={() => void downloadShrinkCsv(countId, { scope: 'counted', outcome: 'all' })} sx={{ textTransform: 'none' }}>
            CSV of counted items
          </Button>
          <Button startIcon={<Print />} variant="contained" onClick={() => window.print()} sx={{ textTransform: 'none' }}>
            Print
          </Button>
        </Stack>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {!s && !error && (
        <Box sx={{ p: 6, textAlign: 'center' }}>
          <CircularProgress />
        </Box>
      )}
      {s && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))', xl: 'repeat(8, minmax(0,1fr))' }, gap: 1, mb: 2 }}>
            <Tile label="Items counted" value={s.counted.n.toLocaleString()} sub={`of ${s.expected.toLocaleString()} expected`} />
            <Tile label="At price" value={money(s.counted.price)} sub="today's tag prices" />
            <Tile label="At retail" value={money(s.counted.retail)} sub="the vendor's retail" />
            <Tile label="Price % of retail" value={s.counted.price_pct_of_retail != null ? `${s.counted.price_pct_of_retail}%` : '-'} sub="items with a retail" />
            <Tile label="Coverage" value={s.coverage_pct != null ? `${s.coverage_pct}%` : '-'} sub="expected items counted" />
            <Tile label="Not found" value={s.not_found.n.toLocaleString()} sub={`${money(s.not_found.price)} at price`} />
            <Tile label="Scanning" value={`${s.hours} h`} sub={`${s.runs} runs · ${s.scans.toLocaleString()} scans`} />
            <Tile label="Problems" value={s.problems.toLocaleString()} sub={`${s.fixed.toLocaleString()} fixed in PR Fix-it`} />
          </Box>

          <Paper variant="outlined" sx={{ p: 2, mb: 2, breakInside: 'avoid' }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
              Who counted
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Person</TableCell>
                    <TableCell align="right">Items</TableCell>
                    <TableCell align="right">At price</TableCell>
                    <TableCell align="right">At retail</TableCell>
                    <TableCell align="right">Hours</TableCell>
                    <TableCell align="right">Items / hour</TableCell>
                    <TableCell align="right">Runs</TableCell>
                    <TableCell align="right">Bad runs</TableCell>
                    <TableCell align="right">Problems found</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {s.by_person.map((p) => (
                    <TableRow key={String(p.user_id)} hover>
                      <TableCell sx={{ fontWeight: 700 }}>
                        <Button size="small" onClick={() => setItems({ title: `Counted by ${p.name}`, filter: { scope: 'counted', outcome: 'all', person: p.user_id ?? '' } })} sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0, p: 0 }}>
                          {p.name}
                        </Button>
                      </TableCell>
                      <TableCell align="right">{p.items.toLocaleString()}</TableCell>
                      <TableCell align="right">{money(p.price)}</TableCell>
                      <TableCell align="right">{money(p.retail)}</TableCell>
                      <TableCell align="right">{p.hours.toFixed(1)}</TableCell>
                      <TableCell align="right">{p.items_per_hour ?? '-'}</TableCell>
                      <TableCell align="right">{p.runs}</TableCell>
                      <TableCell align="right">{p.bad_runs}</TableCell>
                      <TableCell align="right">{p.problems}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>
              An item counts for the person whose scan found it first. Hours are run time, start to stop; bad runs are left out.
            </Typography>
          </Paper>

          <BreakdownPanel countId={countId} onOpen={(title, filter) => setItems({ title, filter })} />
          {hist && <HistogramCard hist={hist} edges={[20, 30, 40, 50, 60]} />}
        </>
      )}
      <ItemsDialog countId={countId} title={items?.title ?? ''} filter={items?.filter ?? null} onClose={() => setItems(null)} />
    </Box>
  );
}
