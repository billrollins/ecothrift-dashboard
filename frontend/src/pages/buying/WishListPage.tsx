import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import CloseRounded from '@mui/icons-material/CloseRounded';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Link as MuiLink,
  Paper,
  Skeleton,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  deleteBuyingWatchlist,
  postBuyingAuctionArchive,
  postBuyingWatchlist,
  type WishlistRank,
} from '../../api/buying.api';
import { ScoreBadge } from '../../components/buying/decision/ScoreBadge';
import { HAZARD_LONG, HAZARD_SHORT, hazardTone } from '../../components/buying/manifestHazards';
import { useBuyingCategoryNeed } from '../../hooks/useBuyingCategoryNeed';
import { useBuyingWatchlist } from '../../hooks/useBuyingWatchlist';
import { useBuyingWishlist } from '../../hooks/useBuyingWishlist';
import type { BuyingCategoryNeedRow, BuyingWatchlistAuctionItem, WishlistAuction, WishlistResponse } from '../../types/buying.types';
import { formatCurrencyWhole } from '../../utils/format';

const RANKS: Array<{ value: WishlistRank; label: string }> = [
  { value: 'focus', label: 'Focus' },
  { value: 'profit', label: 'Profit' },
  { value: 'need', label: 'Need' },
  { value: 'speed', label: 'Speed' },
  { value: 'ending', label: 'Ending' },
];

function num(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function short(value: string | null | undefined): string {
  const n = num(value);
  if (n == null) return '';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : formatCurrencyWhole(n);
}

function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function endsIn(end: string | null, now: number): { left: string; at: string; soon: boolean } {
  if (!end) return { left: '-', at: '', soon: false };
  const t = parseISO(end).getTime();
  const minutes = Math.max(Math.round((t - now) / 60_000), 0);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const left = days > 0 ? `${days}d ${hours}h` : `${hours}h ${String(mins).padStart(2, '0')}m`;
  return { left, at: format(parseISO(end), days > 0 ? 'EEE h:mm a' : 'h:mm a'), soon: minutes < 120 };
}

const NEED_CHIP: Record<string, { color: 'primary' | 'default'; variant: 'filled' | 'outlined' }> = {
  High: { color: 'primary', variant: 'filled' },
  Med: { color: 'primary', variant: 'outlined' },
  Low: { color: 'default', variant: 'outlined' },
};

// ── Today's plan ──────────────────────────────────────────────────────────────

const DAY_MS = 24 * 3_600_000;
const DAILY_GOAL = 2;

/**
 * The goal is 1 or 2 lots a day: the two best (by Priority) that end within a day and are still
 * at or under their max, and how many are already won today.
 */
function PlanCard({ rows, wonToday, now }: { rows: WishlistAuction[]; wonToday: number; now: number }) {
  const picks = rows
    .filter((r) => r.state !== 'over' && r.end_time && parseISO(r.end_time).getTime() - now < DAY_MS)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, DAILY_GOAL);
  const met = wonToday >= DAILY_GOAL;
  const heading = met
    ? 'Goal met for today'
    : picks.length === 0
      ? 'Nothing worth it ends today'
      : picks.length === 1
        ? 'Bid on this one'
        : 'Bid on these 2';
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderColor: met ? 'success.main' : 'primary.main', borderWidth: 1.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 3 }} alignItems={{ md: 'center' }}>
        <Box sx={{ minWidth: 200 }}>
          <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '0.1em', display: 'block', lineHeight: 1.4 }}>
            Today&apos;s plan
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{heading}</Typography>
          <Typography variant="body2" color="text.secondary">Won today: {wonToday} of 1 to 2</Typography>
        </Box>
        {met
          ? null
          : picks.map((r, index) => {
              const ends = endsIn(r.end_time, now);
              const max = r.max_bid ?? r.price_target;
              return (
                <Box key={r.id} sx={{ flex: 1, minWidth: 0 }}>
                  <MuiLink component={RouterLink} to={`/buying/auctions/${r.id}`} underline="hover" sx={{ fontWeight: 800, display: 'block' }}>
                    {`${index + 1}. ${r.marketplace}, ends ${ends.at}`}
                  </MuiLink>
                  <Typography variant="body2" color="text.secondary">
                    {max ? `Max ${formatCurrencyWhole(max)}` : 'No max yet'}
                    {r.expected_close ? ` · likely ${formatCurrencyWhole(r.expected_close)}` : ''}
                    {` · ${ends.left} left`}
                  </Typography>
                </Box>
              );
            })}
      </Stack>
    </Paper>
  );
}

