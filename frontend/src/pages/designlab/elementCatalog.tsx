/**
 * Every kit element, with a live preview on made-up data (Design Lab > Elements, and the Registry). A page is built
 * from these; a new element is drawn here first. Previews only: nothing is saved.
 */
import { Box, Button, Chip, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useState, type ComponentType } from 'react';
import { EmptyState, FieldRow, FilterBar, PageToolbar, Section, StatTile, StatusPill } from '../../components/page/PageKit';
import {
  BulkBar, ChipRail, Fact, FactStrip, Kpi, KpiStrip, MicroLabel, Pane, PaneBody, PaneHeader, ScanBar, StatBand, StatBlock,
  StatGroup, TwoLine, bandTone, denseTableSx,
} from '../../components/page/RichKit';
import StackOnPhone from '../../components/page/StackOnPhone';
import { ECO_ICONS } from '../../icons/ecoIcons';
import { useOpenDemoWindow } from './WindowDialog';

export type ElementGroup = 'Page kit' | 'Rich kit' | 'Windows';
export interface ElementInfo { id: string; name: string; group: ElementGroup; use: string; code: string; Preview: ComponentType }

const I = ECO_ICONS;

function ScanPreview() {
  const [v, setV] = useState('');
  const [s, setS] = useState<{ tone: 'good' | 'problem'; text: string } | null>(null);
  return <ScanBar autoFocus={false} value={v} onChange={setV} onEnter={(x) => setS(x ? { tone: 'good', text: `Found ${x}` } : { tone: 'problem', text: 'Scan a tag' })} Icon={I.scan} status={s} />;
}

function BulkPreview() {
  const [n, setN] = useState(3);
  return (
    <Box sx={{ position: 'relative', border: 1, borderColor: 'divider', borderRadius: '10px', overflow: 'hidden' }}>
      <Box sx={{ p: 1.5 }}><Button size="small" onClick={() => setN(n ? 0 : 3)}>{n ? 'Clear the selection' : 'Select 3 rows'}</Button></Box>
      <BulkBar count={n} onClear={() => setN(0)}><Button size="small" variant="outlined">Print tags</Button></BulkBar>
    </Box>
  );
}

function WindowPreview() {
  const open = useOpenDemoWindow();
  return <Button variant="contained" onClick={() => open('item')}>Open an Item window</Button>;
}

