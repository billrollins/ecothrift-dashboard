import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Link as MuiLink,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInMinutes, format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { fetchLiveLots, postManifestRequest } from '../../api/buying.api';
import { useAuth } from '../../hooks/useAuth';
import type { LiveLot } from '../../types/buying.types';
import { formatCurrencyWhole } from '../../utils/format';

const money = (v: number | null | undefined) => (v == null ? '–' : formatCurrencyWhole(v));
// A sweep older than this means the list may be missing new lots (the sweep is hourly).
const STALE_MINUTES = 180;
// Winning at your max returns at least this many times what it lands at: worth a look.
const GOOD_MULTIPLE = 1.5;

type SortKey = 'ending' | 'multiple' | 'profit';
const endsAt = (l: LiveLot) => (l.ends ? Date.parse(l.ends) : Infinity);
// Lots already over your max always sit at the bottom.
const overLast = (a: LiveLot, b: LiveLot) => Number(a.reach === 'over') - Number(b.reach === 'over');
const SORTS: Record<SortKey, { label: string; compare: (a: LiveLot, b: LiveLot) => number }> = {
  ending: { label: 'Ending soon', compare: (a, b) => overLast(a, b) || endsAt(a) - endsAt(b) },
  multiple: {
    label: 'Best return',
    compare: (a, b) => overLast(a, b) || (multipleOf(b) ?? -1) - (multipleOf(a) ?? -1) || endsAt(a) - endsAt(b),
  },
  profit: { label: 'Most profit', compare: (a, b) => overLast(a, b) || (b.profit_at_max ?? -Infinity) - (a.profit_at_max ?? -Infinity) },
};

function multipleOf(lot: LiveLot): number | null {
  if (lot.profit_at_max == null || !lot.retail || !lot.brings_in) return null;
  return lot.brings_in.likely / (lot.retail * 0.2);
}

/** Time left, not a clock time: urgency is what matters. Red under an hour, amber under three. */
function ends(iso: string | null): { text: string; tone: 'error' | 'warning' | undefined; full: string } {
  if (!iso) return { text: '–', tone: undefined, full: '' };
  const d = parseISO(iso);
  const mins = Math.max(differenceInMinutes(d, new Date()), 0);
  const full = format(d, 'EEE MMM d, h:mm a');
  if (mins < 60) return { text: `${mins} min`, tone: 'error', full };
  const hours = mins / 60;
  if (hours < 48) return { text: `${Math.floor(hours)} h`, tone: hours < 24 ? 'warning' : undefined, full };
  return { text: `${Math.floor(hours / 24)} days`, tone: undefined, full };
}

const multiple = multipleOf;

function ManifestBit({ lot, canAsk }: { lot: LiveLot; canAsk: boolean }) {
  const qc = useQueryClient();
  const ask = useMutation({
    mutationFn: () => postManifestRequest(lot.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['buying', 'liveLots'] }),
  });
  if (lot.manifest === 'yes' || lot.manifest === 'pulled') {
    return <Chip size="small" label="Manifest" color="success" variant="outlined" sx={{ height: 18, fontSize: 11 }} />;
  }
  if (lot.manifest === 'requested' || lot.manifest === 'pulling') {
    return <Typography variant="caption" color="text.secondary">manifest {lot.manifest}…</Typography>;
  }
  if (!canAsk || !lot.manifest_eligible) return null;
  return (
    <MuiLink
      component="button"
      type="button"
      variant="caption"
      underline="always"
      color="text.secondary"
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        ask.mutate();
      }}
      disabled={ask.isPending}
    >
      {ask.isPending ? 'asking…' : lot.manifest === 'failed' ? 'retry manifest' : 'get manifest'}
    </MuiLink>
  );
}

