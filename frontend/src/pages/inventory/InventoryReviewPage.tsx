/**
 * Inventory → Review (inventory review, owner 2026-10-22). Tabs: Categories, Vendors, Price points (one row each, from
 * the nightly rollup and the shelf now) and Flags (each flag's rule and limit, and what carries it now). Week / 4 weeks
 * of flows from complete weeks, stock as of now. A category opens its subcategories; a subcategory, vendor or price
 * point opens its items in Inventory search. Desk: a sortable table. Phone: cards.
 * Server: `apps/inventory/services/inventory_review.py`; the page state lives in the URL (`tab`, `span`, `category`).
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Box, Breadcrumbs, Button, Card, CardActionArea, Chip, LinearProgress, Link, MenuItem, Paper, Stack, Tab, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Tabs, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { updateSetting } from '../../api/core.api';
import {
  getInventoryReview, getReviewFlags, NO_SUBCATEGORY_KEY, type FlagsResponse, type ReviewDimension, type ReviewFlag,
  type ReviewResponse, type ReviewRow,
} from '../../api/inventoryReview.api';
import { PageHeader } from '../../components/common/PageHeader';
import { useAuth } from '../../contexts/AuthContext';

type SortKey = 'label' | 'rank' | 'units_in' | 'units_out' | 'on_hand' | 'weeks_of_supply' | 'stale_share' | 'bulk_share'
  | 'recovery' | 'median_days_to_sell' | 'flags';

type TabId = 'categories' | 'vendors' | 'price-points' | 'flags';

const TABS: { id: TabId; label: string; dimension?: ReviewDimension; noun: string; nounPlural: string }[] = [
  { id: 'categories', label: 'Categories', dimension: 'category', noun: 'Category', nounPlural: 'Categories' },
  { id: 'vendors', label: 'Vendors', dimension: 'vendor', noun: 'Vendor', nounPlural: 'Vendors' },
  { id: 'price-points', label: 'Price points', dimension: 'price_point', noun: 'Price point', nounPlural: 'Price points' },
  { id: 'flags', label: 'Flags', noun: 'Flag', nounPlural: 'Flags' },
];

const DIMENSIONS: ReviewDimension[] = ['category', 'vendor', 'price_point'];

const FLAG_LABEL: Record<ReviewFlag, string> = {
  overstocked: 'Overstocked',
  short: 'Short',
  stale: 'Stale-heavy',
  slowing: 'Slowing',
  missing: 'Missing data',
  priced_high: 'Priced high',
  priced_low: 'Priced low',
};

export function pct(n: number | null | undefined): string {
  return n == null ? '-' : `${Math.round(n * 100)}%`;
}

function weeks(n: number | null): string {
  if (n == null) return '-';
  return n >= 100 ? '99+' : n.toFixed(1);
}

function days(n: number | null): string {
  return n == null ? '-' : `${Math.round(n)}`;
}

function shortDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** What each flag means, with this page's limits. */
export function flagHelp(flag: ReviewFlag, s: Record<string, number>, row?: ReviewRow): string {
  switch (flag) {
    case 'overstocked':
      return `More than ${s.inventory_review_overstock_weeks} weeks of supply, or stock with no sale in 4 weeks.`;
    case 'short':
      return `Under ${s.inventory_review_short_weeks} weeks of supply.`;
    case 'stale':
      return `More than ${pct(s.inventory_review_stale_heavy_share)} of on hand is over ${s.inventory_review_stale_days} days on the shelf.`;
    case 'slowing':
      return `The last 4 weeks sold ${pct(s.inventory_review_slowing_share)} or more below the 12-week average.`;
    case 'priced_high':
    case 'priced_low':
      return row
        ? `The shelf asks ${pct(row.asking)} of retail; sold items kept ${pct(row.recovery_12wk)} over 12 weeks (n=${row.sold_with_retail_12wk.toLocaleString()}). Flagged ${pct(s.inventory_review_price_gap_share)} or more apart.`
        : `The shelf asks ${pct(s.inventory_review_price_gap_share)} more (or less) of retail than sold items kept over 12 weeks.`;
    default:
      return row
        ? `Mixed lots, or over ${pct(s.inventory_review_missing_share)} of on hand missing data: ${row.on_hand_no_retail} with no retail, ${row.on_hand_no_checkin} with no check-in date.`
        : `Mixed lots, or over ${pct(s.inventory_review_missing_share)} of on hand with no retail or no check-in date.`;
  }
}

