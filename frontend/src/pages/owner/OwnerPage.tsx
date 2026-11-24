/**
 * Owner (2026-10-21, critic review digest points 4 and 9): the owner's home. It replaced the morning brief.
 * Since Dash Updates #5 (2026-11-02) it is one page with tabs, each with its own URL: Overview (/owner), Reports
 * (/owner/reports), Approvals (/owner/approvals, the Requests page) and Dash Updates (/owner/updates, every update,
 * private ones too). The avatar menu's OWNER section has this one link.
 * Scorecard (week and month), Needs you, links to every owner-only page, and AI spend. Social (Lane F Phase 5): this
 * week's posts and their numbers, marketing spend, and the rough read of post days against tickets and sales.
 */
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useWaitingApprovals } from '../../components/layout/NotificationBell';
import {
  fetchAiSpend,
  fetchNeedsYou,
  fetchScorecard,
  fetchSocialCard,
  type AiSpend,
  type NeedsYou,
  type Scorecard,
  type SocialCard,
  type ScorecardPeriod,
  type SpendRange,
} from '../../api/owner.api';
import { getAppErrors, markAppErrorsSeen } from '../../api/core.api';
import { fetchExpiringBucks } from '../../api/thriftplus.api';
import { getSupplySpendSummary } from '../../api/supplies.api';
import { NAV_ITEM_CATALOG } from '../../navigation/navItemCatalog';
import { formatCurrency, formatCurrencyWhole } from '../../utils/format';
import { AdResultsDialog } from '../studios/social/AdResultsDialog';

const ReportsPage = lazy(() => import('../reports/ReportsPage'));
const RequestsPage = lazy(() => import('../admin/RequestsPage'));
const DashFixesPage = lazy(() => import('../dashFixes/DashFixesPage'));
// Texts (#132): the inbox for our toll-free number; owner only since 2026-11-13 (texts cost money and must stay private).
const TextsPage = lazy(() => import('../texts/TextsPage'));
// Testing (owner 2026-11-24): what his own devices see on the website, for 24 hours.
const OwnerTesting = lazy(() => import('./OwnerTesting'));

/** The Owner page's tabs, one URL each. */
const OWNER_TABS = [
  { key: 'overview', path: '/owner', label: 'Overview' },
  { key: 'reports', path: '/owner/reports', label: 'Reports' },
  { key: 'approvals', path: '/owner/approvals', label: 'Approvals' },
  { key: 'updates', path: '/owner/updates', label: 'Dash Updates' },
  { key: 'texts', path: '/owner/texts', label: 'Texts' },
  { key: 'testing', path: '/owner/testing', label: 'Testing' },
] as const;
/** Catalog items that are tabs here now, so the Owner pages list leaves them out. */
const TAB_ITEMS = new Set(['owner', 'reports', 'superRequests']);

/** Owner-only pages with no sidebar entry. */
const EXTRA_OWNER_LINKS = [
  { label: 'Data checks (QA)', path: '/admin/qa' },
  // The week's supply order (owner, 2026-10-26); the lists are in the sidebar for everyone.
  { label: 'Supply order', path: '/supplies/order' },
];