// ── Shortlist ─────────────────────────────────────────────────────────────────

/** Max for a watched lot: the buyer's own, else the price target. */
function shortlistMax(auction: BuyingWatchlistAuctionItem): { max: number | null; mine: boolean } {
  const mine = num(auction.max_bid);
  return mine != null ? { max: mine, mine: true } : { max: num(auction.price_target), mine: false };
}

/**
 * The advisor's shortlist: every watched lot still live, soonest first, with its max and the
 * room left (over-max ones too, in red, so the buyer sees them go). Star a lot to add it.
 */
function Shortlist({ now }: { now: number }) {
  const watch = useBuyingWatchlist({ page_size: 25, ordering: 'end_time' });
  const rows = (watch.data?.results ?? []).filter((a) => a.end_time && parseISO(a.end_time).getTime() > now);
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Your shortlist</Typography>
        <MuiLink component={RouterLink} to="/buying/watchlist" variant="caption" underline="hover">
          {rows.length} watched
        </MuiLink>
      </Stack>
      {watch.isLoading ? <Skeleton variant="rounded" height={80} /> : null}
      {!watch.isLoading && rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">Star a lot to keep it here with its countdown and room.</Typography>
      ) : null}
      <Stack spacing={1} divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
        {rows.map((auction) => {
          const ends = endsIn(auction.end_time, now);
          const { max, mine } = shortlistMax(auction);
          const price = num(auction.current_price) ?? 0;
          const room = max != null ? max - price : null;
          return (
            <Box key={auction.id} sx={{ minWidth: 0 }}>
              <MuiLink
                component={RouterLink}
                to={`/buying/auctions/${auction.id}`}
                underline="hover"
                variant="body2"
                sx={{ fontWeight: 700, display: 'block' }}
                noWrap
                title={auction.title}
              >
                {auction.marketplace?.name} · {auction.title}
              </MuiLink>
              <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Typography variant="caption" color={ends.soon ? 'error.main' : 'text.secondary'} sx={{ fontWeight: ends.soon ? 700 : 400 }}>
                  {ends.left} · {ends.at}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: room == null ? 'text.secondary' : room >= 0 ? 'success.main' : 'error.main', whiteSpace: 'nowrap' }}
                >
                  {formatCurrencyWhole(price)}
                  {max != null ? ` / ${formatCurrencyWhole(max)}${mine ? '' : ' target'}` : ' · no max'}
                </Typography>
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}

// ── Strip and need tiles ──────────────────────────────────────────────────────

function StripTile({ label, value, sub, accent, to }: { label: string; value: string; sub: string; accent?: boolean; to?: string }) {
  const sx = { p: 1.75, bgcolor: accent ? 'action.selected' : 'transparent', minWidth: 0, display: 'block', color: 'inherit', textDecoration: 'none' };
  const body = (
    <>
      <Typography variant="body2" color={accent ? 'primary.main' : 'text.secondary'} sx={{ fontWeight: accent ? 700 : 400 }}>{label}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: accent ? 'primary.main' : 'text.primary' }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">{sub}</Typography>
    </>
  );
  return to ? (
    <Box component={RouterLink} to={to} sx={sx}>
      {body}
    </Box>
  ) : (
    <Box sx={sx}>{body}</Box>
  );
}