function sortValue(row: ReviewRow, key: SortKey): number | string {
  if (key === 'label') return row.label.toLowerCase();
  if (key === 'flags') return row.flags.length;
  const v = row[key];
  return v == null ? -Infinity : v;
}

/** Inventory search, filtered to one row's items: a category (and subcategory), a vendor or a price point. */
export function itemsHref(
  dimension: ReviewDimension, category: string | null, row: Pick<ReviewRow, 'key'> | null, stale = false,
): string {
  const params = new URLSearchParams();
  if (dimension === 'vendor') {
    if (row) params.set('vendor', row.key || NO_SUBCATEGORY_KEY);
  } else if (dimension === 'price_point') {
    if (row) params.set('price_point', row.key);
  } else if (category) {
    params.set('category', category);
    if (row) params.set('sub', row.key || NO_SUBCATEGORY_KEY);
  } else if (row) {
    params.set('category', row.key);
  }
  if (stale) params.set('stale', '1');
  return `/inventory/search?${params.toString()}`;
}

function Flags({ row, settings, dense }: { row: ReviewRow; settings: Record<string, number>; dense?: boolean }) {
  if (!row.flags.length) return dense ? <Typography variant="body2" color="text.secondary">-</Typography> : null;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {row.flags.map((f) => (
        <Tooltip key={f} title={flagHelp(f, settings, row)}>
          <Chip size="small" label={FLAG_LABEL[f]} color={f === 'short' || f === 'missing' ? 'default' : 'warning'}
            variant="outlined" sx={{ height: 20, fontSize: 11 }} />
        </Tooltip>
      ))}
    </Stack>
  );
}