export const ELEMENTS: ElementInfo[] = [
  { id: 'page-toolbar', name: 'Page toolbar', group: 'Page kit', use: 'The first row of a page: search and filters left, buttons right. No title (the top bar has it).', code: "import { PageToolbar, FilterBar } from 'components/page/PageKit'",
    Preview: () => <PageToolbar lead={<FilterBar><TextField size="small" placeholder="Search" /><Chip label="All" color="primary" /><Chip label="Open" variant="outlined" /></FilterBar>}><Button variant="contained" startIcon={<I.add />}>New</Button></PageToolbar> },
  { id: 'section', name: 'Section', group: 'Page kit', use: 'A titled card; flush for tables that run edge to edge.', code: "import { Section } from 'components/page/PageKit'",
    Preview: () => <Section title="Details" hint="One line of hint" action={<Button size="small">Edit</Button>}><FieldRow label="Vendor">Wayfair</FieldRow><FieldRow label="Paid">$4,180</FieldRow></Section> },
  { id: 'stat-tile', name: 'Stat tile', group: 'Page kit', use: 'One big number with its label and a note coloured by tone (Overview pages).', code: "import { StatTile } from 'components/page/PageKit'",
    Preview: () => <Box sx={{ maxWidth: 240 }}><StatTile label="Tagged today" value="412" note="38 more than Friday" tone="good" Icon={I.processing} /></Box> },
  { id: 'status-pill', name: 'Status pill', group: 'Page kit', use: 'Five tones only: good, wait, problem, info, quiet. Never decoration.', code: "import { StatusPill } from 'components/page/PageKit'",
    Preview: () => <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}><StatusPill tone="good" label="Finished" /><StatusPill tone="wait" label="Waiting" /><StatusPill tone="problem" label="Short 3" /><StatusPill tone="info" label="New" /><StatusPill tone="quiet" label="Draft" /></Box> },
  { id: 'empty-state', name: 'Empty state', group: 'Page kit', use: 'What an empty list says: what it is for and what to do next.', code: "import { EmptyState } from 'components/page/PageKit'",
    Preview: () => <EmptyState Icon={I.inbound} title="No trucks on the way" body="Won auctions show here until they arrive." action={<Button size="small" variant="outlined">Open auctions</Button>} /> },
  { id: 'phone-table', name: 'Phone table', group: 'Page kit', use: 'Every table on a kit page turns into cards under 600 px; data-phone="hide" drops a column, eco-no-stack keeps a table.', code: "import StackOnPhone from 'components/page/StackOnPhone' (PageShell adds it for you)",
    Preview: () => (
      <StackOnPhone>
        <Table size="small"><TableHead><TableRow><TableCell>Truck</TableCell><TableCell>Vendor</TableCell><TableCell align="right">Paid</TableCell></TableRow></TableHead>
          <TableBody><TableRow><TableCell>T-418</TableCell><TableCell>Wayfair</TableCell><TableCell align="right">$4,180</TableCell></TableRow><TableRow><TableCell>T-417</TableCell><TableCell>Target</TableCell><TableCell align="right">$3,320</TableCell></TableRow></TableBody></Table>
      </StackOnPhone>) },
  { id: 'micro-label', name: 'Micro label', group: 'Rich kit', use: 'The small uppercase label over every number on the worked pages.', code: "import { MicroLabel } from 'components/page/RichKit'",
    Preview: () => <Box><MicroLabel>Per hour</MicroLabel><Typography sx={{ fontWeight: 900, fontSize: '1.25rem' }}>58</Typography></Box> },
  { id: 'kpi-strip', name: 'KPI strip', group: 'Rich kit', use: 'A row of compact number cards over a data table; captions coloured by band; counts the selected rows while any are ticked.', code: "import { KpiStrip, Kpi, bandTone } from 'components/page/RichKit'",
    Preview: () => <KpiStrip columns={{ xs: 2, md: 4 }}><Kpi label="Orders" value="64" caption="in this view" Icon={I.purchaseOrder} /><Kpi label="Spent" value="$58,400" caption="21% of retail" tone="info" /><Kpi label="Sold" value="$61,900" caption="106% of cost" tone={bandTone(106, [[100, 'problem'], [150, 'wait'], [Infinity, 'good']])} /><Kpi label="Profit" value="$3,500" caption="ahead" tone="good" /></KpiStrip> },
  { id: 'stat-band', name: 'Stat band', group: 'Rich kit', use: 'Grouped clickable numbers with a tone bar, across the top of a command center.', code: "import { StatBand, StatGroup, StatBlock } from 'components/page/RichKit'",
    Preview: () => <Box sx={{ border: 1, borderColor: 'divider', borderRadius: '10px', overflow: 'hidden' }}><StatBand><StatGroup label="Today"><StatBlock label="Tagged" value="412" helper="goal 380" tone="good" /><StatBlock label="Errors" value="3" helper="2 price" tone="problem" /></StatGroup><StatGroup label="Truck" last><StatBlock label="Done" value="61" suffix="%" helper="83 left" tone="wait" /></StatGroup></StatBand></Box> },
  { id: 'fact-strip', name: 'Fact strip', group: 'Rich kit', use: 'Label-over-value cells split by hairlines: what is being worked (an order, an item).', code: "import { FactStrip, Fact } from 'components/page/RichKit'",
    Preview: () => <FactStrip><Fact label="Vendor" value="Wayfair" /><Fact label="Load" value="Furniture, 26 pallets" /><Fact label="Order" value="T-418" mono /></FactStrip> },
  { id: 'scan-bar', name: 'Scan bar', group: 'Rich kit', use: 'Scanner first: always focused, Enter acts, Esc clears, the answer sits in a slot that never moves things. Try it.', code: "import { ScanBar } from 'components/page/RichKit'", Preview: ScanPreview },
  { id: 'chip-rail', name: 'Chip rail', group: 'Rich kit', use: 'Recent items or filters in a row that scrolls sideways, with a live count at the end.', code: "import { ChipRail } from 'components/page/RichKit'",
    Preview: () => <ChipRail label="Show" end={<Typography variant="caption" sx={{ fontWeight: 700 }}>84 matching</Typography>}><Chip size="small" label="All" color="primary" /><Chip size="small" label="To price" variant="outlined" /><Chip size="small" label="Tagged" variant="outlined" /><Chip size="small" label="Bench" variant="outlined" /></ChipRail> },
  { id: 'bulk-bar', name: 'Bulk bar', group: 'Rich kit', use: 'The dark bar for ticked rows, sticky at the bottom of the table.', code: "import { BulkBar } from 'components/page/RichKit'", Preview: BulkPreview },
  { id: 'pane', name: 'Pane', group: 'Rich kit', use: 'A full-height card with a fixed header (label, value, one action) and a body that scrolls: stations.', code: "import { Pane, PaneHeader, PaneBody } from 'components/page/RichKit'",
    Preview: () => <Pane sx={{ height: 170 }}><PaneHeader kicker="Work log" value="55 min" meta="6 entries" action={<Button size="small">Log work</Button>} /><PaneBody>{['Re-stitched the arm', 'Fitted the patch kit', 'Cleaned the cushions', 'Frame checked'].map((t, i) => <Box key={t} sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: i % 2 ? 'grey.50' : undefined, fontSize: '0.8125rem' }}>{t}</Box>)}</PaneBody></Pane> },
  { id: 'two-line', name: 'Two-line cell', group: 'Rich kit', use: 'A table cell: a bold number over a caption coloured by its band (money columns).', code: "import { TwoLine, bandTone } from 'components/page/RichKit'",
    Preview: () => <Box sx={{ display: 'flex', gap: 4 }}><TwoLine value="$4,180" caption="21% of retail" tone="info" /><TwoLine value="$6,240" caption="149% of cost" tone="wait" /><TwoLine value="$9,900" caption="237% of cost" tone="good" /></Box> },
  { id: 'dense-table', name: 'Dense table', group: 'Rich kit', use: 'The queue look: 30 px rows, striped, micro headers, a selected row with a green bar. Put denseTableSx on a Table.', code: "import { denseTableSx } from 'components/page/RichKit'",
    Preview: () => (
      <Table size="small" sx={denseTableSx}><TableHead><TableRow><TableCell>Title</TableCell><TableCell>Qty</TableCell><TableCell align="right">Price</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
        <TableBody>{['Platform bed frame', 'Stand mixer', 'Accent chair'].map((t, i) => <TableRow key={t} selected={i === 1} hover><TableCell sx={{ fontWeight: 700 }}>{t}</TableCell><TableCell><b>{i}</b> / 2</TableCell><TableCell align="right">${(i + 1) * 34}.00</TableCell><TableCell><StatusPill tone={i === 2 ? 'wait' : 'good'} label={i === 2 ? 'Pricing' : 'Tagged'} /></TableCell></TableRow>)}</TableBody></Table>) },
  { id: 'object-window', name: 'Object window', group: 'Windows', use: 'The one modal every object opens in: ten elements, the same for every object (Windows tab).', code: "import { ObjectWindow } from 'components/objectWindow/ObjectWindow'", Preview: WindowPreview },
];

export const ELEMENT_GROUPS: ElementGroup[] = ['Page kit', 'Rich kit', 'Windows'];

export function elementCheckId(id: string) {
  return `element-${id}`;
}
