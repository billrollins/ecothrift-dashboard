import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  InputAdornment,
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
import { useMutation } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { patchBuyingValuationInputs, postEstimateProfit } from '../../api/buying.api';
import EstimateScores from '../../components/buying/EstimateScores';
import { IconClose } from '../../icons/ecoIcons';
import type { EstimateCategory, EstimateResponse, EstimateResult } from '../../types/buying.types';
import { formatCurrencyWhole } from '../../utils/format';

const money = (v: number | null | undefined) => (v == null ? '-' : formatCurrencyWhole(v));
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${formatCurrencyWhole(Math.abs(v))}`;
const pct = (v: number | null | undefined, digits = 0) => (v == null ? '-' : `${(v * 100).toFixed(digits)}%`);
const rates = (r: [number, number, number]) => r.map((x) => Math.round(x * 100)).join(' / ') + '%';
const day = (iso: string) => format(parseISO(iso), 'MMM d');
const when = (iso: string) => format(parseISO(iso), 'EEE MMM d, h:mm a');

/** What each tag means, said once on hover. */
const TAG_TIP: Record<string, string> = {
  'first 90 days of selling':
    "Each rate is what this seller's past trucks sold in the 90 days after their first sale, divided by their whole manifest retail. Unsold, missing and damaged units count as zero.",
  'sold items only': 'Each rate is what we sold that seller category for, divided by its retail. Unsold items, shrink and returns are not counted, so it runs high.',
  'weak estimate': 'Over 30% of this lot is in categories with no rate of their own; they use the whole-truck rate.',
  'whole truck, no manifest': "No manifest, so the whole retail is priced at the seller's average of what sold.",
  'wide range': 'No manifest, so the band is wide: see Whole truck under Rules used.',
  'contract, no bidding': 'A contract lot: priced at its contract price.',
  'freight not included': 'No freight typed and no formula for this lot, so the profit is left out. Type the freight to see it.',
  'check retail': 'B-Stock lists far more retail a pallet than our Target trucks carry; the numbers rest on that retail.',
  ended: 'This lot has ended: the last bid we saw is not what it sold for, so type a price to see the profit. Dates are from when it closed.',
};
const SELLER_CHOICES: [string, string][] = [
  ['target', 'Target'],
  ['walmart', 'Walmart'],
  ['amazon', 'Amazon'],
  ['costco', 'Costco'],
  ['homedepot', 'Home Depot'],
  ['wayfair', 'Wayfair'],
];
const TAG_TONE: Record<string, 'default' | 'warning'> = {
  'weak estimate': 'warning',
  'freight not included': 'warning',
  ended: 'warning',
  'check retail': 'warning',
};

function Tile({ label, value, sub, accent, muted }: { label: string; value: string; sub: ReactNode; accent?: boolean; muted?: boolean }) {
  return (
    <Box sx={{ p: 1.5, minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800, letterSpacing: '0.08em', display: 'block', lineHeight: 1.4 }}>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, color: muted ? 'text.disabled' : accent ? 'primary.main' : undefined }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary">{sub}</Typography>
    </Box>
  );
}

function Row({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="baseline" sx={{ py: 0.5 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2">{label}</Typography>
        {sub ? <Typography variant="caption" color="text.secondary" display="block">{sub}</Typography> : null}
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{value}</Typography>
    </Stack>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>{title}</Typography>
      {children}
    </Paper>
  );
}

function LotHeader({ r }: { r: EstimateResult }) {
  const lot = r.lot;
  const bits: string[] = [];
  if (lot?.end_time) {
    const ended = parseISO(lot.end_time).getTime() < Date.now();
    bits.push(`${ended ? 'Ended' : 'Ends'} ${when(lot.end_time)}`);
  }
  if (lot?.bid_count != null) bits.push(`${lot.bid_count} bid${lot.bid_count === 1 ? '' : 's'}`);
  if (lot?.pallet_count) bits.push(`${lot.pallet_count} pallets`);
  if (r.method === 'manifest') bits.push(`${r.lines.toLocaleString()} manifest lines (${r.manifest_source})`);
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography
        variant="h6"
        sx={{ fontWeight: 800, lineHeight: 1.3, display: { xs: 'block', md: '-webkit-box' }, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {lot ? (
          <MuiLink href={lot.url} target="_blank" rel="noopener" underline="hover" color="inherit">
            {lot.marketplace} · {lot.title || 'B-Stock lot'} ↗
          </MuiLink>
        ) : (
          'Target manifest (no lot link)'
        )}
      </Typography>
      {bits.length ? <Typography variant="body2" color="text.secondary">{bits.join(' · ')}</Typography> : null}
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
        {r.tags.map((t) => (
          <Tooltip key={t} title={TAG_TIP[t] ?? ''}>
            <Chip size="small" label={t} color={TAG_TONE[t] ?? 'default'} variant="outlined" />
          </Tooltip>
        ))}
      </Stack>
    </Box>
  );
}

function Headline({ r }: { r: EstimateResult }) {
  const [b20, b23] = r.bid_up_to;
  const noFreight = r.freight.used == null;
  const muted = noFreight || r.retail_doubt;
  const bidSub = (landed: number | undefined) =>
    noFreight ? `before freight · landed ${money(landed)}` : r.retail_doubt ? `if the retail is right · landed ${money(landed)}` : `landed ${money(landed)}`;
  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        mb: 1.5,
        '& > *:not(:last-child)': { borderRight: { md: 1 }, borderColor: 'divider' },
      }}
    >
      <Tile
        label="Brings in"
        accent
        muted={r.retail_doubt}
        value={money(r.brings_in.likely)}
        sub={`${money(r.brings_in.low)} to ${money(r.brings_in.high)} · ${r.retail_doubt ? 'if the retail is right' : `${pct(r.brings_in_pct.likely, 1)} of retail`}`}
      />
      <Tile
        label="Profit"
        value={r.profit ? signed(r.profit.likely) : '-'}
        sub={
          r.profit
            ? r.landed_pct != null && r.landed_pct > 0.23
              ? <Box component="span" sx={{ color: 'warning.main' }}>landed {pct(r.landed_pct, 1)} of retail, over 23%</Box>
              : `${signed(r.profit.low)} to ${signed(r.profit.high)}${r.multiple?.likely ? ` · ${r.multiple.likely.toFixed(1)}× landed` : ''}`
            : r.landed == null
              ? 'Type a price to see it'
              : 'Type the freight to see it'
        }
      />
      <Tile label="Bid up to · 20% landed" value={money(b20?.bid)} muted={muted} sub={bidSub(b20?.landed)} />
      <Tile label="Bid up to · 23% landed" value={money(b23?.bid)} muted={muted} sub={bidSub(b23?.landed)} />
    </Paper>
  );
}

function CostCard({ r }: { r: EstimateResult }) {
  const f = r.freight;
  const formulaSub = f.formula
    ? `formula ${f.formula.mode === 'truckload' ? 'truckload' : 'LTL'}, ${f.formula.pallets} pallets, ${f.formula.miles.toLocaleString()} mi: ${money(f.formula.low)} to ${money(f.formula.high)}`
    : `no formula: ${f.reason || 'not enough lot detail'}`;
  return (
    <Card title="Cost">
      <Row
        label="Retail"
        value={money(r.retail.used)}
        sub={r.retail.source === 'manifest' ? `manifest sum${r.retail.bstock ? ` · B-Stock lists ${money(r.retail.bstock)}` : ''}` : 'B-Stock'}
      />
      <Row label="Price" value={money(r.price)} sub={r.price_basis || 'type a price'} />
      <Row label={`B-Stock fee ${pct(r.fee_rate)}`} value={money(r.fee)} />
      <Row
        label="Freight"
        value={f.used == null ? 'not included' : money(f.used)}
        sub={f.basis === 'typed' ? `typed · ${formulaSub}` : formulaSub}
      />
      <Row
        label="Landed"
        value={money(r.landed)}
        sub={
          r.landed_pct != null ? (
            <Box component="span" sx={{ color: r.landed_pct > 0.23 ? 'warning.main' : undefined }}>
              {pct(r.landed_pct, 1)} of retail{r.landed_pct > 0.23 ? ', over 23%' : ''}
            </Box>
          ) : undefined
        }
      />
    </Card>
  );
}

function RulesCard({ r }: { r: EstimateResult }) {
  return (
    <Card title="Rules used">
      <Row label="Selling time" value={r.horizon} sub="brings in counts what sells in that time" />
      <Row
        label="On the shelf"
        value={day(r.shelf_date)}
        sub={r.close_basis === 'lot end time' ? `closes ${day(r.close_date)} + ${r.lead_days} days` : `${r.close_basis} + ${r.lead_days} days`}
      />
      {r.method === 'whole_truck' ? (
        <Row
          label="Whole truck"
          value={rates(r.whole_truck_rates)}
          sub={
            r.rates_source === 'recovery'
              ? `${r.seller} trucks in their first 90 days of selling; drop the manifest for categories`
              : `${r.seller} average of ${r.seller_sold_items.toLocaleString()} sold items; drop the manifest for categories`
          }
        />
      ) : null}
      {r.seasons.map((s) => (
        <Row
          key={s.rule}
          label={s.rule === 'season not set' ? 'Other seasonal (season not set)' : s.rule}
          value={rates(s.rates)}
          sub={`${money(s.retail)} of retail, ${s.lines} lines`}
        />
      ))}
      {r.method === 'manifest' ? (
        <Row
          label="Missing pieces"
          value={r.missing_pieces_effect ? signed(r.missing_pieces_effect) : '$0'}
          sub={`${pct(r.missing_pieces_share)} of retail says "may be missing pieces"; those lines count at their low rate`}
        />
      ) : null}
      {r.method === 'manifest' ? (
        <Row
          label="Share with no rate of its own"
          value={pct(r.fill_in_share)}
          sub={
            r.rates_source === 'recovery'
              ? `category on under 3 scored trucks; priced at the ${r.seller} whole-truck rate (${pct(r.seller_average)})`
              : `under 5 sold; priced at the ${r.seller} average (${pct(r.seller_average)})`
          }
        />
      ) : null}
    </Card>
  );
}

function YourNumber({ r }: { r: EstimateResult }) {
  const [value, setValue] = useState(r.your_number != null ? String(Math.round(r.your_number)) : '');
  const [saved, setSaved] = useState<number | null>(r.your_number);
  useEffect(() => {
    setValue(r.your_number != null ? String(Math.round(r.your_number)) : '');
    setSaved(r.your_number);
  }, [r.lot?.id, r.your_number]);
  const save = useMutation({
    mutationFn: () => patchBuyingValuationInputs(r.lot!.id, { revenue_override: value.trim() || null }),
    onSuccess: () => setSaved(value.trim() ? Number(value.replace(/[$,]/g, '')) : null),
  });
  const typed = Number(value.replace(/[$,]/g, ''));
  const mine = value.trim() && Number.isFinite(typed) ? typed : null;
  const dirty = (mine ?? null) !== (saved != null ? Math.round(saved) : null);
  return (
    <Card title="Your number">
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <TextField
          size="small"
          label="Brings in"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!r.lot}
          inputProps={{ inputMode: 'decimal' }}
          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
          sx={{ flex: 1 }}
        />
        <Button variant="outlined" disabled={!r.lot || !dirty || save.isPending} onClick={() => save.mutate()} sx={{ minWidth: 72 }}>
          {save.isPending ? <CircularProgress size={18} /> : 'Save'}
        </Button>
      </Stack>
      <Typography variant="caption" color={save.isError ? 'error' : 'text.secondary'} display="block" sx={{ mt: 0.75, minHeight: '1.25em' }}>
        {save.isError
          ? 'Could not save (admins only).'
          : !r.lot
            ? 'Paste the lot link to save your number.'
            : !value.trim() && saved == null
              ? 'Your own guess at what it brings in, kept beside ours.'
            : mine != null && r.landed != null && r.freight.used != null
              ? `Profit at your number ${signed(mine - r.landed)}${!dirty && saved != null ? ' · saved on this lot' : ''}`
              : !dirty && saved != null
                ? 'Saved on this lot'
                : ' '}
      </Typography>
    </Card>
  );
}

function Categories({ rows }: { rows: EstimateCategory[] }) {
  const theme = useTheme();
  const isDesk = useMediaQuery(theme.breakpoints.up('md'));
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  if (!open) {
    return (
      <Button variant="text" onClick={() => setOpen(true)} sx={{ px: 0 }}>
        Show by seller category ({rows.length})
      </Button>
    );
  }
  const hide = (
    <Button variant="text" size="small" onClick={() => setOpen(false)}>
      Hide
    </Button>
  );
  if (!isDesk) {
    return (
      <Card title={`By seller category (${rows.length})`}>
        <Box sx={{ textAlign: 'right', mt: -4 }}>{hide}</Box>
        {rows.map((c) => (
          <Row
            key={c.seller_category}
            label={c.seller_category}
            value={money(c.likely)}
            sub={`${money(c.retail)} · ${pct(c.share)} · ${rates(c.rates)} · ${c.evidence}`}
          />
        ))}
      </Card>
    );
  }
  return (
    <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1.5, pt: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>By seller category ({rows.length})</Typography>
        {hide}
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Seller category</TableCell>
            <TableCell align="right">Retail</TableCell>
            <TableCell align="right">Share</TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>Rate low / likely / high</TableCell>
            <TableCell align="right">Brings in (likely)</TableCell>
            <TableCell>Where the rate comes from</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.seller_category}>
              <TableCell>{c.seller_category}</TableCell>
              <TableCell align="right">{money(c.retail)}</TableCell>
              <TableCell align="right">{pct(c.share)}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{rates(c.rates)}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>{money(c.likely)}</TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>
                {c.evidence}
                {c.rule !== 'category' && c.rule !== 'fill-in' ? ` · ${c.rule}` : ''}
                {c.missing_pieces_retail ? ` · ${money(c.missing_pieces_retail)} of retail may be missing pieces` : ''}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

function Result({ data }: { data: EstimateResponse }) {
  if (!data.supported) {
    return <Alert severity={data.not_found ? 'warning' : 'info'}>{data.message}</Alert>;
  }
  return (
    <Box>
      <LotHeader r={data} />
      {data.notes.map((n) => (
        <Alert key={n} severity={/far (apart|from)|a pallet is high/.test(n) ? 'warning' : 'info'} sx={{ mb: 1.5 }}>{n}</Alert>
      ))}
      <Headline r={data} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        <b>How sure:</b> {data.miss_line}
      </Typography>
      {data.rates_source === 'recovery' && data.seller_slug ? (
        <EstimateScores seller={data.seller_slug} sellerName={data.seller} />
      ) : null}
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, mb: 1.5 }}>
        <CostCard r={data} />
        <RulesCard r={data} />
        <YourNumber r={data} />
      </Box>
      <Categories rows={data.categories} />
    </Box>
  );
}

function errorText(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail || 'Could not run the estimate. Try again.';
}

/**
 * Buying → Estimate Profit (Dash Update #73, ship 1): paste a B-Stock link or drop its manifest
 * CSV; what a lot should bring in, the profit, and the most to bid at 20% and 23% landed.
 */
export default function EstimateProfitPage() {
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [price, setPrice] = useState('');
  const [freight, setFreight] = useState('');
  const [dragging, setDragging] = useState(false);
  const [stale, setStale] = useState(false);
  const [seller, setSeller] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const run = useMutation({ mutationFn: postEstimateProfit });
  // A new lot starts clean: typed price and freight belong to the lot they were typed for.
  const newLot = () => {
    setPrice('');
    setFreight('');
    setStale(true);
    if (run.isError) run.reset();
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!link.trim() && !file) return;
    setStale(false);
    run.mutate({ link: link.trim(), file, seller, price: price.trim(), freight: freight.trim() });
  };
  // A CSV dropped anywhere on the page counts (a near miss would otherwise open the file in the browser).
  useEffect(() => {
    const over = (e: globalThis.DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        setDragging(true);
      }
    };
    const drop = (e: globalThis.DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      setDragging(false);
      setFile(e.dataTransfer.files[0]);
      setPrice('');
      setFreight('');
      setStale(true);
    };
    const leave = (e: globalThis.DragEvent) => {
      if (!e.relatedTarget) setDragging(false);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    window.addEventListener('dragleave', leave);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      window.removeEventListener('dragleave', leave);
    };
  }, []);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      newLot();
    }
  };

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>Estimate Profit</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        What a B-Stock lot should bring in, from what we sold of each seller category, and the most to bid.
      </Typography>

      <Paper variant="outlined" component="form" onSubmit={submit} sx={{ p: 1.5, mb: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 150px 150px 120px' },
            gridTemplateAreas: {
              xs: '"link link" "drop drop" "seller seller" "price freight" "go go"',
              md: '"link price freight go" "drop drop seller seller"',
            },
          }}
        >
          <TextField
            sx={{ gridArea: 'link' }}
            size="small"
            label="B-Stock lot link"
            placeholder="https://bstock.com/buy/listings/details/…"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              newLot();
            }}
            fullWidth
          />
          <Box
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click();
            }}
            sx={{
              gridArea: 'drop',
              border: 1,
              borderStyle: 'dashed',
              borderColor: dragging ? 'primary.main' : 'divider',
              borderRadius: 1,
              px: 1.5,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: 'pointer',
              bgcolor: dragging ? 'action.hover' : undefined,
            }}
          >
            <Typography variant="body2" color={file ? 'text.primary' : 'text.secondary'} noWrap sx={{ flex: 1 }}>
              {file ? file.name : 'Drop its manifest CSV here, or choose a file (optional)'}
            </Typography>
            {file ? (
              <IconButton
                size="small"
                aria-label="Remove the file"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = '';
                }}
              >
                <IconClose fontSize="small" />
              </IconButton>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              hidden
              data-testid="manifest-file"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                newLot();
              }}
            />
          </Box>
            <TextField
              select
              size="small"
              label="Seller"
              value={seller}
              onChange={(e) => {
                setSeller(e.target.value);
                if (run.isError) run.reset();
              }}
              sx={{ gridArea: 'seller' }}
              SelectProps={{ displayEmpty: true }}
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">From the link or the CSV</MenuItem>
              {SELLER_CHOICES.map(([v, label]) => (
                <MenuItem key={v} value={v}>{label}</MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Price"
              placeholder="B-Stock price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputProps={{ inputMode: 'decimal' }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              sx={{ gridArea: 'price' }}
            />
            <TextField
              size="small"
              label="Freight"
              placeholder="our estimate"
              value={freight}
              onChange={(e) => setFreight(e.target.value)}
              inputProps={{ inputMode: 'decimal' }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              sx={{ gridArea: 'freight' }}
            />
            <Button type="submit" variant="contained" disabled={(!link.trim() && !file) || run.isPending} sx={{ gridArea: 'go', height: 40 }}>
              {run.isPending ? <CircularProgress size={20} color="inherit" /> : 'Estimate'}
            </Button>
        </Box>
      </Paper>

      {run.isPending && !run.data ? <Skeleton variant="rounded" height={260} /> : null}
      {run.isError ? <Alert severity="error">{errorText(run.error)}</Alert> : null}
      {run.data && !run.isError ? (
        <Typography variant="body2" color="text.secondary" noWrap sx={{ mb: 1, height: 20, lineHeight: '20px' }}>
          {stale ? 'Showing the last lot. Press Estimate for this one.' : ''}
        </Typography>
      ) : null}
      {run.data && !run.isError ? (
        <Box sx={{ opacity: run.isPending || stale ? 0.45 : 1, transition: 'opacity 120ms' }} aria-busy={run.isPending}>
          <Result data={run.data} />
        </Box>
      ) : null}
    </Box>
  );
}