function Recovery({ row }: { row: ReviewRow }) {
  const tip = `Kept ${pct(row.recovery)} of retail on ${row.sold_with_retail} of ${row.units_sold} sold with a retail`
    + (row.net_to_cost != null ? `; ${row.net_to_cost.toFixed(1)}× cost on ${row.sold_with_cost} with a cost.` : '.');
  return (
    <Tooltip title={tip}>
      <Box component="span">
        {pct(row.recovery)}
        {row.net_to_cost != null && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
            {row.net_to_cost.toFixed(1)}×
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
}

/** The stale share, linked to those items in Inventory search (the store-wide total has no single filter). */
function StaleLink({ row, data, stopRow }: { row: ReviewRow; data: ReviewResponse; stopRow?: boolean }) {
  const isTotal = row.rank === -1;
  if (!row.stale_on_hand || (isTotal && !data.category)) return <>{pct(row.stale_share)}</>;
  return (
    <Tooltip title={`${row.stale_on_hand.toLocaleString()} on the shelf too long: see them`}>
      <Link component={RouterLink} to={itemsHref(data.dimension, data.category, isTotal ? null : row, true)}
        color="inherit" underline="always" sx={{ textDecorationStyle: 'dotted' }}
        onClick={(e) => { if (stopRow) e.stopPropagation(); }}>
        {pct(row.stale_share)}
      </Link>
    </Tooltip>
  );
}

const COLUMNS: { key: SortKey; label: string; tip: string }[] = [
  { key: 'units_in', label: 'In', tip: 'Checked in during the span.' },
  { key: 'units_out', label: 'Out', tip: 'Sold, scrapped or lost during the span.' },
  { key: 'on_hand', label: 'On hand', tip: 'On the shelf now.' },
  { key: 'weeks_of_supply', label: 'Weeks', tip: 'Weeks of supply: on hand ÷ units sold per week over the last 4 weeks.' },
  { key: 'stale_share', label: 'Stale', tip: 'Share of on hand on the shelf longer than the stale days.' },
  { key: 'bulk_share', label: 'Bulk', tip: 'Share of on hand that is a product with 10 or more units on the floor.' },
  { key: 'recovery', label: 'Recovery', tip: 'Kept ÷ retail on what sold (and × cost where cost exists).' },
  { key: 'median_days_to_sell', label: 'Days', tip: 'Median days from check-in to sale.' },
  { key: 'flags', label: 'Flags', tip: 'Tap a flag for what it means.' },
];

function Cells({ row, data, stopRow }: { row: ReviewRow; data: ReviewResponse; stopRow?: boolean }) {
  return (
    <>
      <TableCell align="right">{row.units_in.toLocaleString()}</TableCell>
      <TableCell align="right">{row.units_out.toLocaleString()}</TableCell>
      <TableCell align="right">{row.on_hand.toLocaleString()}</TableCell>
      <TableCell align="right">{weeks(row.weeks_of_supply)}</TableCell>
      <TableCell align="right"><StaleLink row={row} data={data} stopRow={stopRow} /></TableCell>
      <TableCell align="right">{pct(row.bulk_share)}</TableCell>
      <TableCell align="right"><Recovery row={row} /></TableCell>
      <TableCell align="right">{days(row.median_days_to_sell)}</TableCell>
      <TableCell><Flags row={row} settings={data.settings} dense /></TableCell>
    </>
  );
}

function tabOf(dimension: ReviewDimension) {
  return TABS.find((t) => t.dimension === dimension) ?? TABS[0];
}

function DeskTable({ data, rows, sort, onSort, onOpen }: {
  data: ReviewResponse; rows: ReviewRow[]; sort: { key: SortKey; desc: boolean }; onSort: (key: SortKey) => void;
  onOpen: (row: ReviewRow) => void;
}) {
  const noun = data.category ? 'Subcategory' : tabOf(data.dimension).noun;
  const nameKey: SortKey = data.dimension === 'price_point' ? 'rank' : 'label';
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" stickyHeader aria-label={data.category ? `${data.category} subcategories` : tabOf(data.dimension).nounPlural}
        sx={{ '& th': { whiteSpace: 'nowrap' }, '& td, & th': { px: 1.25 }, '& td': { fontVariantNumeric: 'tabular-nums' } }}>
        <TableHead>
          <TableRow>
            <TableCell sortDirection={sort.key === nameKey ? (sort.desc ? 'desc' : 'asc') : false}>
              <TableSortLabel active={sort.key === nameKey} direction={sort.desc ? 'desc' : 'asc'} onClick={() => onSort(nameKey)}>
                {noun}
              </TableSortLabel>
            </TableCell>
            {COLUMNS.map((c) => (
              <TableCell key={c.key} align={c.key === 'flags' ? 'left' : 'right'}
                sortDirection={sort.key === c.key ? (sort.desc ? 'desc' : 'asc') : false}>
                <Tooltip title={c.tip}>
                  <TableSortLabel active={sort.key === c.key} direction={sort.desc ? 'desc' : 'asc'} onClick={() => onSort(c.key)}>
                    {c.label}
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow sx={{ '& td': { fontWeight: 700, bgcolor: 'action.hover' } }}>
            <TableCell>{data.category ? `All of ${data.category}` : data.total.label}</TableCell>
            <Cells row={data.total} data={data} />
          </TableRow>
          {rows.map((row) => (
            <TableRow key={row.key || '(none)'} hover onClick={() => onOpen(row)} sx={{ cursor: 'pointer' }}>
              <TableCell sx={{ fontWeight: 600, maxWidth: 280 }}>{row.label}</TableCell>
              <Cells row={row} data={data} stopRow />
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={COLUMNS.length + 1}>
                <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Nothing here yet.</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{children}</Typography>
    </Box>
  );
}

function RowCard({ row, title, data, onOpen }: {
  row: ReviewRow; title: string; data: ReviewResponse; onOpen?: () => void;
}) {
  const body = (
    <Box sx={{ p: 1.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1} sx={{ mb: 0.75 }}>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {row.on_hand.toLocaleString()} on hand
        </Typography>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: row.flags.length ? 1 : 0 }}>
        <Stat label="In / out">{row.units_in.toLocaleString()} / {row.units_out.toLocaleString()}</Stat>
        <Stat label="Weeks">{weeks(row.weeks_of_supply)}</Stat>
        <Stat label="Stale"><StaleLink row={row} data={data} stopRow /></Stat>
        <Stat label="Bulk">{pct(row.bulk_share)}</Stat>
        <Stat label="Recovery"><Recovery row={row} /></Stat>
        <Stat label="Days to sell">{days(row.median_days_to_sell)}</Stat>
      </Box>
      <Flags row={row} settings={data.settings} />
    </Box>
  );
  return (
    <Card variant="outlined" sx={{ mb: 1 }}>
      {onOpen ? <CardActionArea component="div" onClick={onOpen}>{body}</CardActionArea> : body}
    </Card>
  );
}

const PHONE_SORTS: { value: SortKey; label: string }[] = [
  { value: 'on_hand', label: 'Most on hand' },
  { value: 'flags', label: 'Most flags' },
  { value: 'weeks_of_supply', label: 'Most weeks of supply' },
  { value: 'stale_share', label: 'Most stale' },
  { value: 'units_out', label: 'Most out' },
  { value: 'recovery', label: 'Best recovery' },
  { value: 'label', label: 'Name' },
];

function SpanToggle({ span, setParam }: { span: 1 | 4; setParam: (changes: Record<string, string | null>) => void }) {
  return (
    <ToggleButtonGroup size="small" exclusive value={span} aria-label="Span"
      onChange={(_e, v) => { if (v) setParam({ span: v === 4 ? '4' : null }); }}>
      <ToggleButton value={1}>Week</ToggleButton>
      <ToggleButton value={4}>4 weeks</ToggleButton>
    </ToggleButtonGroup>
  );
}

function RowsTab({ dimension, span, category, phone, setParam }: {
  dimension: ReviewDimension; span: 1 | 4; category: string | null; phone: boolean;
  setParam: (changes: Record<string, string | null>) => void;
}) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>(
    dimension === 'price_point' ? { key: 'rank', desc: false } : { key: 'on_hand', desc: true },
  );
  const { data, isFetching, isError } = useQuery({
    queryKey: ['inventory-review', dimension, span, category],
    queryFn: async ({ signal }) => (await getInventoryReview({ span, dimension, category }, signal)).data,
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])];
    list.sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -c : c;
    });
    return list;
  }, [data, sort]);
  const onSort = useCallback((key: SortKey) => {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'label' && key !== 'rank' }));
  }, []);
  const onOpen = useCallback((row: ReviewRow) => {
    if (dimension === 'category' && !category) setParam({ category: row.key });
    else navigate(itemsHref(dimension, category, row));
  }, [dimension, category, navigate, setParam]);
  const shown = data && data.dimension === dimension && data.category === category;
  const hint = dimension === 'category' && !category
    ? (phone ? 'Tap a category for its subcategories.' : 'Click a category for its subcategories; click a subcategory for its items.')
    : (phone ? 'Tap a row for its items.' : 'Click a row for its items in Inventory search.');

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}
        justifyContent="space-between" sx={{ mb: 1 }}>
        {category ? (
          <Breadcrumbs aria-label="Where you are">
            <Link component="button" underline="hover" onClick={() => setParam({ category: null })}>All categories</Link>
            <Typography color="text.primary" sx={{ fontWeight: 600 }}>{category}</Typography>
          </Breadcrumbs>
        ) : (
          <Typography variant="body2" color="text.secondary">{hint}</Typography>
        )}
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
          {category && (
            <Button size="small" component={RouterLink} to={itemsHref('category', category, null)}>See items</Button>
          )}
          {phone && (
            <TextField select size="small" value={sort.key === 'rank' ? 'label' : sort.key} sx={{ minWidth: 150, flex: 1 }}
              onChange={(e) => {
                const key = e.target.value as SortKey;
                setSort(key === 'label' && dimension === 'price_point' ? { key: 'rank', desc: false } : { key, desc: key !== 'label' });
              }}
              inputProps={{ 'aria-label': 'Sort' }}>
              {PHONE_SORTS.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
          )}
          <SpanToggle span={span} setParam={setParam} />
        </Stack>
      </Stack>
      <Box sx={{ height: 4, mb: 0.5 }}>{isFetching && <LinearProgress />}</Box>
      {isError && <Typography color="error" sx={{ mb: 1 }}>The review did not load. Try again.</Typography>}
      {data && shown && (phone ? (
        <Box>
          <RowCard row={data.total} title={category ? `All of ${category}` : data.total.label} data={data} />
          {rows.map((row) => (
            <RowCard key={row.key || '(none)'} row={row} title={row.label} data={data} onOpen={() => onOpen(row)} />
          ))}
        </Box>
      ) : (
        <DeskTable data={data} rows={rows} sort={sort} onSort={onSort} onOpen={onOpen} />
      ))}
    </>
  );
}