function Strip({ data }: { data: WishlistResponse }) {
  const strip = data.strip;
  const cards = data.report_cards;
  if (!strip) return null;
  return (
    <Paper variant="outlined" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 2, '& > *:not(:last-child)': { borderRight: { md: 1 }, borderColor: 'divider' } }}>
      <StripTile
        label="Won, not paid"
        value={strip.won_unpaid.total ? formatCurrencyWhole(strip.won_unpaid.total) : '$0'}
        sub={`${strip.won_unpaid.lots} lot${strip.won_unpaid.lots === 1 ? '' : 's'} in Ordered`}
      />
      <StripTile label="On order" value={short(strip.on_order.retail) || '$0'} sub={`${strip.on_order.units.toLocaleString()} units of retail, not here yet`} />
      <StripTile
        label="In the building"
        value={short(strip.in_building.retail) || '$0'}
        sub={`${strip.in_building.units.toLocaleString()} units not on the shelf${strip.in_building.oldest_days != null ? ` · oldest ${strip.in_building.oldest_days} days` : ''}`}
      />
      <StripTile
        label="Report cards"
        accent
        to="/buying/report-cards"
        value={cards?.trucks && cards.median_ratio != null ? `${Math.round(cards.median_ratio * 100)}%` : '-'}
        sub={cards?.trucks ? `of predicted revenue · ${cards.trucks} finished trucks` : 'no finished won trucks yet'}
      />
    </Paper>
  );
}

function NeedTiles({ selected, onSelect }: { selected: string; onSelect: (category: string) => void }) {
  const need = useBuyingCategoryNeed();
  const rows = (need.data?.categories ?? [])
    .filter((row) => row.cover_weeks != null && row.target_weeks != null)
    .sort((a, b) => (b.need_score_1to99 ?? 0) - (a.need_score_1to99 ?? 0))
    .slice(0, 8);
  if (!rows.length) return null;
  const label = (row: BuyingCategoryNeedRow) =>
    row.need_score_1to99 >= 65 ? 'Need high' : row.need_score_1to99 > 35 ? 'Need med' : 'Overstocked';
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="baseline" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Need by category</Typography>
        <Typography variant="body2" color="text.secondary">Weeks of supply against the target. Click one to filter the list.</Typography>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)', xl: 'repeat(8, 1fr)' }, gap: 1 }}>
        {rows.map((row) => {
          const cover = Number.parseFloat(row.cover_weeks ?? '0');
          const target = Number.parseFloat(row.target_weeks ?? '1') || 1;
          const scale = Math.max(target * 1.6, cover);
          const high = row.need_score_1to99 >= 65;
          return (
            <ButtonBase
              key={row.category}
              onClick={() => onSelect(selected === row.category ? '' : row.category)}
              sx={{
                display: 'block',
                textAlign: 'left',
                p: 1.25,
                borderRadius: 1,
                border: 1,
                borderColor: selected === row.category ? 'primary.main' : 'divider',
                bgcolor: (t) => (high ? alpha(t.palette.warning.main, 0.07) : 'transparent'),
              }}
            >
              <Stack direction="row" justifyContent="space-between" spacing={0.5}>
                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{row.category}</Typography>
                <Typography variant="caption" color={high ? 'primary.main' : 'text.secondary'} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {label(row)}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">{cover.toFixed(1)} of {target.toFixed(1)} wk</Typography>
              <Box sx={{ position: 'relative', height: 6, borderRadius: 99, bgcolor: 'action.hover', mt: 0.5 }}>
                <Box sx={{ position: 'absolute', inset: 0, width: `${Math.min((cover / scale) * 100, 100)}%`, borderRadius: 99, bgcolor: high ? 'warning.main' : 'text.secondary' }} />
                <Box sx={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: `${(target / scale) * 100}%`, bgcolor: 'text.primary' }} />
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
    </Paper>
  );
}

// ── Rows ──────────────────────────────────────────────────────────────────────

function BidVsMax({ auction }: { auction: WishlistAuction }) {
  const max = num(auction.max_bid);
  const price = num(auction.current_price) ?? 0;
  const room = num(auction.room);
  if (max == null) return <Typography variant="body2" color="text.secondary">No max yet</Typography>;
  const over = room != null && room < 0;
  const tight = room != null && room >= 0 && room < max * 0.15;
  const color = over ? 'error' : tight ? 'warning' : 'primary';
  return (
    <Box sx={{ minWidth: 150 }}>
      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        <b>{formatCurrencyWhole(price)}</b> / {formatCurrencyWhole(max)}
        {!auction.max_is_buyer ? (
          <Typography component="span" variant="caption" color="text.secondary"> model</Typography>
        ) : null}
      </Typography>
      <LinearProgress variant="determinate" value={Math.min((price / max) * 100, 100)} color={color} sx={{ height: 5, borderRadius: 99, my: 0.5 }} />
      <Typography variant="caption" sx={{ fontWeight: 700 }} color={over ? 'error.main' : tight ? 'warning.dark' : 'primary.main'}>
        {room == null ? '' : over ? `${formatCurrencyWhole(-room)} over max` : `${formatCurrencyWhole(room)} room`}
      </Typography>
    </Box>
  );
}

function useRowActions() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['buying'] });
  const watch = useMutation({
    mutationFn: async ({ id, on }: { id: number; on: boolean }) => {
      if (on) await postBuyingWatchlist(id);
      else await deleteBuyingWatchlist(id);
    },
    onSuccess: refresh,
  });
  const pass = useMutation({ mutationFn: (id: number) => postBuyingAuctionArchive(id), onSuccess: refresh });
  return { watch, pass };
}