const SPEND_RANGES: { value: SpendRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

export function ownerLinks(): { label: string; path: string }[] {
  const fromNav = Object.values(NAV_ITEM_CATALOG)
    .filter((item) => item.superuserOnly && !TAB_ITEMS.has(item.id))
    .map((item) => ({ label: item.label, path: item.path }));
  return [...fromNav, ...EXTRA_OWNER_LINKS].sort((a, b) => a.label.localeCompare(b.label));
}

/** AI calls cost fractions of a cent: show "<$0.01" rather than "$0.00" when there was some. */
export function aiMoney(value: string): string {
  const n = Number.parseFloat(value);
  if (n > 0 && n < 0.01) return '<$0.01';
  return formatCurrency(value);
}

function pct(value: string | null): string {
  return value == null ? '-' : `${value}%`;
}

type Tone = 'success.main' | 'warning.main' | 'text.primary';

function bandTone(value: string | null, low: number, high: number): Tone {
  if (value == null) return 'text.primary';
  const n = Number.parseFloat(value);
  return n >= low && n <= high ? 'success.main' : 'warning.main';
}

function Section({ title, hint, children, action, id }: { title: string; hint?: string; children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <Card variant="outlined" id={id} sx={{ minWidth: 0 }}>
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, gap: 1, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>{title}</Typography>
            {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
          </Box>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

type ScoreRow = { label: string; hint: string; value: (p: ScorecardPeriod) => string; tone?: (p: ScorecardPeriod) => Tone };

function scoreRows(card: Scorecard): ScoreRow[] {
  const [low, high] = card.targets.buying_pct_of_processing;
  const target = card.targets.processing_pct_of_sales;
  return [
    { label: 'Net item sales', hint: 'Item sales after Thrift+ returns (the Dashboard number).', value: (p) => formatCurrencyWhole(p.net_item_sales) },
    { label: 'Buying', hint: 'Orders placed (landed cost).', value: (p) => formatCurrencyWhole(p.buying) },
    { label: 'Processed', hint: 'What Processing put on the floor, at tag.', value: (p) => formatCurrencyWhole(p.processing) },
    {
      label: `Buying % of processed (target ${low}-${high}%)`,
      hint: 'Buying spend divided by what was processed. While shelves fill it runs high.',
      value: (p) => pct(p.buying_pct_of_processing),
      tone: (p) => bandTone(p.buying_pct_of_processing, low, high),
    },
    {
      label: `Processed % of sales (target ${target}%)`,
      hint: 'What was processed divided by Net item sales. Within 10% of the target shows green.',
      value: (p) => pct(p.processing_pct_of_sales),
      tone: (p) => bandTone(p.processing_pct_of_sales, target * 0.9, target * 1.1),
    },
    { label: 'Labor', hint: 'Hours worked times each person\'s pay rate (straight time).', value: (p) => `${formatCurrencyWhole(p.labor)} (${p.labor_hours} h)` },
    { label: 'Labor % of sales', hint: 'Labor divided by Net item sales.', value: (p) => pct(p.labor_pct_of_sales) },
    { label: 'Shrink', hint: 'Comes with shrink by age (items unseen on the floor).', value: (p) => (p.shrink == null ? 'Coming' : formatCurrencyWhole(p.shrink)) },
  ];
}

function ScorecardTable({ card }: { card: Scorecard }) {
  const rows = scoreRows(card);
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-label="Scorecard">
        <TableHead>
          <TableRow>
            <TableCell />
            {card.periods.map((p) => (
              <TableCell key={p.key} align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{p.label}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label}>
              <TableCell component="th" scope="row">
                <Tooltip title={row.hint} enterDelay={250}><span style={{ cursor: 'help' }}>{row.label}</span></Tooltip>
              </TableCell>
              {card.periods.map((p) => (
                <TableCell key={p.key} align="right" sx={{ whiteSpace: 'nowrap', color: row.tone?.(p) ?? 'text.primary', fontWeight: row.tone ? 600 : 400 }}>
                  {row.value(p)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/** Phones: one period at a time (a tap switches it), each number on its own line with its plain-words hint. */
function ScorecardList({ card }: { card: Scorecard }) {
  const [key, setKey] = useState<ScorecardPeriod['key']>('this_week');
  const period = card.periods.find((p) => p.key === key) ?? card.periods[0];
  return (
    <Stack spacing={1}>
      <ToggleButtonGroup size="small" exclusive fullWidth value={key} onChange={(_, v: ScorecardPeriod['key'] | null) => v && setKey(v)} aria-label="Scorecard period">
        {card.periods.map((p) => (
          <ToggleButton key={p.key} value={p.key} sx={{ textTransform: 'none', px: 0.5 }}>{p.label}</ToggleButton>
        ))}
      </ToggleButtonGroup>
      <List dense disablePadding aria-label="Scorecard">
        {scoreRows(card).map((row) => (
          <Box key={row.label} sx={{ display: 'flex', alignItems: 'baseline', gap: 1, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.label}</Typography>
              <Typography variant="caption" color="text.secondary">{row.hint}</Typography>
            </Box>
            <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: row.tone?.(period) ?? 'text.primary' }}>
              {row.value(period)}
            </Typography>
          </Box>
        ))}
      </List>
    </Stack>
  );
}

/** Days ahead the owed chart shows, and its height with the two lines under it: fixed, so nothing moves on load. */
const AHEAD_DAYS = 21;
const OWED_CHART_HEIGHT = 108;

const dayName = (day: string, n: number) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : format(parseISO(day), 'EEE, MMM d'));

/**
 * What is owed to members on one time line (Dash Update #188, owner 2026-11-19): the last weeks in green up to
 * today, then the next 21 days in orange, dropping by the ThriftBucks that expire each day (if nobody spends or
 * collects). Under the orange part, a bar per expiry day sized by what expires (hover: the day, the amount, how many
 * members). One time scale for both, by day.
 */
function OwedChart({ trend }: { trend: Scorecard['thrift_plus_owed']['trend'] }) {
  const q = useQuery({ queryKey: ['owner', 'thriftbucks-expiring'], queryFn: () => fetchExpiringBucks(AHEAD_DAYS) });
  const e = q.data;
  const w = 240;
  const h = 64;
  const today = parseISO(trend[trend.length - 1].day);
  const past = trend.map((t) => ({ ...t, n: differenceInCalendarDays(parseISO(t.day), today), value: Number.parseFloat(t.owed) }));
  const now = past[past.length - 1].value;
  const first = Math.min(past[0].n, -1);
  const span = AHEAD_DAYS - first;
  const max = Math.max(...past.map((t) => t.value), 1) * 1.08;
  const x = (n: number) => ((n - first) / span) * w;
  const y = (v: number) => h - 1 - (Math.max(v, 0) / max) * (h - 2);
  const rows = (e?.rows ?? []).map((r) => ({ ...r, n: differenceInCalendarDays(parseISO(r.day), today), value: Number.parseFloat(r.amount) }));
  const drops: { day: string; n: number; value: number; members: number; from: number; to: number }[] = [];
  let level = now;
  for (const r of rows.filter((r) => r.n >= 1 && r.n <= AHEAD_DAYS)) {
    drops.push({ ...r, from: level, to: level - r.value });
    level -= r.value;
  }
  // The orange line: level until the day's drop, then down (a step at the start of each expiry day).
  let ahead = `${x(0)},${y(now)}`;
  for (const d of drops) ahead += ` ${x(d.n - 1)},${y(d.from)} ${x(d.n - 1)},${y(d.to)}`;
  ahead += ` ${x(AHEAD_DAYS)},${y(level)}`;
  const within = (days: number) => rows.filter((r) => r.n <= days).reduce((sum, r) => sum + r.value, 0);
  const slot = w / span;
  const biggest = Math.max(...drops.map((d) => d.value), 1);
  return (
    <Box sx={{ height: OWED_CHART_HEIGHT }} data-testid="owed-chart">
      <Box
        component="svg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        sx={{ width: '100%', maxWidth: 280, height: h, display: 'block' }}
        role="img"
        aria-label={`Owed over the last weeks, then the next ${AHEAD_DAYS} days as ThriftBucks expire`}
      >
        <line x1={x(0)} y1={0} x2={x(0)} y2={h} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        {drops.map((d) => {
          const bar = Math.max((d.value / biggest) * h * 0.4, 1.5);
          return (
            <Box component="rect" key={d.day} x={x(d.n - 1) + 0.3} y={h - bar} width={Math.max(slot - 0.6, 0.8)} height={bar} sx={{ fill: (t) => t.palette.warning.main, fillOpacity: 0.45 }}>
              <title>{`${dayName(d.day, d.n)}: ${formatCurrency(d.value)}, ${d.members} ${d.members === 1 ? 'member' : 'members'}`}</title>
            </Box>
          );
        })}
        {e ? <Box component="polyline" points={ahead} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" sx={{ stroke: (t) => t.palette.warning.main }} /> : null}
        <Box component="polyline" points={past.map((t) => `${x(t.n)},${y(t.value)}`).join(' ')} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" sx={{ stroke: (t) => t.palette.success.main }} />
        {past.map((t) => (
          <rect key={t.day} x={x(t.n) - 3} y={0} width={6} height={h} fill="transparent">
            <title>{`${t.n === 0 ? 'Today' : format(parseISO(t.day), 'MMM d')}: ${formatCurrencyWhole(t.owed)} owed`}</title>
          </rect>
        ))}
      </Box>
      {e ? (
        <>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ whiteSpace: 'nowrap', mt: 0.25 }}>
            Expiring tomorrow {formatCurrencyWhole(within(1))}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ whiteSpace: 'nowrap' }}>
            7 days {formatCurrencyWhole(within(7))} | {AHEAD_DAYS} days {formatCurrencyWhole(within(AHEAD_DAYS))}
          </Typography>
        </>
      ) : q.isError ? (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.25 }}>Expiring ThriftBucks did not load.</Typography>
      ) : null}
    </Box>
  );
}

function NeedsYouList({ data }: { data: NeedsYou }) {
  const navigate = useNavigate();
  const waiting = data.items.filter((i) => i.count > 0);
  const openLink = (link: string) => {
    const [path, anchor] = link.split('#');
    if (anchor && path === '/owner') document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
    else navigate(link);
  };
  return (
    <Stack spacing={1}>
      {waiting.length ? (
        <List dense disablePadding>
          {waiting.map((item) => (
            <ListItemButton key={item.key} onClick={() => openLink(item.link)} sx={{ borderRadius: 1 }}>
              <ListItemText primary={item.label} secondary={item.detail || null} />
              <Chip size="small" variant="outlined" label={item.count} color={item.tone} sx={{ ml: 1 }} />
            </ListItemButton>
          ))}
        </List>
      ) : (
        <Typography color="text.secondary">Nothing is waiting on you.</Typography>
      )}
      {data.errors.length ? <Alert severity="warning">Some counts could not load: {data.errors.join('; ')}</Alert> : null}
    </Stack>
  );
}

function SpendTable({ title, rows }: { title: string; rows: { name: string; cost: string; calls: number }[] }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>{title}</Typography>
      {rows.length ? (
        <Table size="small" aria-label={title}>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell sx={{ pl: 0 }}>{r.name}</TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{r.calls} {r.calls === 1 ? 'call' : 'calls'}</TableCell>
                <TableCell align="right" sx={{ pr: 0, whiteSpace: 'nowrap' }}>{aiMoney(r.cost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Typography variant="body2" color="text.secondary">No AI calls.</Typography>
      )}
    </Box>
  );
}

function AiSpendBody({ spend }: { spend: AiSpend }) {
  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="h4" component="p" sx={{ fontWeight: 800 }}>{aiMoney(spend.total)}</Typography>
        <Typography variant="caption" color="text.secondary">
          {spend.calls} {spend.calls === 1 ? 'call' : 'calls'}{spend.failed ? `, ${spend.failed} failed` : ''}
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <SpendTable title="By feature" rows={spend.by_feature.map((f) => ({ name: f.feature, cost: f.cost, calls: f.calls }))} />
        <SpendTable title="By who" rows={spend.by_who.map((w) => ({ name: w.who, cost: w.cost, calls: w.calls }))} />
      </Box>
    </Stack>
  );
}

/** "+12.5%" or "-". */
function lift(value: string | null): string {
  if (value == null) return '-';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function SocialBody({ card, onOpen }: { card: SocialCard; onOpen: (path: string) => void }) {
  const [pasting, setPasting] = useState(false);
  const top = card.top_ad;
  const stat = (label: string, value: string | number, hint?: string) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
    </Box>
  );
  const read = card.read;
  return (
    <Stack spacing={1}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
        {stat('Posts this week', `${card.posted} of ${card.planned}`)}
        {stat('Reach', card.reach.toLocaleString(), card.with_numbers ? `${card.with_numbers} with numbers` : 'no numbers yet')}
        {stat('Engagement', card.engagement.toLocaleString())}
        {stat('Spend', formatCurrency(card.spend_week), `${formatCurrency(card.spend_month)} this month`)}
      </Box>
      {card.best ? (
        <Typography variant="body2">
          Best this week: <b>{card.best.post_type_label}</b>, {card.best.hook || 'no hook'} ({card.best.engagement} engagement)
        </Typography>
      ) : null}
      <Typography variant="body2">
        {read.post_days
          ? <>Post days, last {read.weeks} weeks: tickets <b>{lift(read.ticket_lift)}</b>, sales <b>{lift(read.sales_lift)}</b> against the same weekday ({read.post_days} days).{read.top_type ? <> Best type: {read.top_type.label} ({lift(read.top_type.ticket_lift)} tickets, {read.top_type.days} days).</> : null}</>
          : 'Not enough post days yet for a read on tickets and sales.'}
      </Typography>
      {top ? (
        <Typography variant="body2" data-testid="owner-top-ad">
          Top ad: <b>{top.label}</b> ({top.watched}), {formatCurrency(top.spent)} for {top.extra_units} extra units,{' '}
          <b>{formatCurrency(top.cost_per_extra_unit)}</b> each.
        </Typography>
      ) : null}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {card.numbers_due ? <Chip size="small" color="warning" label={`${card.numbers_due} numbers due`} /> : null}
        <Button size="small" onClick={() => onOpen(card.link)}>Open Numbers</Button>
        <Button size="small" onClick={() => setPasting(true)}>Paste ad results</Button>
      </Box>
      {pasting ? <AdResultsDialog open onClose={() => setPasting(false)} /> : null}
    </Stack>
  );
}

function SiteErrors() {
  const queryClient = useQueryClient();
  const errors = useQuery({ queryKey: ['owner', 'site-errors'], queryFn: () => getAppErrors(5).then((r) => r.data) });
  const seen = useMutation({
    mutationFn: () => markAppErrorsSeen().then((r) => r.data),
    onSuccess: (data) => {
      queryClient.setQueryData(['owner', 'site-errors'], data);
      void queryClient.invalidateQueries({ queryKey: ['owner', 'needs-you'] });
    },
  });
  const data = errors.data;
  return (
    <Section
      id="site-errors"
      title="Site errors"
      hint="Server errors and screen crashes, newest first."
      action={data?.open_count ? (
        <Button size="small" onClick={() => seen.mutate()} disabled={seen.isPending}>Mark all seen</Button>
      ) : null}
    >
      {errors.isLoading ? <LinearProgress /> : null}
      {errors.isError ? <Alert severity="error">Site errors did not load.</Alert> : null}
      {data ? (
        <Stack spacing={0.5}>
          <Typography variant="body2">
            {data.open_count} not yet seen | {data.last_24h} in the last 24 hours | {data.last_7d} in 7 days
          </Typography>
          {data.latest.length ? (
            <List dense disablePadding aria-label="Latest site errors">
              {data.latest.map((e) => (
                <ListItemText
                  key={e.id}
                  primary={`${e.seen ? '' : 'New: '}${e.message || 'No message'}`}
                  secondary={`${format(parseISO(e.created_at), 'MMM d, h:mm a')} | ${e.source} | ${e.path || '-'}${e.user ? ` | ${e.user}` : ''}`}
                  sx={{ my: 0.5 }}
                />
              ))}
            </List>
          ) : (
            <Typography color="text.secondary">No errors recorded.</Typography>
          )}
        </Stack>
      ) : null}
    </Section>
  );
}

export default function OwnerPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const waiting = useWaitingApprovals(true);
  const current = OWNER_TABS.find((t) => pathname.replace(/\/$/, '') === t.path);
  if (!current) return <Navigate to="/owner" replace />;
  return (
    <Box sx={{ maxWidth: 1600 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>Owner</Typography>
      <Tabs
        value={current.key}
        onChange={(_, key: string) => {
          const next = OWNER_TABS.find((t) => t.key === key);
          if (next) navigate(next.path);
        }}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ mb: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        {OWNER_TABS.map((t) => (
          <Tab
            key={t.key}
            value={t.key}
            data-testid={`owner-tab-${t.key}`}
            label={t.key === 'approvals' && waiting > 0 ? `${t.label} ${waiting}` : t.label}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          />
        ))}
      </Tabs>
      <Suspense fallback={<LinearProgress />}>
        {current.key === 'overview' ? <OwnerOverview /> : null}
        {current.key === 'reports' ? <ReportsPage embedded /> : null}
        {current.key === 'approvals' ? <RequestsPage embedded /> : null}
        {current.key === 'updates' ? <DashFixesPage embedded /> : null}
        {current.key === 'texts' ? <TextsPage /> : null}
        {current.key === 'testing' ? <OwnerTesting /> : null}
      </Suspense>
    </Box>
  );
}

/** Overview: Scorecard, Owed, Needs you, Supplies, AI spend, Social, site errors and the other owner pages. */
function OwnerOverview() {
  const navigate = useNavigate();
  const [range, setRange] = useState<SpendRange>('today');
  const scorecard = useQuery({ queryKey: ['owner', 'scorecard'], queryFn: fetchScorecard });
  const needs = useQuery({ queryKey: ['owner', 'needs-you'], queryFn: fetchNeedsYou });
  const spend = useQuery({ queryKey: ['owner', 'ai-spend', range], queryFn: () => fetchAiSpend(range) });
  const social = useQuery({ queryKey: ['owner', 'social'], queryFn: fetchSocialCard });
  const supplies = useQuery({ queryKey: ['owner', 'supply-spend'], queryFn: getSupplySpendSummary });
  const owed = scorecard.data?.thrift_plus_owed;
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const scoreCard = (
    <Section title="Scorecard" hint={desktop ? 'Weeks run Monday to Sunday. Hover a row for what it counts.' : 'Weeks run Monday to Sunday.'}>
      {scorecard.isLoading ? <LinearProgress /> : null}
      {scorecard.isError ? <Alert severity="error">The Scorecard did not load.</Alert> : null}
      {scorecard.data ? (desktop ? <ScorecardTable card={scorecard.data} /> : <ScorecardList card={scorecard.data} />) : null}
    </Section>
  );
  const owedCard = (
    <Section title="Owed to members" hint="Thrift+ ThriftBucks kept plus store credit.">
      {owed ? (
        <Stack spacing={0.5}>
          <Typography variant="h4" component="p" sx={{ fontWeight: 800 }}>{formatCurrencyWhole(owed.total)}</Typography>
          <Typography variant="caption" color="text.secondary">
            ThriftBucks {formatCurrency(owed.banked)} | Store credit {formatCurrency(owed.credit)}
          </Typography>
          <OwedChart trend={owed.trend} />
          <Box><Button size="small" onClick={() => navigate(owed.link)}>Open Thrift+</Button></Box>
        </Stack>
      ) : scorecard.isLoading ? <LinearProgress /> : null}
    </Section>
  );
  // Supplies spend (owner, 2026-10-28): the small number; the tables are on the order page.
  const suppliesCard = (
    <Section title="Supplies spend" hint="Supply lines ticked Ordered.">
      {supplies.isError ? <Alert severity="error">Supplies spend did not load.</Alert> : null}
      {supplies.data ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography data-testid="owner-supply-spend">
            <b>{formatCurrency(supplies.data.this_week)}</b> this week · <b>{formatCurrency(supplies.data.this_month)}</b> this month
          </Typography>
          <Button size="small" onClick={() => navigate('/supplies/order')}>Open</Button>
        </Stack>
      ) : supplies.isLoading ? <LinearProgress /> : null}
    </Section>
  );
  const needsCard = (
    <Section title="Needs you">
      {needs.isLoading ? <LinearProgress /> : null}
      {needs.isError ? <Alert severity="error">Needs you did not load.</Alert> : null}
      {needs.data ? <NeedsYouList data={needs.data} /> : null}
    </Section>
  );
  const aiCard = (
    <Section
      title="AI spend"
      hint="Every AI call's estimated cost, by where it ran and who asked."
      action={(
        <ToggleButtonGroup size="small" exclusive value={range} onChange={(_, v: SpendRange | null) => v && setRange(v)} aria-label="AI spend range">
          {SPEND_RANGES.map((r) => <ToggleButton key={r.value} value={r.value} sx={{ textTransform: 'none' }}>{r.label}</ToggleButton>)}
        </ToggleButtonGroup>
      )}
    >
      {spend.isLoading ? <LinearProgress /> : null}
      {spend.isError ? <Alert severity="error">AI spend did not load.</Alert> : null}
      {spend.data ? <AiSpendBody spend={spend.data} /> : null}
    </Section>
  );
  const socialCard = (
    <Section title="Social" hint="This week's posts and their numbers, marketing spend, and a rough read on sales. Not proof.">
      {social.isLoading ? <LinearProgress /> : null}
      {social.isError ? <Alert severity="error">Social did not load.</Alert> : null}
      {social.data ? <SocialBody card={social.data} onOpen={navigate} /> : null}
    </Section>
  );
  const linksCard = (
    <Section title="Owner pages">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {ownerLinks().map((link) => (
          <Button key={link.path} size="small" variant="outlined" onClick={() => navigate(link.path)} sx={{ textTransform: 'none' }}>
            {link.label}
          </Button>
        ))}
      </Box>
    </Section>
  );

  return (
    <Box>
      {desktop ? (
        // Desktop: the numbers on the left, the to-dos on the right, each column stacking on its own.
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 1.5, alignItems: 'start' }}>
          <Stack spacing={1.5} sx={{ minWidth: 0 }}>{scoreCard}{socialCard}{aiCard}</Stack>
          <Stack spacing={1.5} sx={{ minWidth: 0 }}>{owedCard}{needsCard}{suppliesCard}<SiteErrors />{linksCard}</Stack>
        </Box>
      ) : (
        // Phone: one column, what needs you first.
        <Stack spacing={1.5}>{needsCard}{owedCard}{suppliesCard}{scoreCard}{socialCard}{aiCard}<SiteErrors />{linksCard}</Stack>
      )}
    </Box>
  );
}
