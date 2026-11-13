/**
 * Page type: Data table (modelled on Orders, OrderListPage). Made-up data. What makes it this type:
 *  - the page fills the height; only the table scrolls (no page scroll);
 *  - a KPI strip that counts the whole list, or only the selected rows while any are ticked;
 *  - views (status buckets) and quick filters as one row, "More filters" folds open, active filters as chips with
 *    Clear all; the search box searches as you type;
 *  - an MUI DataGrid: two-line cells (a bold number over a caption coloured by its band), money columns, checkbox
 *    selection kept across pages, server-style paging, columns dropped by the table's own width (not the window's);
 *  - a row opens the object's window (a modal), never a page; Ctrl+N starts a new one.
 * On a phone the rows become cards: the key column, status and the one number that matters.
 */
import {
  Box, Button, Chip, Collapse, InputAdornment, MenuItem, Paper, Snackbar, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusPill, type Tone } from '../../../components/page/PageKit';
import { useMarkKitPage } from '../../../components/page/kitSignal';
import { Kpi, KpiStrip, TwoLine, bandTone, dataGridSx } from '../../../components/page/RichKit';
import { ECO_ICONS } from '../../../icons/ecoIcons';
import { useOpenDemoWindow } from '../WindowDialog';

const I = ECO_ICONS;
type Bucket = 'all' | 'transit' | 'processing' | 'complete';
const VENDORS = ['Wayfair', 'Target', 'Amazon', 'Costco', 'Home Depot', 'Walmart'];
const LOADS = ['Furniture, 26 pallets', 'Mixed home goods', 'Small appliances', 'Bedding and bath', 'Patio and outdoor', 'Kitchen and dining'];
const STATUS: { key: Bucket; label: string; tone: Tone }[] = [
  { key: 'transit', label: 'In transit', tone: 'info' },
  { key: 'processing', label: 'Processing', tone: 'wait' },
  { key: 'complete', label: 'Complete', tone: 'good' },
];

interface Row {
  id: number; order: string; vendor: string; condition: string; load: string; status: (typeof STATUS)[number];
  paid: string; ordered: string; pallets: number; cost: number; retail: number; priced: number; sold: number;
}

function rnd(seed: number) { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }
const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const pct = (n: number) => `${Math.round(n)}%`;

const ROWS: Row[] = Array.from({ length: 64 }, (_, i) => {
  const retail = 9000 + Math.round(rnd(i) * 52000);
  const cost = retail * (0.17 + rnd(i + 7) * 0.08);
  const status = STATUS[i < 6 ? 0 : i < 22 ? 1 : 2];
  const priced = status.key === 'transit' ? 0 : retail * (0.25 + rnd(i + 3) * 0.35);
  const sold = status.key === 'transit' ? 0 : cost * (0.2 + rnd(i + 11) * (status.key === 'complete' ? 2.6 : 1.2));
  const day = 64 - i;
  const date = (d: number) => new Date(2026, 10, 13 - d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return {
    id: i + 1, order: `T-${418 - i}`, vendor: VENDORS[i % VENDORS.length], condition: ['Returns', 'Overstock', 'Shelf pulls'][i % 3],
    load: LOADS[i % LOADS.length], status, paid: date(day), ordered: date(day + 4), pallets: 10 + Math.round(rnd(i + 5) * 20),
    cost, retail, priced, sold,
  };
});

const RECOVERY: [number, Tone][] = [[100, 'problem'], [150, 'wait'], [200, 'info'], [Infinity, 'good']];
const COST_SHARE: [number, Tone][] = [[18, 'good'], [23, 'info'], [Infinity, 'wait']];

/** Columns leave in this order as the table narrows (Orders: priced, sold, retail, profit, cost). */
const DROP_ORDER = [{ field: 'priced', below: 1340 }, { field: 'sold', below: 1220 }, { field: 'retail', below: 1100 }, { field: 'profit', below: 990 }, { field: 'cost', below: 870 }];

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1400);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