function Actions({ auction }: { auction: WishlistAuction }) {
  const { watch, pass } = useRowActions();
  return (
    <Stack direction="row" spacing={0.75} justifyContent="flex-end">
      <Tooltip title={auction.watched ? 'Stop watching' : 'Watch'}>
        <IconButton
          aria-label={auction.watched ? 'Stop watching' : 'Watch'}
          onClick={() => watch.mutate({ id: auction.id, on: !auction.watched })}
          sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}
          color={auction.watched ? 'primary' : 'default'}
        >
          {auction.watched ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Button component={RouterLink} to={`/buying/auctions/${auction.id}`} variant="outlined">Open</Button>
      <Tooltip title="Pass: hide it from the lists (Archived)">
        <IconButton aria-label="Pass" onClick={() => pass.mutate(auction.id)} sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <CloseRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function lotSub(a: WishlistAuction): string {
  return [
    a.condition_summary,
    a.origin_city,
    a.pallet_count ? `${a.pallet_count} plt` : '',
    a.total_retail_value ? short(a.total_retail_value) : '',
  ].filter(Boolean).join(' · ');
}

function Table({ rows, now }: { rows: WishlistAuction[]; now: number }) {
  const head = ['Score', 'Lot', 'Need', 'Est. profit', 'Sells in', 'Risk', 'Bid vs your max', 'Ends', ''];
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& td, & th': { px: 1.25, py: 1.25, borderTop: 1, borderColor: 'divider', verticalAlign: 'middle' } }}>
        <Box component="thead">
          <Box component="tr">
            {head.map((h) => (
              <Box component="th" key={h} sx={{ textAlign: 'left', typography: 'overline', fontWeight: 800, letterSpacing: '0.08em', color: 'text.secondary', borderTop: '0 !important' }}>
                {h}
              </Box>
            ))}
          </Box>
        </Box>
        <Box component="tbody">
          {rows.map((a) => {
            const ends = endsIn(a.end_time, now);
            const low = num(a.profit_low);
            const high = num(a.profit_high);
            return (
              <Box component="tr" key={a.id} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                <Box component="td"><ScoreBadge score={a.priority} /></Box>
                <Box component="td" sx={{ maxWidth: 320 }}>
                  <Tooltip
                    placement="bottom-start"
                    title={
                      a.why || a.why_not.length ? (
                        <Box>
                          {a.why ? <Box sx={{ mb: 0.5 }}>Why: {a.why}</Box> : null}
                          {a.why_not.map((reason) => (
                            <Box key={reason}>Watch out: {reason}</Box>
                          ))}
                        </Box>
                      ) : ''
                    }
                  >
                    <MuiLink component={RouterLink} to={`/buying/auctions/${a.id}`} underline="hover" color="inherit" sx={{ fontWeight: 700, display: 'block' }} noWrap>
                      {[a.marketplace, a.top_category].filter(Boolean).join(' · ') || a.title}
                    </MuiLink>
                  </Tooltip>
                  <Tooltip title={a.title}>
                    <Typography variant="body2" color="text.secondary" noWrap>{lotSub(a) || a.title}</Typography>
                  </Tooltip>
                </Box>
                <Box component="td">
                  {a.need_level ? <Chip size="small" label={a.need_level} {...NEED_CHIP[a.need_level]} /> : '-'}
                </Box>
                <Box component="td">
                  <Typography variant="body1" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{formatCurrencyWhole(a.est_profit)}</Typography>
                  {low != null && high != null ? (
                    <Typography variant="caption" color="text.secondary">{formatCurrencyWhole(low)} to {formatCurrencyWhole(high)}</Typography>
                  ) : null}
                </Box>
                <Box component="td"><Typography variant="body2">{a.days_to_sell != null ? `${a.days_to_sell} d` : '-'}</Typography></Box>
                <Box component="td">
                  {a.hazard_count ? (
                    <Tooltip title={a.hazards.map((h) => `${HAZARD_SHORT[h.code] ?? h.code} ${h.retail_pct}%`).join(' · ')}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <WarningAmberRounded fontSize="small" color="warning" />
                        <Typography variant="body2" sx={{ fontWeight: 700 }} color="warning.dark">{a.hazard_count}</Typography>
                      </Stack>
                    </Tooltip>
                  ) : (
                    <Typography variant="body2" color="text.secondary">{a.has_analysis ? 'None' : '-'}</Typography>
                  )}
                </Box>
                <Box component="td"><BidVsMax auction={a} /></Box>
                <Box component="td" sx={{ whiteSpace: 'nowrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }} color={ends.soon ? 'warning.dark' : 'text.primary'}>{ends.left}</Typography>
                  <Typography variant="caption" color="text.secondary">{ends.at}</Typography>
                </Box>
                <Box component="td"><Actions auction={a} /></Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

function WishCard({ auction, now }: { auction: WishlistAuction; now: number }) {
  const ends = endsIn(auction.end_time, now);
  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Stack direction="row" spacing={1.25} alignItems="flex-start">
        <ScoreBadge score={auction.priority} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <MuiLink component={RouterLink} to={`/buying/auctions/${auction.id}`} underline="hover" sx={{ fontWeight: 700 }}>
            {[auction.marketplace, auction.top_category].filter(Boolean).join(' · ') || auction.title}
          </MuiLink>
          <Typography variant="body2" color="text.secondary">{lotSub(auction)}</Typography>
        </Box>
        {auction.need_level ? <Chip size="small" label={auction.need_level} {...NEED_CHIP[auction.need_level]} /> : null}
      </Stack>
      <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="flex-end">
        <BidVsMax auction={auction} />
        <Box>
          <Typography variant="caption" color="text.secondary">Profit</Typography>
          <Typography variant="body1" sx={{ fontWeight: 800 }}>{formatCurrencyWhole(auction.est_profit)}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Ends</Typography>
          <Typography variant="body1" sx={{ fontWeight: 700 }} color={ends.soon ? 'warning.dark' : 'text.primary'}>{ends.left}</Typography>
        </Box>
      </Stack>
      {auction.hazards.length ? (
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
          {auction.hazards.map((h) => (
            <Tooltip key={h.code} title={HAZARD_LONG[h.code] ?? h.code}>
              <Chip size="small" variant="outlined" color={hazardTone(h.code)} label={`${HAZARD_SHORT[h.code] ?? h.code} · ${h.retail_pct}%`} />
            </Tooltip>
          ))}
        </Stack>
      ) : null}
      {auction.why ? (
        <Stack direction="row" spacing={0.75} alignItems="flex-start">
          <CheckCircleOutline fontSize="small" color="success" sx={{ mt: '1px' }} />
          <Typography variant="body2">{auction.why}</Typography>
        </Stack>
      ) : null}
      {auction.why_not.map((reason) => (
        <Stack key={reason} direction="row" spacing={0.75} alignItems="flex-start">
          <WarningAmberRounded fontSize="small" color="warning" sx={{ mt: '1px' }} />
          <Typography variant="body2" color="text.secondary">{reason}</Typography>
        </Stack>
      ))}
      <Actions auction={auction} />
    </Paper>
  );
}

/**
 * Today's best (Buying Phase 5): the few live auctions worth bidding on, ranked. Each shows
 * the score, need, profit and its range, how fast it sells, its risk, and where the bid is
 * against your max (typed on the auction page, else the model's price target). The app
 * never bids: bid by hand near the end, and not over the max.
 */
export default function WishListPage() {
  const theme = useTheme();
  const isDesk = useMediaQuery(theme.breakpoints.up('lg'));
  const [includeOver, setIncludeOver] = useState(false);
  const [rank, setRank] = useState<WishlistRank>('focus');
  const [category, setCategory] = useState('');
  const wishlist = useBuyingWishlist({ includeOver, rank, category });
  const now = useMinute();
  const data = wishlist.data;
  const rows = data?.results ?? [];

  return (
    <Box>
      {data ? <Strip data={data} /> : null}
      {data ? <PlanCard rows={rows} wonToday={data.strip?.won_today ?? 0} now={now} /> : null}
      <NeedTiles selected={category} onSelect={setCategory} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 300px' }, gap: 2, alignItems: 'start' }}>
      {!isDesk ? <Shortlist now={now} /> : null}
      <Paper variant="outlined" sx={{ p: { xs: 1.25, md: 2 }, minWidth: 0 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>Today&apos;s best</Typography>
            <Typography variant="body2" color="text.secondary">
              {data?.eligible != null && data?.live_total != null
                ? `${data.eligible} of ${data.live_total} live auctions pass${category ? ` · ${category}` : ''} · buy at or under your max; bid by hand near the end`
                : 'Buy at or under your max; bid by hand near the end.'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">Rank by</Typography>
            <ToggleButtonGroup size="small" exclusive value={rank} onChange={(_, value) => value && setRank(value)}>
              {RANKS.map((r) => (
                <ToggleButton key={r.value} value={r.value}>{r.label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            <FormControlLabel
              control={<Switch checked={includeOver} onChange={(e) => setIncludeOver(e.target.checked)} />}
              label="Show ones over max"
            />
          </Stack>
        </Stack>
        {category ? (
          <Chip label={`Category: ${category}`} onDelete={() => setCategory('')} sx={{ mb: 1.5 }} />
        ) : null}

        {wishlist.isError ? <Alert severity="error">Could not load today&apos;s best.</Alert> : null}
        {wishlist.isLoading ? (
          <Stack spacing={1}>
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} variant="rounded" height={64} />
            ))}
          </Stack>
        ) : rows.length === 0 ? (
          <Alert severity="info">
            Nothing to bid on right now. Auctions show here once they have a revenue estimate and their price is under your max.
          </Alert>
        ) : isDesk ? (
          <Table rows={rows} now={now} />
        ) : (
          <Stack spacing={1.25}>
            {rows.map((auction) => (
              <WishCard key={auction.id} auction={auction} now={now} />
            ))}
          </Stack>
        )}
      </Paper>
      {isDesk ? <Shortlist now={now} /> : null}
      </Box>
    </Box>
  );
}
