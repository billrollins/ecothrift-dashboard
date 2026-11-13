/**
 * Dummy pages, one per page type (navigation/pageRegistry.ts PAGE_TEMPLATES), on made-up Eco-Thrift data. Nothing is
 * saved: they exist to judge the look and the layout of each page type at desktop and phone size. A new page starts
 * by copying its type's demo. Only the kit, MUI and theme names: no hex codes.
 */
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useState } from 'react';
import {
  EmptyState,
  FieldRow,
  FilterBar,
  PageShell,
  PageToolbar,
  Section,
  StatTile,
  StatusPill,
  type Tone,
} from '../../components/page/PageKit';
import { ECO_ICONS } from '../../icons/ecoIcons';

const I = ECO_ICONS;

/** Phone width as the demo sees it (inside the Design Lab's phone frame, the breakpoints are scaled to the frame). */
function usePhone() {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2);
}

function Person({ name, sub, size = 34 }: { name: string; sub?: string; size?: number }) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
      <Avatar sx={{ width: size, height: size, fontSize: size * 0.38, fontWeight: 800, bgcolor: 'grey.100', color: 'text.primary' }}>
        {initials(name)}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap variant="body2" sx={{ fontWeight: 700 }}>{name}</Typography>
        {sub ? <Typography noWrap variant="caption" component="div">{sub}</Typography> : null}
      </Box>
    </Stack>
  );
}

const tileGrid = { display: 'grid', gap: { xs: 1.5, md: 2 }, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } } as const;

// Overview ------------------------------------------------------------

const TODAY = [
  { time: '8:00', title: 'Wayfair truck arrives', sub: 'Dock 2 · 26 pallets', tone: 'info' as Tone, tag: 'On the way' },
  { time: '10:30', title: 'Furniture to the floor', sub: 'Showroom B · 14 pieces', tone: 'good' as Tone, tag: 'Ready' },
  { time: '1:00', title: 'Restoration review', sub: 'Bench · 6 items', tone: 'wait' as Tone, tag: 'Due today' },
  { time: '4:30', title: 'Close the drawers', sub: 'Registers 1 and 2', tone: 'quiet' as Tone, tag: 'Later' },
];

const NEEDS_YOU = [
  { who: 'Dana Whitfield', what: 'Price check · walnut dresser', tone: 'wait' as Tone, tag: 'Waiting 1 day' },
  { who: 'Marcus Lee', what: 'Truck 418 short 3 pallets', tone: 'problem' as Tone, tag: 'Problem' },
  { who: 'Rosa Jimenez', what: 'Time off · Nov 26 to 28', tone: 'info' as Tone, tag: 'New' },
];

