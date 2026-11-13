/**
 * Page type: Command center (modelled on Processing: ProcessingWorkspaceHeader, ProcessingScanBar,
 * ProcessingQueueTable, ProcessingActiveCard; and Preprocessing). Made-up data. What makes it this type:
 *  - full bleed and fixed height: the header never scrolls away, only the queue's body scrolls;
 *  - an order strip (what we are working: the order, its facts, its few big actions);
 *  - a stat band: grouped numbers with a tone bar, each opens its detail;
 *  - scanner first: the scan bar is always focused (and takes focus back after anything else), Enter finds the item,
 *    Esc clears; its answer sits in a fixed slot so nothing moves;
 *  - recent items and filters as chip rails with a live count;
 *  - a dense queue (28 px rows, striped, sticky header, sort by clicking a heading), a dark bulk bar for ticked rows;
 *  - opening a row replaces the queue with the work card in place (no drawer, no page change); Esc goes back.
 * On a phone: the stat band scrolls sideways, the queue becomes cards, the work card is one column.
 */
import {
  Box, Button, Checkbox, Chip, IconButton, MenuItem, Select, Snackbar, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusPill, type Tone } from '../../../components/page/PageKit';
import { useMarkKitPage } from '../../../components/page/kitSignal';
import StackOnPhone from '../../../components/page/StackOnPhone';
import {
  BulkBar, ChipRail, Fact, FactStrip, MicroLabel, ScanBar, StatBand, StatBlock, StatGroup, denseTableSx,
} from '../../../components/page/RichKit';
import { ECO_ICONS } from '../../../icons/ecoIcons';

const I = ECO_ICONS;

interface Item {
  id: number; sku: string; brand: string; title: string; category: string; retail: number; price: number; done: number; qty: number;
  condition: string; status: { tone: Tone; label: string }; added?: boolean; dup?: boolean;
}
const TITLES = [
  ['Modway', 'Upholstered platform bed frame, queen', 'Furniture'], ['Zinus', 'Memory foam mattress, 10 in, full', 'Bedding'],
  ['Mainstays', '5-shelf bookcase, espresso', 'Furniture'], ['KitchenAid', 'Stand mixer, 5 qt, empire red', 'Kitchen'],
  ['Better Homes', 'Accent chair, boucle, ivory', 'Furniture'], ['Keurig', 'K-Elite single serve coffee maker', 'Kitchen'],
  ['Dyson', 'V8 cordless vacuum', 'Appliances'], ['Threshold', 'Ceramic table lamp, sage', 'Home decor'],
  ['Simmons', 'Office chair, mesh back', 'Furniture'], ['Hamilton Beach', '12-cup food processor', 'Kitchen'],
  ['Room Essentials', 'Shower curtain, waffle, white', 'Bath'], ['Sauder', 'Writing desk, oak finish', 'Furniture'],
];
const STATUSES: { tone: Tone; label: string }[] = [
  { tone: 'quiet', label: 'To price' }, { tone: 'wait', label: 'Pricing' }, { tone: 'good', label: 'Tagged' }, { tone: 'info', label: 'Bench' }, { tone: 'problem', label: 'Damaged' },
];
const money = (n: number) => `$${n.toFixed(2)}`;
const ITEMS: Item[] = Array.from({ length: 84 }, (_, i) => {
  const [brand, title, category] = TITLES[i % TITLES.length];
  const retail = 30 + ((i * 37) % 420);
  const qty = 1 + (i % 4);
  return {
    id: i + 1, sku: `ITM02050${String(10 + i).padStart(2, '0')}`, brand, title, category, retail, price: Math.round(retail * 0.55 * 100) / 100,
    qty, done: i % 5 === 0 ? qty : i % 3 === 0 ? 1 : 0, condition: ['Like new', 'Good', 'New in box', 'As is'][i % 4],
    status: STATUSES[i % 9 === 0 ? 4 : i % 7 === 0 ? 3 : i % 3], added: i % 17 === 4, dup: i % 23 === 6,
  };
});
const FILTERS = ['To price', 'Pricing', 'Tagged', 'Bench', 'Damaged'];