// ── Flags tab ─────────────────────────────────────────────────────────────────

type LimitKind = 'weeks' | 'share' | 'days';

const LIMITS: { key: ReviewFlag | 'stale_days'; title: string; kind: LimitKind; rule: string }[] = [
  { key: 'stale_days', title: 'Stale', kind: 'days', rule: 'An item on the shelf longer than this is stale. Every tab here uses it.' },
  { key: 'overstocked', title: 'Overstocked', kind: 'weeks', rule: 'More weeks of supply than this, or stock with no sale in the last 4 weeks.' },
  { key: 'short', title: 'Short', kind: 'weeks', rule: 'Fewer weeks of supply than this (only where something sold in the last 4 weeks).' },
  { key: 'stale', title: 'Stale-heavy', kind: 'share', rule: 'More of on hand stale than this.' },
  { key: 'slowing', title: 'Slowing', kind: 'share', rule: 'The last 4 weeks sold this much below the 12-week average (only with at least 1 sale a week over 12 weeks).' },
  { key: 'missing', title: 'Missing data', kind: 'share', rule: 'More of on hand with no retail or no check-in date than this. Mixed lots always carries it.' },
  { key: 'priced_high', title: 'Priced high or low', kind: 'share', rule: 'The shelf asks this much more (or less) of retail than sold items kept over 12 weeks (at least 20 sales with a retail). Asking is a tag price and kept is after ThriftBucks, so asking runs a little above kept even when priced right.' },
];