export function OverviewDemo() {
  return (
    <PageShell>
      <Box sx={tileGrid}>
        <StatTile label="Tagged today" value="412" note="38 more than last Friday" tone="good" Icon={I.processing} />
        <StatTile label="Waiting on you" value="3" note="1 problem" tone="problem" Icon={I.requests} />
        <StatTile label="Floor sales" value="$3,240" note="Up 11%" tone="good" Icon={I.register} />
        <StatTile label="Trucks to receive" value="2" detail="Wayfair, Target" Icon={I.inbound} />
      </Box>
      <Box sx={{ display: 'grid', gap: { xs: 2, md: 3 }, gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' } }}>
        <Section title="Today" flush action={<Button size="small">Open schedule</Button>}>
          {TODAY.map((row) => (
            <Stack key={row.time} direction="row" spacing={2} alignItems="center" sx={{ px: { xs: 2, md: 2.5 }, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" component="p" sx={{ width: 48, flexShrink: 0, color: 'text.secondary' }}>{row.time}</Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap variant="body2" sx={{ fontWeight: 700 }}>{row.title}</Typography>
                <Typography noWrap variant="caption" component="div">{row.sub}</Typography>
              </Box>
              <StatusPill tone={row.tone} label={row.tag} />
            </Stack>
          ))}
        </Section>
        <Section title="Needs you" flush action={<Button size="small">See all</Button>}>
          {NEEDS_YOU.map((row) => (
            <Stack key={row.who} direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ px: { xs: 2, md: 2.5 }, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <Person name={row.who} sub={row.what} />
              <StatusPill tone={row.tone} label={row.tag} />
            </Stack>
          ))}
        </Section>
      </Box>
    </PageShell>
  );
}

// List and detail -------------------------------------------------------

const TRUCKS = [
  { id: 'T-418', vendor: 'Wayfair', arrived: 'Nov 12', pallets: 26, tagged: '61%', tone: 'problem' as Tone, tag: 'Short 3' },
  { id: 'T-417', vendor: 'Target', arrived: 'Nov 10', pallets: 18, tagged: '94%', tone: 'good' as Tone, tag: 'Received' },
  { id: 'T-416', vendor: 'Amazon', arrived: 'Nov 06', pallets: 22, tagged: '100%', tone: 'good' as Tone, tag: 'Finished' },
  { id: 'T-415', vendor: 'Wayfair', arrived: 'Nov 04', pallets: 24, tagged: '38%', tone: 'wait' as Tone, tag: 'Processing' },
  { id: 'T-414', vendor: 'Costco', arrived: 'Due Nov 18', pallets: 12, tagged: '-', tone: 'info' as Tone, tag: 'On the way' },
];

function TruckDetail({ truck, onBack }: { truck: (typeof TRUCKS)[number]; onBack?: () => void }) {
  return (
    <Section>
      <Stack spacing={2}>
        {onBack ? <Button size="small" startIcon={<I.back />} onClick={onBack} sx={{ alignSelf: 'flex-start' }}>All trucks</Button> : null}
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <Box>
            <Typography variant="h4" component="h2">{truck.id}</Typography>
            <Typography variant="caption">{truck.vendor} · {truck.pallets} pallets</Typography>
          </Box>
          <StatusPill tone={truck.tone} label={truck.tag} />
        </Stack>
        <Box>
          <FieldRow label="Arrived">{truck.arrived}</FieldRow>
          <FieldRow label="Tagged">{truck.tagged}</FieldRow>
          <FieldRow label="Paid">$4,180 (21% of retail)</FieldRow>
          <FieldRow label="Note">Three pallets missing from the manifest. Claim opened.</FieldRow>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="contained" size="small">Open truck</Button>
          <Button variant="outlined" size="small" startIcon={<I.print />}>Print labels</Button>
        </Stack>
      </Stack>
    </Section>
  );
}

export function ListDetailDemo() {
  const phone = usePhone();
  const [picked, setPicked] = useState<number | null>(phone ? null : 0);
  const shown = picked ?? (phone ? null : 0);
  // Phone rule: the detail opens full screen, with a way back to the list.
  if (phone && shown !== null) {
    return <PageShell><TruckDetail truck={TRUCKS[shown]} onBack={() => setPicked(null)} /></PageShell>;
  }
  return (
    <PageShell width="wide">
      <PageToolbar
        lead={
          <FilterBar>
            <TextField
              size="small"
              placeholder="Search trucks"
              sx={{ minWidth: { sm: 240 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><I.search sx={{ fontSize: 20 }} /></InputAdornment> } }}
            />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label="All" color="primary" />
              <Chip label="Processing" variant="outlined" />
              <Chip label="Problems" variant="outlined" />
            </Stack>
          </FilterBar>
        }
      >
        <Button variant="outlined" startIcon={<I.download />}>Export</Button>
        <Button variant="contained" startIcon={<I.add />}>New truck</Button>
      </PageToolbar>
      <Box sx={{ display: 'grid', gap: { xs: 2, md: 3 }, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.6fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
        <Section flush>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Truck</TableCell>
                <TableCell>Vendor</TableCell>
                <TableCell data-phone="hide">Arrived</TableCell>
                <TableCell align="right" data-phone="hide">Pallets</TableCell>
                <TableCell align="right">Tagged</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {TRUCKS.map((row, i) => (
                <TableRow key={row.id} hover selected={!phone && i === shown} onClick={() => setPicked(i)} sx={{ cursor: 'pointer' }}>
                  <TableCell sx={{ fontWeight: 700 }}>{row.id}</TableCell>
                  <TableCell>{row.vendor}</TableCell>
                  <TableCell>{row.arrived}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{row.pallets}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{row.tagged}</TableCell>
                  <TableCell><StatusPill tone={row.tone} label={row.tag} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
        {!phone && shown !== null ? <TruckDetail truck={TRUCKS[shown]} /> : null}
      </Box>
    </PageShell>
  );
}

// Record ----------------------------------------------------------------

const HISTORY = [
  { when: 'Nov 12', what: 'Moved to the floor', sub: 'Showroom B, bay 4' },
  { when: 'Nov 10', what: 'Restored', sub: 'Bench · new pulls, oiled' },
  { when: 'Nov 06', what: 'Tagged at $289', sub: 'Dana W. · 55% of retail' },
  { when: 'Nov 06', what: 'Received', sub: 'Truck T-416 · Amazon' },
];

export function RecordDemo() {
  const [tab, setTab] = useState(0);
  return (
    <PageShell>
      {/* A record page opens with the record's own name: that is not the page title. */}
      <Section>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
            <Box sx={{ width: 72, height: 72, flexShrink: 0, borderRadius: '14px', display: 'grid', placeItems: 'center', bgcolor: 'grey.100' }}>
              <I.salesFloor sx={{ fontSize: 40, color: 'text.secondary' }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h3" component="h2">Walnut 6-drawer dresser</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                <StatusPill tone="good" label="On the floor" />
                <Chip size="small" variant="outlined" label="ET-204871" />
                <Chip size="small" variant="outlined" label="Furniture" />
              </Stack>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<I.edit />}>Edit</Button>
            <Button variant="contained" startIcon={<I.print />}>Print tag</Button>
          </Stack>
        </Stack>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 2, mb: -2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Tab label="Overview" />
          <Tab label="Photos" />
          <Tab label="Price history" />
          <Tab label="Sales" />
        </Tabs>
      </Section>
      {tab === 0 ? (
        <Box sx={{ display: 'grid', gap: { xs: 2, md: 3 }, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
          <Section title="Details">
            <FieldRow label="Price">$289.00</FieldRow>
            <FieldRow label="Retail">$529.00</FieldRow>
            <FieldRow label="Condition">Like new, restored</FieldRow>
            <FieldRow label="Where">Showroom B, bay 4</FieldRow>
            <FieldRow label="Days on floor">
              <Stack spacing={0.5} sx={{ minWidth: 140 }}>
                <span>2 of 30</span>
                <LinearProgress variant="determinate" value={7} />
              </Stack>
            </FieldRow>
          </Section>
          <Section title="History" action={<Button size="small">Full history</Button>}>
            {HISTORY.map((row, i) => (
              <Stack key={row.what} direction="row" spacing={1.75} sx={{ pb: i === HISTORY.length - 1 ? 0 : 2 }}>
                <Box sx={{ position: 'relative', width: 10, flexShrink: 0 }}>
                  <Box sx={{ position: 'absolute', top: 6, left: 1, width: 8, height: 8, borderRadius: '50%', bgcolor: 'secondary.main' }} />
                  {i < HISTORY.length - 1 ? <Box sx={{ position: 'absolute', top: 18, bottom: -4, left: 4.5, width: '1px', bgcolor: 'divider' }} /> : null}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{row.what}</Typography>
                  <Typography variant="caption">{row.when} · {row.sub}</Typography>
                </Box>
              </Stack>
            ))}
          </Section>
        </Box>
      ) : (
        <Section>
          <EmptyState
            Icon={I.documents}
            title="Nothing here yet"
            body="An empty tab says what it is for and what to do next."
            action={<Button variant="outlined" size="small" startIcon={<I.add />}>Add the first one</Button>}
          />
        </Section>
      )}
    </PageShell>
  );
}

// Calendar ----------------------------------------------------------------

type Run = { day: number; time: string; title: string; who: string; tone: Tone };
const DAYS = ['Mon 16', 'Tue 17', 'Wed 18', 'Thu 19', 'Fri 20', 'Sat 21'];
const RUNS: Run[] = [
  { day: 0, time: '9:00', title: 'Sofa and loveseat', who: 'Elkhorn · Jim P.', tone: 'good' },
  { day: 0, time: '1:00', title: 'Dining set', who: 'Papillion · Ana R.', tone: 'good' },
  { day: 1, time: '10:00', title: 'Pick up: dresser', who: 'Customer drop-off', tone: 'info' },
  { day: 2, time: '9:30', title: 'Sectional', who: 'Bellevue · Jim P.', tone: 'wait' },
  { day: 2, time: '2:00', title: 'Recliner', who: 'Midtown · Ana R.', tone: 'good' },
  { day: 3, time: '11:00', title: 'Washer and dryer', who: 'Ralston · Jim P.', tone: 'problem' },
  { day: 4, time: '9:00', title: 'Bedroom set', who: 'Gretna · Ana R.', tone: 'good' },
  { day: 5, time: '10:30', title: 'Desk and chair', who: 'Benson · Jim P.', tone: 'info' },
];
const TONE_LABEL: Record<Tone, string> = { good: 'Booked', info: 'Pickup', wait: 'Unconfirmed', problem: 'Needs two', quiet: '' };

function RunCard({ run }: { run: Run }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: '10px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary' }}>{run.time}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{run.title}</Typography>
      <Typography variant="caption" component="div" sx={{ mb: 0.75 }}>{run.who}</Typography>
      <StatusPill tone={run.tone} label={TONE_LABEL[run.tone]} />
    </Box>
  );
}

export function CalendarDemo() {
  const phone = usePhone();
  const [day, setDay] = useState(2);
  const toolbar = (
    <PageToolbar lead={<Typography variant="h5" component="p">November 16 to 21</Typography>}>
      <Button variant="outlined">Today</Button>
      <Button variant="contained" startIcon={<I.add />}>New delivery</Button>
    </PageToolbar>
  );
  if (phone) {
    // Phone rule: one day at a time; the days are a row of chips.
    return (
      <PageShell>
        {toolbar}
        <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', pb: 0.5 }}>
          {DAYS.map((d, i) => (
            <Chip key={d} label={d} color={i === day ? 'primary' : 'default'} variant={i === day ? 'filled' : 'outlined'} onClick={() => setDay(i)} />
          ))}
        </Stack>
        <Stack spacing={1}>
          {RUNS.filter((r) => r.day === day).map((r) => <RunCard key={r.title} run={r} />)}
        </Stack>
      </PageShell>
    );
  }
  return (
    <PageShell width="wide">
      {toolbar}
      <Section flush>
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${DAYS.length}, minmax(0, 1fr))` }}>
          {DAYS.map((d, i) => (
            <Box key={d} sx={{ minWidth: 0, borderLeft: i ? '1px solid' : 0, borderColor: 'divider', bgcolor: i === day ? (t) => alpha(t.palette.secondary.main, 0.06) : undefined }}>
              <Box sx={{ py: 1.25, textAlign: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="overline" sx={{ color: i === day ? 'primary.main' : 'text.secondary' }}>{d.split(' ')[0]}</Typography>
                <Typography variant="h5" component="p" sx={{ color: i === day ? 'primary.main' : 'text.primary' }}>{d.split(' ')[1]}</Typography>
              </Box>
              <Stack spacing={1} sx={{ p: 1, minHeight: 260 }}>
                {RUNS.filter((r) => r.day === i).map((r) => <RunCard key={r.title} run={r} />)}
              </Stack>
            </Box>
          ))}
        </Box>
      </Section>
    </PageShell>
  );
}

// Report ----------------------------------------------------------------

const MONTHS = [
  { m: 'Jun', v: 41 }, { m: 'Jul', v: 44 }, { m: 'Aug', v: 47 }, { m: 'Sep', v: 52 }, { m: 'Oct', v: 58 }, { m: 'Nov', v: 63 },
];
const BY_DEPT = [
  { name: 'Furniture', units: '312', sales: '$28,410', margin: '61%', share: '45%' },
  { name: 'Home goods', units: '1,904', sales: '$14,220', margin: '68%', share: '23%' },
  { name: 'Clothing', units: '2,611', sales: '$9,870', margin: '74%', share: '16%' },
  { name: 'Electronics', units: '288', sales: '$10,310', margin: '52%', share: '16%' },
];

export function ReportDemo() {
  const max = Math.max(...MONTHS.map((x) => x.v));
  return (
    <PageShell width="wide">
      <PageToolbar
        lead={
          <TextField select size="small" defaultValue="nov" sx={{ minWidth: 180 }}>
            <MenuItem value="nov">November 2026</MenuItem>
            <MenuItem value="oct">October 2026</MenuItem>
          </TextField>
        }
      >
        <Button variant="outlined" startIcon={<I.download />}>Export</Button>
      </PageToolbar>
      <Box sx={tileGrid}>
        <StatTile label="Sales" value="$62,810" note="Up 9% on October" tone="good" />
        <StatTile label="Items sold" value="5,115" note="Up 6%" tone="good" />
        <StatTile label="Average ticket" value="$31" note="Down $2" tone="wait" />
        <StatTile label="Thrift+ share" value="18%" detail="of sales by members" />
      </Box>
      <Box sx={{ display: 'grid', gap: { xs: 2, md: 3 }, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1.7fr)' }, alignItems: 'start' }}>
        <Section title="Six months" hint="Sales, thousands of dollars">
          <Stack direction="row" spacing={{ xs: 1, md: 1.5 }} alignItems="flex-end" sx={{ height: 180 }}>
            {MONTHS.map((x, i) => (
              <Stack key={x.m} alignItems="center" justifyContent="flex-end" spacing={0.5} sx={{ flex: 1, height: '100%' }}>
                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{x.v}</Typography>
                <Box sx={{ width: '100%', maxWidth: 44, height: `${(x.v / max) * 78}%`, borderRadius: '8px 8px 2px 2px', bgcolor: i === MONTHS.length - 1 ? 'primary.main' : 'grey.200' }} />
                <Typography variant="caption">{x.m}</Typography>
              </Stack>
            ))}
          </Stack>
        </Section>
        <Section title="By department" flush>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Department</TableCell>
                <TableCell align="right" data-phone="hide">Units</TableCell>
                <TableCell align="right" data-phone="hide">Margin</TableCell>
                <TableCell align="right" data-phone="hide">Share</TableCell>
                <TableCell align="right">Sales</TableCell>
              </TableRow>
            </TableHead>
            <TableBody sx={{ '& td': { fontVariantNumeric: 'tabular-nums' } }}>
              {BY_DEPT.map((row) => (
                <TableRow key={row.name} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{row.name}</TableCell>
                  <TableCell align="right">{row.units}</TableCell>
                  <TableCell align="right">{row.margin}</TableCell>
                  <TableCell align="right">{row.share}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{row.sales}</TableCell>
                </TableRow>
              ))}
              <TableRow sx={{ '& td': { borderBottom: 0, fontWeight: 800, bgcolor: 'grey.100' } }}>
                <TableCell>Total</TableCell>
                <TableCell align="right">5,115</TableCell>
                <TableCell align="right">63%</TableCell>
                <TableCell align="right">100%</TableCell>
                <TableCell align="right">$62,810</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>
      </Box>
    </PageShell>
  );
}

// Form ----------------------------------------------------------------

const OPENING = ['Count the drawer', 'Lights and music on', 'Walk the floor for fallen tags', 'Unlock the front door'];

export function FormDemo() {
  const [done, setDone] = useState([true, true, false, false]);
  const count = done.filter(Boolean).length;
  return (
    <PageShell width="narrow">
      <Section title="The item">
        <Stack spacing={2}>
          <TextField label="What is it" defaultValue="Walnut 6-drawer dresser" fullWidth />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Department" defaultValue="furniture" fullWidth>
              <MenuItem value="furniture">Furniture</MenuItem>
              <MenuItem value="home">Home goods</MenuItem>
            </TextField>
            <TextField
              label="Retail price"
              defaultValue="529.00"
              fullWidth
              slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
            />
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ p: 1.5, borderRadius: '10px', bgcolor: 'success.light' }}>
            <Typography variant="body2" sx={{ color: 'success.dark' }}>Tag at <b>$289</b>: 55% of retail.</Typography>
            <StatusPill tone="good" label="In range" />
          </Stack>
        </Stack>
      </Section>
      <Section title="Opening checklist" hint="The checklist variant of the same page type" action={<Typography variant="caption">{count} of {OPENING.length}</Typography>}>
        <LinearProgress variant="determinate" value={(count / OPENING.length) * 100} sx={{ mb: 1 }} />
        <Stack>
          {OPENING.map((label, i) => (
            <FormControlLabel
              key={label}
              label={label}
              control={<Checkbox checked={done[i]} onChange={() => setDone(done.map((v, j) => (j === i ? !v : v)))} color="success" />}
              sx={{ py: 0.25, color: done[i] ? 'text.secondary' : 'text.primary', textDecoration: done[i] ? 'line-through' : 'none' }}
            />
          ))}
        </Stack>
      </Section>
      {/* Phone rule: the button is always in reach. */}
      <Stack
        direction="row"
        spacing={1}
        justifyContent="flex-end"
        sx={{
          position: 'sticky',
          bottom: 12,
          p: 1.25,
          borderRadius: 999,
          bgcolor: (t) => alpha(t.palette.background.paper, 0.94),
          backdropFilter: 'blur(8px)',
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: 3,
        }}
      >
        <Button variant="text">Cancel</Button>
        <Button variant="contained" startIcon={<I.save />}>Save item</Button>
      </Stack>
    </PageShell>
  );
}

// Settings ----------------------------------------------------------------

const SETTINGS_NAV = [
  { label: 'Register', Icon: I.register },
  { label: 'Receipts', Icon: I.receipt },
  { label: 'Thrift+', Icon: I.thriftPlus },
  { label: 'Printers', Icon: I.printables },
];
const TOGGLES = [
  ['Ask for a Thrift+ phone number', 'At the start of every sale.', true],
  ['Print a receipt', 'Off: the customer is asked if they want one.', false],
  ['Round cash to the nearest nickel', 'Card sales are never rounded.', true],
  ['Lock the register after 5 minutes', 'Sign in again with your PIN.', true],
] as const;

export function SettingsDemo() {
  const phone = usePhone();
  const [picked, setPicked] = useState<number | null>(phone ? null : 0);
  const shown = picked ?? (phone ? null : 0);
  const nav = (
    <Section flush>
      <List sx={{ p: 0.75 }}>
        {SETTINGS_NAV.map(({ label, Icon }, i) => (
          <ListItemButton key={label} selected={!phone && i === shown} onClick={() => setPicked(i)} sx={{ borderRadius: '10px', mb: 0.25 }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'text.primary' }}><Icon sx={{ fontSize: 22 }} /></ListItemIcon>
            <ListItemText primary={label} slotProps={{ primary: { variant: 'body2', sx: { fontWeight: i === shown ? 800 : 600 } } }} />
          </ListItemButton>
        ))}
      </List>
    </Section>
  );
  const panel = shown === null ? null : (
    <Section
      title={SETTINGS_NAV[shown].label}
      hint="Saved as you change it"
      action={phone ? <IconButton aria-label="Back" onClick={() => setPicked(null)}><I.back /></IconButton> : undefined}
    >
      {TOGGLES.map(([title, body, on]) => (
        <Stack key={title} direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{title}</Typography>
            <Typography variant="caption" component="div">{body}</Typography>
          </Box>
          <Switch defaultChecked={on} />
        </Stack>
      ))}
    </Section>
  );
  if (phone) return <PageShell>{panel ?? nav}</PageShell>;
  return (
    <PageShell>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: '240px minmax(0, 1fr)', alignItems: 'start' }}>
        {nav}
        {panel}
      </Box>
    </PageShell>
  );
}