function ActiveCard({ item, onBack, onDone }: { item: Item; onBack: () => void; onDone: (msg: string) => void }) {
  const [price, setPrice] = useState(item.price);
  const keeps = Math.round((price / item.retail) * 100);
  const theme = useTheme();
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 1.25, mb: 2, borderRadius: '12px', bgcolor: 'success.light', border: 1, borderColor: alpha(theme.palette.success.main, 0.35), color: 'success.dark' }}>
        <IconButton size="small" onClick={onBack} aria-label="Back to the queue" sx={{ color: 'inherit' }}><I.back /></IconButton>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontFamily: 'ui-monospace, Consolas, monospace', fontWeight: 900, fontSize: '0.8125rem' }}>{item.sku}</Typography>
          <Typography noWrap sx={{ fontWeight: 800 }}>{item.brand} · {item.title}</Typography>
        </Box>
        <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' }, color: 'inherit', fontWeight: 700 }}>Esc: back to the queue</Typography>
      </Stack>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '240px minmax(0, 1fr) 300px' }, alignItems: 'start' }}>
        <Box sx={{ aspectRatio: '1', borderRadius: '12px', border: 1, borderColor: 'divider', bgcolor: 'grey.100', display: 'grid', placeItems: 'center' }}>
          <Stack alignItems="center" spacing={1}><I.processing sx={{ fontSize: 56, color: 'text.disabled' }} /><Button size="small" startIcon={<I.add />}>Add photo</Button></Stack>
        </Box>
        <Stack spacing={1.5} sx={{ minWidth: 0 }}>
          <TextField label="Title" defaultValue={item.title} size="small" fullWidth />
          <Stack direction="row" spacing={1.5}>
            <TextField label="Brand" defaultValue={item.brand} size="small" fullWidth />
            <TextField select label="Condition" defaultValue={item.condition} size="small" fullWidth>
              {['New in box', 'Like new', 'Good', 'As is'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
          </Stack>
          <Box>
            <MicroLabel>Price</MicroLabel>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
              <IconButton size="small" onClick={() => setPrice(Math.max(1, Math.round(price - 1)))} sx={{ border: 1, borderColor: 'divider' }}><I.remove fontSize="small" /></IconButton>
              <TextField size="small" value={price.toFixed(2)} onChange={(e) => setPrice(Number(e.target.value) || 0)} sx={{ width: 110, '& input': { fontWeight: 900, fontVariantNumeric: 'tabular-nums', textAlign: 'right' } }} />
              <IconButton size="small" onClick={() => setPrice(Math.round(price + 1))} sx={{ border: 1, borderColor: 'divider' }}><I.add fontSize="small" /></IconButton>
              <Typography variant="body2" sx={{ fontWeight: 700, color: keeps < 45 || keeps > 65 ? 'warning.dark' : 'success.dark' }}>
                keeps {keeps}% of retail {money(item.retail)}
              </Typography>
            </Stack>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 1 }}>
            <Button variant="contained" startIcon={<I.print />} onClick={() => onDone(`${item.sku} tagged at ${money(price)}`)}>Print tag</Button>
            <Button variant="outlined" onClick={() => onDone(`${item.sku} sent to the bench`)}>Send to bench</Button>
            <Button variant="text" onClick={onBack}>Skip</Button>
          </Stack>
        </Stack>
        <Stack spacing={1.5}>
          <Box sx={{ p: 1.5, borderRadius: '12px', border: 1, borderColor: 'divider', bgcolor: 'background.paper', borderLeft: `4px solid ${theme.palette.info.main}` }}>
            <MicroLabel>AI suggests</MicroLabel>
            <Typography sx={{ fontWeight: 900, fontSize: '1.25rem', fontVariantNumeric: 'tabular-nums' }}>{money(Math.round(item.retail * 0.5))}</Typography>
            <Typography variant="caption">From 14 sold like it, 9 days to sell. <Box component="span" onClick={() => setPrice(Math.round(item.retail * 0.5))} sx={{ textDecoration: 'underline dotted', cursor: 'pointer', fontWeight: 700 }}>Use it</Box></Typography>
          </Box>
          <Box sx={{ p: 1.5, borderRadius: '12px', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <MicroLabel>This product</MicroLabel>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.qty} on this truck, {item.done} done</Typography>
            <Typography variant="caption">Last tagged at {money(item.price)} on Nov 6</Typography>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

export function CommandCenterDemo() {
  useMarkKitPage();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const scanRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState('');
  const [status, setStatus] = useState<{ tone: Tone; text: string } | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<Item | null>(null);
  const [recent, setRecent] = useState<Item[]>(ITEMS.slice(2, 7));
  const [sort, setSort] = useState<{ key: keyof Item; dir: 1 | -1 } | null>(null);
  const [toast, setToast] = useState('');

  const refocus = useCallback(() => window.setTimeout(() => scanRef.current?.focus(), 0), []);
  const open = useCallback((it: Item) => {
    setActive(it);
    setRecent((r) => [it, ...r.filter((x) => x.id !== it.id)].slice(0, 8));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      if (active) { setActive(null); refocus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, refocus]);

  const rows = useMemo(() => {
    let r = filter ? ITEMS.filter((i) => i.status.label === filter) : ITEMS;
    if (sort) {
      const { key, dir } = sort;
      r = [...r].sort((a, b) => ((a[key] ?? '') > (b[key] ?? '') ? dir : -dir));
    }
    return r;
  }, [filter, sort]);

  const onScan = (v: string) => {
    const hit = ITEMS.find((i) => i.sku.toLowerCase() === v.trim().toLowerCase() || i.sku.endsWith(v.trim()));
    if (hit && v.trim()) { setStatus({ tone: 'good', text: `Found ${hit.sku}` }); setScan(''); open(hit); }
    else setStatus({ tone: 'problem', text: v.trim() ? `No item ${v.trim()} on this truck` : 'Scan a tag or type a SKU' });
  };
  const sortBy = (key: keyof Item) => setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  const head = (key: keyof Item, label: string, width: number | string, align: 'left' | 'right' = 'left') => (
    <TableCell key={label} onClick={() => sortBy(key)} align={align} sx={{ width, cursor: 'pointer', userSelect: 'none' }}>
      {label}{sort?.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </TableCell>
  );
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
      {/* Order strip */}
      <Stack direction="row" alignItems="center" sx={{ minHeight: 52, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', pl: 1.5, pr: 1.5, gap: 1 }}>
        <Select size="small" defaultValue="T-418" variant="standard" disableUnderline
          sx={{ fontFamily: 'ui-monospace, Consolas, monospace', fontWeight: 900, color: 'primary.main', fontSize: '0.9375rem', pr: 1, borderRight: 1, borderColor: 'divider' }}>
          {['T-418', 'T-417', 'T-415'].map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </Select>
        <FactStrip sx={{ flex: 1 }}>
          <Fact label="Vendor" value="Wayfair" />
          <Fact label="Load" value="Furniture, 26 pallets" />
          <Fact label="Paid" value="$4,180 · 21%" />
          <Fact label="Retail" value="$19,900" />
          <Fact label="Arrived" value="Nov 12" />
        </FactStrip>
        <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', md: 'flex' } }}>
          <Button size="small" variant="outlined" startIcon={<I.add />}>Add item</Button>
          <Button size="small" variant="outlined">Close the truck</Button>
        </Stack>
      </Stack>

      <StatBand>
        <StatGroup label="Today">
          <StatBlock label="Tagged" value="412" helper="38 more than Friday" tone="good" onClick={() => setToast('Tagged today: the detail opens here.')} />
          <StatBlock label="Per hour" value="58" helper="goal 50" tone="good" />
          <StatBlock label="Errors" value="3" helper="2 price, 1 tag" tone="problem" />
        </StatGroup>
        <StatGroup label="This truck">
          <StatBlock label="Items" value="212" helper="of 240 on the manifest" />
          <StatBlock label="Done" value="61" suffix="%" helper="83 left" tone="wait" />
          <StatBlock label="Short" value="3" suffix="pallets" helper="claim by Nov 19" tone="problem" />
        </StatGroup>
        <StatGroup label="Money" last>
          <StatBlock label="Priced" value="$8,420" helper="42% of retail" tone="info" />
          <StatBlock label="Avg tag" value="$34" helper="55% of retail" />
        </StatGroup>
      </StatBand>

      {active ? (
        <ActiveCard item={active} onBack={() => { setActive(null); refocus(); }} onDone={(m) => { setToast(m); setActive(null); refocus(); }} />
      ) : (
        <>
          <Stack spacing={0.5} sx={{ px: 1.5, pt: 1.25, pb: 0.5 }}>
            <ScanBar ref={scanRef} value={scan} onChange={setScan} onEnter={onScan} Icon={I.scan} status={status} placeholder="Scan a tag or type a SKU (try 5012)" />
            <ChipRail label="Recent">
              {recent.map((r) => <Chip key={r.id} size="small" label={r.sku.slice(-4) + ' · ' + r.title.split(',')[0]} onClick={() => open(r)} />)}
            </ChipRail>
            <ChipRail label="Show" end={<Typography variant="caption" sx={{ fontWeight: 700 }}>{rows.length} matching · {ITEMS.length} on the truck</Typography>}>
              <Chip size="small" label="All" color={!filter ? 'primary' : 'default'} variant={!filter ? 'filled' : 'outlined'} onClick={() => setFilter(null)} />
              {FILTERS.map((f) => <Chip key={f} size="small" label={f} color={filter === f ? 'primary' : 'default'} variant={filter === f ? 'filled' : 'outlined'} onClick={() => setFilter(filter === f ? null : f)} />)}
            </ChipRail>
          </Stack>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <StackOnPhone>
              <Table size="small" stickyHeader sx={denseTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 40 }} padding="checkbox" data-phone="hide" />
                    {head('title', 'Title', '34%')}
                    {head('done', 'Qty', 70)}
                    {head('brand', 'Brand', 120)}
                    {head('category', 'Category', 110)}
                    {head('retail', 'Retail', 90, 'right')}
                    {head('price', 'Price', 90, 'right')}
                    {head('condition', 'Condition', 100)}
                    <TableCell sx={{ width: 100 }}>Status</TableCell>
                    <TableCell sx={{ width: 64 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} hover selected={selected.has(r.id)} onClick={() => open(r)} sx={{ cursor: 'pointer' }}>
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}><Checkbox size="small" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        {r.title}
                        {r.added ? <Chip size="small" label="Added" sx={{ ml: 0.75, height: 18, fontSize: '0.6875rem' }} /> : null}
                        {r.dup ? <Chip size="small" label="dup?" color="warning" variant="outlined" sx={{ ml: 0.75, height: 18, fontSize: '0.6875rem' }} /> : null}
                      </TableCell>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}><b>{r.done}</b><Box component="span" sx={{ color: 'text.secondary' }}> / {r.qty}</Box></TableCell>
                      <TableCell>{r.brand}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(r.retail)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>{money(r.price)}</TableCell>
                      <TableCell>{r.condition}</TableCell>
                      <TableCell><StatusPill tone={r.status.tone} label={r.status.label} /></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Report damage"><IconButton size="small" sx={{ '&:hover': { color: 'error.main' } }} onClick={() => setToast(`${r.sku} marked damaged (demo)`)}><I.delete sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </StackOnPhone>
          </Box>
          <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
            <Button size="small" variant="outlined" startIcon={<I.print />} onClick={() => setToast(`${selected.size} tags printed (demo)`)}>Print tags</Button>
            <Button size="small" variant="outlined" onClick={() => setToast(`${selected.size} items repriced (demo)`)}>{phone ? 'Price' : 'Set price'}</Button>
          </BulkBar>
        </>
      )}
      <Snackbar open={Boolean(toast)} autoHideDuration={2500} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}