export function DataTableDemo() {
  useMarkKitPage();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const openWindow = useOpenDemoWindow();
  const [bucket, setBucket] = useState<Bucket>('all');
  const [quick, setQuick] = useState<string | null>(null);
  const [vendor, setVendor] = useState('');
  const [more, setMore] = useState(false);
  const [q, setQ] = useState('');
  const [view, setView] = useState<'orders' | 'sells'>('orders');
  const [selection, setSelection] = useState<GridRowSelectionModel>({ type: 'include', ids: new Set() });
  const [toast, setToast] = useState('');
  const { ref, w } = useWidth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        setToast('Ctrl+N: the New order window opens here (demo).');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rows = useMemo(() => ROWS.filter((r) =>
    (bucket === 'all' || r.status.key === bucket)
    && (!vendor || r.vendor === vendor)
    && (quick !== 'last60' || r.id <= 40)
    && (!q || `${r.order} ${r.vendor} ${r.load}`.toLowerCase().includes(q.toLowerCase()))), [bucket, vendor, quick, q]);

  const picked = selection.ids.size ? rows.filter((r) => selection.ids.has(r.id)) : rows;
  const sum = (k: keyof Row) => picked.reduce((a, r) => a + (r[k] as number), 0);
  const factor = view === 'sells' ? 1.0 : 0;
  const cost = sum('cost'), retail = sum('retail'), priced = sum('priced'), sold = sum('sold') + factor * (sum('priced') - sum('sold')) * 0.5;
  const selected = selection.ids.size > 0;

  const columns: GridColDef<Row>[] = [
    { field: 'status', headerName: 'Status', width: 150, sortable: false, renderCell: ({ row }) => (
      <Stack spacing={0.25}><StatusPill tone={row.status.tone} label={row.status.label} /><Typography variant="caption" sx={{ fontWeight: 700 }}>EXP · {row.paid}</Typography></Stack>) },
    { field: 'order', headerName: 'Order', width: 150, renderCell: ({ row }) => <TwoLine value={<Box component="span" sx={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{row.order}</Box>} caption={`${row.vendor} · ${row.condition}`} /> },
    { field: 'load', headerName: 'Description', flex: 1, minWidth: 180, renderCell: ({ row }) => (
      <Typography variant="body2" sx={{ fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', lineHeight: 1.35 }}>{row.load}, {row.pallets} pallets</Typography>) },
    { field: 'paid', headerName: 'Dates', width: 120, renderCell: ({ row }) => <TwoLine value={`PAID · ${row.paid}`} caption={`ORD · ${row.ordered}`} /> },
    { field: 'cost', headerName: 'Cost', width: 120, align: 'right', headerAlign: 'right', renderCell: ({ row }) => <TwoLine align="right" value={money(row.cost)} caption={`${pct((row.cost / row.retail) * 100)} of retail`} tone={bandTone((row.cost / row.retail) * 100, COST_SHARE)} /> },
    { field: 'retail', headerName: 'Retail', width: 120, align: 'right', headerAlign: 'right', renderCell: ({ row }) => <TwoLine align="right" value={money(row.retail)} caption={`${row.pallets} pallets`} /> },
    { field: 'priced', headerName: 'Priced', width: 120, align: 'right', headerAlign: 'right', renderCell: ({ row }) => <TwoLine align="right" value={row.priced ? money(row.priced) : '-'} caption={row.priced ? `${pct((row.priced / row.retail) * 100)} tagged` : 'not yet'} tone={row.priced ? 'info' : 'quiet'} /> },
    { field: 'sold', headerName: 'Sold', width: 120, align: 'right', headerAlign: 'right', renderCell: ({ row }) => <TwoLine align="right" value={row.sold ? money(row.sold) : '-'} caption={row.sold ? `${pct((row.sold / row.cost) * 100)} of cost` : ''} tone={bandTone((row.sold / row.cost) * 100, RECOVERY)} /> },
    { field: 'profit', headerName: 'Profit', width: 110, align: 'right', headerAlign: 'right', valueGetter: (_v, row) => row.sold - row.cost, renderCell: ({ row }) => <TwoLine align="right" value={money(row.sold - row.cost)} tone={row.sold >= row.cost ? 'good' : 'problem'} caption={row.sold >= row.cost ? 'ahead' : 'to go'} /> },
  ];
  const visibility = Object.fromEntries(DROP_ORDER.map((d) => [d.field, w >= d.below]));
  const chips = [
    bucket !== 'all' ? { key: 'bucket', label: `Status: ${STATUS.find((s) => s.key === bucket)?.label}`, clear: () => setBucket('all') } : null,
    quick ? { key: 'quick', label: quick === 'last60' ? 'Last 60 days' : '90 to 60 days', clear: () => setQuick(null) } : null,
    vendor ? { key: 'vendor', label: `Vendor: ${vendor}`, clear: () => setVendor('') } : null,
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  return (
    <Stack spacing={1.5} sx={{ height: { md: 'calc(100vh - 64px - 48px)' }, minHeight: 0 }}>
      {/* Toolbar: search and view on the left, buttons on the right. No page title: the top bar has it. */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ sm: 'center' }}>
        <TextField size="small" placeholder="Search orders, vendors, loads" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: { sm: '0 1 340px' } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.search sx={{ fontSize: 20 }} /></InputAdornment> } }} />
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
          <ToggleButton value="orders" sx={{ textTransform: 'none', fontWeight: 700 }}>Orders</ToggleButton>
          <ToggleButton value="sells" sx={{ textTransform: 'none', fontWeight: 700 }}>If it all sells</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<I.download />}>Export</Button>
          <Button variant="contained" startIcon={<I.add />} onClick={() => setToast('The New order window opens here (demo).')}>New order</Button>
        </Stack>
      </Stack>

      <KpiStrip>
        <Kpi label={selected ? `Selected (${picked.length})` : 'Orders'} value={String(picked.length)} caption={selected ? 'untick to see all' : `${rows.length} in this view`} tone={selected ? 'info' : undefined} selected={selected} Icon={I.purchaseOrder} />
        <Kpi label="Spent" value={money(cost)} caption={`${pct((cost / retail) * 100)} of retail`} tone={bandTone((cost / retail) * 100, COST_SHARE)} selected={selected} />
        <Kpi label="Retail" value={money(retail)} caption="manifest" selected={selected} />
        <Kpi label="Priced" value={money(priced)} caption={`${pct((priced / retail) * 100)} tagged`} tone="info" selected={selected} />
        <Kpi label={view === 'sells' ? 'If it all sells' : 'Sold'} value={money(sold)} caption={`${pct((sold / cost) * 100)} of cost`} tone={bandTone((sold / cost) * 100, RECOVERY)} selected={selected} />
        <Kpi label="Recovered" value={pct((sold / retail) * 100)} caption="of retail" tone={bandTone((sold / retail) * 100, [[12, 'problem'], [15, 'wait'], [Infinity, 'good']])} selected={selected} />
        <Kpi label="Profit" value={money(sold - cost)} caption={sold >= cost ? 'ahead' : 'to go'} tone={sold >= cost ? 'good' : 'problem'} selected={selected} />
      </KpiStrip>

      {/* Views and filters */}
      <Paper variant="outlined" sx={{ p: 1.25, borderRadius: '12px' }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <ToggleButtonGroup size="small" exclusive value={bucket} onChange={(_, v) => v && setBucket(v)}>
            <ToggleButton value="all" sx={{ textTransform: 'none', fontWeight: 700 }}>All</ToggleButton>
            {STATUS.map((s) => <ToggleButton key={s.key} value={s.key} sx={{ textTransform: 'none', fontWeight: 700 }}>{s.label}</ToggleButton>)}
          </ToggleButtonGroup>
          <Chip label="Last 60 days" color={quick === 'last60' ? 'primary' : 'default'} variant={quick === 'last60' ? 'filled' : 'outlined'} onClick={() => setQuick(quick === 'last60' ? null : 'last60')} />
          <Chip label="90 to 60 days" color={quick === '9060' ? 'primary' : 'default'} variant={quick === '9060' ? 'filled' : 'outlined'} onClick={() => setQuick(quick === '9060' ? null : '9060')} />
          <Button size="small" startIcon={<I.filter />} onClick={() => setMore(!more)}>{more ? 'Fewer filters' : 'More filters'}</Button>
          <Box sx={{ flex: 1 }} />
          {chips.map((c) => <Chip key={c.key} size="small" label={c.label} onDelete={c.clear} />)}
          {chips.length ? <Button size="small" onClick={() => { setBucket('all'); setQuick(null); setVendor(''); }}>Clear all</Button> : null}
        </Stack>
        <Collapse in={more}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 1.5 }}>
            <TextField select size="small" label="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="">Any vendor</MenuItem>
              {VENDORS.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </TextField>
            <TextField size="small" label="From" type="date" defaultValue="2026-09-01" slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" label="To" type="date" defaultValue="2026-11-13" slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
        </Collapse>
      </Paper>

      {phone ? (
        <Stack spacing={1}>
          {rows.slice(0, 20).map((r) => (
            <Paper key={r.id} variant="outlined" onClick={() => openWindow('order')} sx={{ p: 1.5, borderRadius: '12px', cursor: 'pointer' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <TwoLine value={<Box component="span" sx={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{r.order}</Box>} caption={`${r.vendor} · ${r.load}`} />
                <StatusPill tone={r.status.tone} label={r.status.label} />
              </Stack>
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                <TwoLine value={money(r.cost)} caption="cost" />
                <TwoLine align="right" value={r.sold ? money(r.sold) : '-'} caption={r.sold ? `${pct((r.sold / r.cost) * 100)} of cost` : 'nothing sold yet'} tone={bandTone((r.sold / r.cost) * 100, RECOVERY)} />
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Paper ref={ref} variant="outlined" sx={{ flex: 1, minHeight: 360, borderRadius: '12px', overflow: 'hidden' }}>
          <DataGrid
            rows={rows}
            columns={columns}
            rowHeight={60}
            columnHeaderHeight={44}
            checkboxSelection
            disableRowSelectionOnClick
            keepNonExistentRowsSelected
            rowSelectionModel={selection}
            onRowSelectionModelChange={setSelection}
            columnVisibilityModel={visibility}
            onRowClick={() => openWindow('order')}
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={dataGridSx}
          />
        </Paper>
      )}
      <Snackbar open={Boolean(toast)} autoHideDuration={2500} onClose={() => setToast('')} message={toast} />
    </Stack>
  );
}
