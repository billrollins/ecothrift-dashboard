/**
 * Owner (2026-10-21, critic review digest points 4 and 9): the owner's home. It replaced the morning brief.
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { NAV_ITEM_CATALOG } from '../../navigation/navItemCatalog';
import { formatCurrency, formatCurrencyWhole } from '../../utils/format';

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
    .filter((item) => item.superuserOnly && item.id !== 'owner')
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

function OwedTrend({ trend }: { trend: Scorecard['thrift_plus_owed']['trend'] }) {
  const values = trend.map((t) => Number.parseFloat(t.owed));
  const max = Math.max(...values, 1);
  const w = 200;
  const h = 40;
  const points = values.map((v, i) => `${(i * w) / Math.max(values.length - 1, 1)},${h - (v / max) * (h - 4) - 2}`).join(' ');
  return (
    <Tooltip title={trend.map((t) => `${t.day}: ${formatCurrencyWhole(t.owed)}`).join(' | ')} enterDelay={250}>
      <Box component="svg" viewBox={`0 0 ${w} ${h}`} sx={{ width: '100%', maxWidth: 240, height: 40, color: 'primary.main' }} role="img" aria-label="Owed over the last weeks">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} />
      </Box>
    </Tooltip>
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
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {card.numbers_due ? <Chip size="small" color="warning" label={`${card.numbers_due} numbers due`} /> : null}
        <Button size="small" onClick={() => onOpen(card.link)}>Open Numbers</Button>
      </Box>
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
  const navigate = useNavigate();
  const [range, setRange] = useState<SpendRange>('today');
  const scorecard = useQuery({ queryKey: ['owner', 'scorecard'], queryFn: fetchScorecard });
  const needs = useQuery({ queryKey: ['owner', 'needs-you'], queryFn: fetchNeedsYou });
  const spend = useQuery({ queryKey: ['owner', 'ai-spend', range], queryFn: () => fetchAiSpend(range) });
  const social = useQuery({ queryKey: ['owner', 'social'], queryFn: fetchSocialCard });
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
          <OwedTrend trend={owed.trend} />
          <Box><Button size="small" onClick={() => navigate(owed.link)}>Open Thrift+</Button></Box>
        </Stack>
      ) : scorecard.isLoading ? <LinearProgress /> : null}
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
    <Box sx={{ maxWidth: 1600 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800, mb: 1.5 }}>Owner</Typography>
      {desktop ? (
        // Desktop: the numbers on the left, the to-dos on the right, each column stacking on its own.
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 1.5, alignItems: 'start' }}>
          <Stack spacing={1.5} sx={{ minWidth: 0 }}>{scoreCard}{socialCard}{aiCard}</Stack>
          <Stack spacing={1.5} sx={{ minWidth: 0 }}>{owedCard}{needsCard}<SiteErrors />{linksCard}</Stack>
        </Box>
      ) : (
        // Phone: one column, what needs you first.
        <Stack spacing={1.5}>{needsCard}{owedCard}{scoreCard}{socialCard}{aiCard}<SiteErrors />{linksCard}</Stack>
      )}
    </Box>
  );
}