function LotTitle({ lot, canAsk }: { lot: LiveLot; canAsk: boolean }) {
  const bits = [
    lot.seller,
    // The title already says the pallets (B-Stock titles start with them); say it only when it does not.
    lot.pallets && !/pallet|truckload/i.test(lot.short_title || lot.title) ? `${lot.pallets} pallets` : '',
    lot.units ? `${lot.units.toLocaleString()} units` : '',
    lot.city,
  ].filter(Boolean);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="body2"
        title={lot.title}
        sx={{ fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {lot.short_title || lot.title}
      </Typography>
      <Stack direction="row" alignItems="center" sx={{ minHeight: 20, flexWrap: 'wrap', columnGap: 1, '& > *': { whiteSpace: 'nowrap' } }}>
        <Typography variant="caption" color="text.secondary">{bits.join(' · ')}</Typography>
        {lot.url ? (
          <MuiLink
            href={lot.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            underline="hover"
            color="text.secondary"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            on B-Stock ↗
          </MuiLink>
        ) : null}
        <ManifestBit lot={lot} canAsk={canAsk} />
      </Stack>
    </Box>
  );
}

function Price({ lot }: { lot: LiveLot }) {
  if (lot.price_basis === 'Buy Now') {
    return (
      <Box sx={{ textAlign: 'right' }}>
        <Chip size="small" label="Buy Now" color="warning" sx={{ height: 18, fontSize: 11, mb: 0.25 }} />
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{money(lot.price)}</Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ textAlign: 'right' }}>
      <Typography variant="body2">{money(lot.price)}</Typography>
      <Typography variant="caption" color="text.secondary">
        {lot.bids ? `${lot.bids} bid${lot.bids === 1 ? '' : 's'}` : 'opening'}
      </Typography>
    </Box>
  );
}

/** Your max, the number he bids with, and where the price stands against it. */
function YourMax({ lot }: { lot: LiveLot }) {
  if (lot.bid_up_to == null) {
    return <Typography variant="caption" color="text.disabled">{lot.freight == null ? 'no freight yet' : '–'}</Typography>;
  }
  const gap = lot.room ?? 0;
  const line =
    lot.reach === 'over'
      ? { text: `over by ${money(-gap)}`, color: 'error.main' }
      : lot.reach === 'no_bids'
        ? { text: '', color: 'text.secondary' }
        : lot.reach === 'buy_now'
          ? { text: `${money(gap)} under`, color: 'warning.main' }
          : { text: `${money(gap)} under`, color: 'success.main' };
  return (
    <Box sx={{ textAlign: 'right' }}>
      <Typography variant="body2" sx={{ fontWeight: 800 }}>{money(lot.bid_up_to)}</Typography>
      <Typography variant="caption" sx={{ color: line.color, display: 'block', minHeight: 18 }}>{line.text}</Typography>
    </Box>
  );
}

function Profit({ lot }: { lot: LiveLot }) {
  if (!lot.brings_in) {
    return <Typography variant="caption" color="text.disabled">{lot.estimate_note || '–'}</Typography>;
  }
  const m = multiple(lot);
  const good = m != null && m >= GOOD_MULTIPLE;
  const sure = lot.method === 'manifest';
  return (
    <Tooltip
      title={`Brings in about ${money(lot.brings_in.likely)} in its first 90 days (${money(lot.brings_in.low)} to ${money(lot.brings_in.high)}, ${lot.method === 'manifest' ? 'by its manifest' : 'whole truck, no manifest'}), minus 20% of retail landed.`}
    >
      <Box sx={{ textAlign: 'right' }}>
        <Typography
          variant="body2"
          sx={{ fontWeight: sure ? 700 : 400, color: good ? 'success.main' : sure ? undefined : 'text.secondary' }}
        >
          {lot.profit_at_max == null ? '–' : `${sure ? '' : '≈ '}${lot.profit_at_max < 0 ? '−' : '+'}${money(Math.abs(lot.profit_at_max))}`}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          {m != null ? `${m.toFixed(2)}×` : ''}{sure ? ' · manifest' : ''}
        </Typography>
      </Box>
    </Tooltip>
  );
}

function Ends({ lot }: { lot: LiveLot }) {
  const e = ends(lot.ends);
  return (
    <Tooltip title={e.full}>
      <Typography variant="body2" sx={{ color: e.tone ? `${e.tone}.main` : undefined, fontWeight: e.tone ? 700 : 400 }}>
        {e.text}
      </Typography>
    </Tooltip>
  );
}

function LotTable({ lots, canAsk }: { lots: LiveLot[]; canAsk: boolean }) {
  const navigate = useNavigate();
  return (
    <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-label="Live lots" sx={{ tableLayout: 'fixed', minWidth: 820 }}>
        <TableHead>
          <TableRow>
            <TableCell>Lot</TableCell>
            <TableCell sx={{ width: 80 }}>Ends</TableCell>
            <TableCell align="right" sx={{ width: 96 }}>Retail</TableCell>
            <TableCell align="right" sx={{ width: 96 }}>Price</TableCell>
            <TableCell align="right" sx={{ width: 124 }}>
              <Tooltip title="The most to bid so price + 5% fee + freight is 20% of retail">
                <span>Your max</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right" sx={{ width: 124 }}>
              <Tooltip title="What it should bring in during its first 90 days of selling, minus what it lands at if you win at your max">
                <span>Profit at max</span>
              </Tooltip>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {lots.map((lot) => (
            <TableRow key={lot.id} hover onClick={() => navigate(`/buying/auctions/${lot.id}`)} sx={{ cursor: 'pointer', '& td': { py: 0.75 } }}>
              <TableCell><LotTitle lot={lot} canAsk={canAsk} /></TableCell>
              <TableCell><Ends lot={lot} /></TableCell>
              <TableCell align="right"><Typography variant="body2">{money(lot.retail)}</Typography></TableCell>
              <TableCell align="right"><Price lot={lot} /></TableCell>
              <TableCell align="right"><YourMax lot={lot} /></TableCell>
              <TableCell align="right"><Profit lot={lot} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

function LotCards({ lots, canAsk }: { lots: LiveLot[]; canAsk: boolean }) {
  const navigate = useNavigate();
  const cell = (label: string, body: React.ReactNode) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ textAlign: 'right' }}>{label}</Typography>
      {body}
    </Box>
  );
  return (
    <Stack spacing={0.75}>
      {lots.map((lot) => (
        <Paper key={lot.id} variant="outlined" sx={{ p: 1, cursor: 'pointer' }} onClick={() => navigate(`/buying/auctions/${lot.id}`)}>
          <LotTitle lot={lot} canAsk={canAsk} />
          <Box sx={{ display: 'grid', gridTemplateColumns: '0.7fr 1fr 1fr 1fr', gap: 0.5, mt: 0.5, alignItems: 'start' }}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Ends</Typography>
              <Ends lot={lot} />
            </Box>
            {cell('Price', <Price lot={lot} />)}
            {cell('Your max', <YourMax lot={lot} />)}
            {cell('Profit at max', <Profit lot={lot} />)}
          </Box>
        </Paper>
      ))}
    </Stack>
  );
}

/**
 * Buying → Auctions, rebuilt (Bill 2026-11-06, step 1). Every live B-Stock lot, best first: your max (the most to
 * bid at 20% landed) and the profit if you win at it, from what this seller's past trucks sold in 90 days. The
 * price now does not rank: an opening bid says little about where a lot closes. No AI: table math.
 */
export default function LiveLotsPage() {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();
  const canAsk = Boolean(user?.is_superuser);
  const qc = useQueryClient();
  const [seller, setSeller] = useState('');
  const [search, setSearch] = useState('');
  const [showContract, setShowContract] = useState(false);
  const [sort, setSort] = useState<SortKey>('ending');
  const q = useQuery({ queryKey: ['buying', 'liveLots'], queryFn: () => fetchLiveLots(), refetchInterval: 60_000 });
  const refresh = useMutation({
    mutationFn: () => fetchLiveLots(true),
    onSuccess: (data) => qc.setQueryData(['buying', 'liveLots'], data),
  });

  const sellers = useMemo(() => {
    const n = new Map<string, number>();
    for (const l of q.data?.lots ?? []) n.set(l.seller, (n.get(l.seller) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]);
  }, [q.data]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = (q.data?.lots ?? []).filter(
      (l) => (!seller || l.seller === seller) && (!term || l.title.toLowerCase().includes(term) || l.city.toLowerCase().includes(term)),
    );
    return [...rows].sort(SORTS[sort].compare);
  }, [q.data, seller, search, sort]);

  const sweptAt = q.data?.last_listed_at ? parseISO(q.data.last_listed_at) : null;
  const stale = sweptAt ? differenceInMinutes(new Date(), sweptAt) > STALE_MINUTES : false;
  const Lots = phone ? LotCards : LotTable;

  return (
    <Box sx={{ maxWidth: 1200 }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={2} sx={{ mb: 1 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Auctions</Typography>
          {phone ? null : (
            <Typography variant="body2" color="text.secondary">Live B-Stock lots and the most to bid on each.</Typography>
          )}
        </Box>
        <Stack alignItems="flex-end" sx={{ flexShrink: 0 }}>
          <Button size="small" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? <CircularProgress size={14} /> : 'Refresh'}
          </Button>
          <Typography variant="caption" color={stale ? 'warning.main' : 'text.secondary'} sx={{ minHeight: 18 }}>
            {sweptAt ? `B-Stock checked ${formatDistanceToNowStrict(sweptAt, { addSuffix: true })}` : ''}
          </Typography>
        </Stack>
      </Stack>

      {stale ? (
        <Alert severity="warning" sx={{ mb: 1 }}>
          The last B-Stock check was over 3 hours ago: new lots may be missing and ended ones may still show.
        </Alert>
      ) : null}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mb: 1.25 }}>
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
          <Chip size="small" label={`All ${q.data?.lots.length ?? ''}`} color={!seller ? 'primary' : 'default'} onClick={() => setSeller('')} />
          {sellers.map(([name, n]) => (
            <Chip key={name} size="small" label={`${name} ${n}`} color={seller === name ? 'primary' : 'default'} onClick={() => setSeller(seller === name ? '' : name)} />
          ))}
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: { sm: 'auto' } }}>
          <Typography variant="caption" color="text.secondary">Sort</Typography>
          {(Object.keys(SORTS) as SortKey[]).map((k) => (
            <Chip key={k} size="small" variant={sort === k ? 'filled' : 'outlined'} color={sort === k ? 'primary' : 'default'} label={SORTS[k].label} onClick={() => setSort(k)} />
          ))}
        </Stack>
        <TextField
          size="small"
          placeholder="Search title or city"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: '100%', sm: 220 } }}
          inputProps={{ 'aria-label': 'Search lots' }}
        />
      </Stack>

      {q.isPending ? (
        <Stack spacing={0.75}>
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="rectangular" height={phone ? 96 : 52} />)}
        </Stack>
      ) : q.isError ? (
        <Alert severity="error" action={<Button onClick={() => void q.refetch()}>Retry</Button>}>
          Could not load the lots. Check the connection and retry.
        </Alert>
      ) : shown.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">{q.data.lots.length ? 'No live lots match.' : 'No live lots right now.'}</Typography>
        </Paper>
      ) : (
        <Lots lots={shown} canAsk={canAsk} />
      )}

      {q.data && q.data.contract.length ? (
        <Box sx={{ mt: 2 }}>
          <Button size="small" onClick={() => setShowContract((v) => !v)} aria-expanded={showContract}>
            {showContract ? 'Hide' : 'Show'} contract lots ({q.data.contract.length}): no bidding
          </Button>
          <Collapse in={showContract} unmountOnExit>
            <Box sx={{ mt: 1 }}>
              <Lots lots={q.data.contract} canAsk={canAsk} />
            </Box>
          </Collapse>
        </Box>
      ) : null}

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
        Your max = (retail × 20% − freight) ÷ 1.05. Profit = what it should bring in during its first 90 days of selling
        (<MuiLink component={RouterLink} to="/buying/estimate">Estimate Profit</MuiLink>&apos;s rates) minus 20% of retail.
        The × is what it brings in over what it lands at; green = {GOOD_MULTIPLE}× or more. Without a manifest a lot is
        priced at its seller&apos;s whole-truck rate (≈, the same × for every such lot); Get manifest prices it by
        category. Lots already over your max sit at the bottom.
      </Typography>
    </Box>
  );
}