const UNIT: Record<LimitKind, string> = { weeks: 'weeks', share: '%', days: 'days' };

/** The value shown in the box: weeks and days as stored, shares as whole percents. */
export function limitShown(kind: LimitKind, stored: number): string {
  return kind === 'share' ? String(Math.round(stored * 100)) : String(stored);
}

/** The value to store from the box, or null when it is not a sensible limit. */
export function limitStored(kind: LimitKind, typed: string): number | null {
  const n = Number(typed.trim());
  if (!typed.trim() || !Number.isFinite(n) || n < 0) return null;
  if (kind === 'share') return n > 100 ? null : Math.round(n) / 100;
  if (kind === 'days') return n < 1 || n > 3650 ? null : Math.round(n);
  return n > 520 ? null : n;
}

function LimitField({ limit, data, canEdit }: { limit: (typeof LIMITS)[number]; data: FlagsResponse; canEdit: boolean }) {
  const key = data.setting_keys[limit.key];
  const stored = data.settings[key];
  const [text, setText] = useState(limitShown(limit.kind, stored));
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const value = limitStored(limit.kind, text);
  const changed = value != null && value !== stored;
  if (!canEdit) {
    return (
      <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
        {limitShown(limit.kind, stored)} {UNIT[limit.kind]}
      </Typography>
    );
  }
  const save = async () => {
    if (value == null) return;
    setSaving(true);
    try {
      await updateSetting(key, { value });
      await queryClient.invalidateQueries({ queryKey: ['inventory-review'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-review-flags'] });
      enqueueSnackbar(`${limit.title} limit saved.`, { variant: 'success' });
    } catch {
      enqueueSnackbar('That limit did not save.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
      <TextField size="small" value={text} onChange={(e) => setText(e.target.value)} error={value == null}
        inputProps={{ inputMode: 'decimal', 'aria-label': `${limit.title} limit`, style: { textAlign: 'right' } }}
        InputProps={{ endAdornment: <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>{UNIT[limit.kind]}</Typography> }}
        sx={{ width: 130 }}
        onKeyDown={(e) => { if (e.key === 'Enter' && changed) void save(); }} />
      <Button size="small" variant="contained" disabled={!changed || saving} onClick={() => void save()}>Save</Button>
    </Stack>
  );
}

const CARRIERS_SHOWN = 8;

function Carriers({ flag, heading }: { flag: FlagsResponse['flags'][number]; heading?: string }) {
  const [all, setAll] = useState(false);
  const groups = DIMENSIONS.filter((d) => flag.carried[d].length);
  if (!groups.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {heading ? `${heading}: nothing now.` : 'Nothing carries it now.'}
      </Typography>
    );
  }
  return (
    <Stack spacing={0.75} sx={{ mt: 1 }}>
      {heading && <Typography variant="body2" sx={{ fontWeight: 600 }}>{heading}</Typography>}
      {groups.map((d) => (
        <Box key={d}>
          <Typography variant="caption" color="text.secondary">
            {tabOf(d).nounPlural} ({flag.carried[d].length})
          </Typography>
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {(all ? flag.carried[d] : flag.carried[d].slice(0, CARRIERS_SHOWN)).map((c) => (
              <Chip key={c.key || '(none)'} size="small" variant="outlined" clickable component={RouterLink}
                to={d === 'category' ? `/inventory/review?${new URLSearchParams({ category: c.key }).toString()}` : itemsHref(d, null, c)}
                label={`${c.label} · ${c.on_hand.toLocaleString()}`} sx={{ maxWidth: '100%' }} />
            ))}
            {!all && flag.carried[d].length > CARRIERS_SHOWN && (
              <Chip size="small" label={`+${flag.carried[d].length - CARRIERS_SHOWN} more`} onClick={() => setAll(true)} />
            )}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function FlagsTab({ span, phone, setParam }: {
  span: 1 | 4; phone: boolean; setParam: (changes: Record<string, string | null>) => void;
}) {
  const { hasRole, user } = useAuth();
  const canEdit = hasRole('Manager') || !!user?.is_superuser;
  const { data, isFetching, isError } = useQuery({
    queryKey: ['inventory-review-flags', span],
    queryFn: async ({ signal }) => (await getReviewFlags(span, signal)).data,
    placeholderData: keepPreviousData,
  });
  const flagByKey = useMemo(() => new Map((data?.flags ?? []).map((f) => [f.key, f])), [data]);
  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}
        justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          What each flag means, its limit{canEdit ? ' (change it and Save)' : ''}, and what carries it now. Tap one to see it.
        </Typography>
        <SpanToggle span={span} setParam={setParam} />
      </Stack>
      <Box sx={{ height: 4, mb: 0.5 }}>{isFetching && <LinearProgress />}</Box>
      {isError && <Typography color="error" sx={{ mb: 1 }}>The flags did not load. Try again.</Typography>}
      {data && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, alignItems: 'start' }}>
          {LIMITS.filter((l) => l.key !== 'priced_high' || data.recovery_enabled).map((limit) => {
            const flag = limit.key === 'stale_days' ? undefined : flagByKey.get(limit.key);
            const low = limit.key === 'priced_high' ? flagByKey.get('priced_low') : undefined;
            const stored = data.settings[data.setting_keys[limit.key]];
            return (
              <Paper key={limit.key} variant="outlined" sx={{ p: 1.5 }} aria-label={`${limit.title} flag`}>
                <Stack direction={phone ? 'column' : 'row'} spacing={1} justifyContent="space-between"
                  alignItems={phone ? 'stretch' : 'flex-start'}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }}>{limit.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{limit.rule}</Typography>
                  </Box>
                  <LimitField key={`${limit.key}:${stored}`} limit={limit} data={data} canEdit={canEdit} />
                </Stack>
                {flag && <Carriers flag={flag} heading={low ? 'Priced high' : undefined} />}
                {low && <Carriers flag={low} heading="Priced low" />}
              </Paper>
            );
          })}
        </Box>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryReviewPage() {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [params, setParams] = useSearchParams();
  const span: 1 | 4 = params.get('span') === '4' ? 4 : 1;
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0];
  const category = tab.id === 'categories' ? params.get('category') || null : null;

  const setParam = useCallback((changes: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
      return next;
    });
  }, [setParams]);

  // The span's dates and the stock time, from the Categories tab (cached for that tab too).
  const { data: head } = useQuery({
    queryKey: ['inventory-review', 'category', span, null],
    queryFn: async ({ signal }) => (await getInventoryReview({ span, dimension: 'category' }, signal)).data,
    placeholderData: keepPreviousData,
  });
  const subtitle = head
    ? `${span === 1 ? 'Week' : '4 weeks'} of ${shortDay(head.from)} to ${shortDay(head.to)} · on hand as of ${new Date(head.as_of).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <PageHeader title="Inventory review" dense subtitle={subtitle} />
      <Tabs value={tab.id} variant="scrollable" allowScrollButtonsMobile
        onChange={(_e, v: TabId) => setParam({ tab: v === 'categories' ? null : v, category: null })}
        sx={{ mb: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36 } }}>
        {TABS.map((t) => <Tab key={t.id} value={t.id} label={t.label} />)}
      </Tabs>
      {tab.dimension ? (
        <RowsTab key={tab.id} dimension={tab.dimension} span={span} category={category} phone={phone} setParam={setParam} />
      ) : (
        <FlagsTab span={span} phone={phone} setParam={setParam} />
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        In, out, recovery and days to sell are for complete weeks (Monday to Sunday). On hand, stale and bulk are now.
        Recovery is what the store kept (after ThriftBucks) ÷ retail, on sold items that have a retail. Price points use
        today's tag price.
      </Typography>
    </Box>
  );
}
