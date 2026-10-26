/**
 * Inventory → Review (inventory review phase 2, owner 2026-10-22). Tabs: Categories (Vendors and Price points come in
 * phase 3). Week / 4 weeks of flows from the nightly rollup, stock as of now. Tap a category for its subcategories,
 * then a subcategory for its items in Inventory search. Desk: a sortable table. Phone: cards.
 * Server: `apps/inventory/services/inventory_review.py`; the page state lives in the URL (`span`, `category`).
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Box, Breadcrumbs, Button, Card, CardActionArea, Chip, LinearProgress, Link, MenuItem, Paper, Stack, Tab, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Tabs, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getInventoryReview, NO_SUBCATEGORY_KEY, type ReviewFlag, type ReviewResponse, type ReviewRow,
} from '../../api/inventoryReview.api';
import { PageHeader } from '../../components/common/PageHeader';

type SortKey = 'label' | 'units_in' | 'units_out' | 'on_hand' | 'weeks_of_supply' | 'stale_share' | 'bulk_share'
  | 'recovery' | 'median_days_to_sell' | 'flags';

const FLAG_LABEL: Record<ReviewFlag, string> = {
  overstocked: 'Overstocked',
  short: 'Short',
  stale: 'Stale-heavy',
  slowing: 'Slowing',
  missing: 'Missing data',
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

/** Inventory search, filtered to this row's items. */
export function itemsHref(category: string | null, row: ReviewRow | null, stale = false): string {
  const params = new URLSearchParams();
  if (category) {
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

function StaleLink({ row, category, stopRow }: { row: ReviewRow; category: string | null; stopRow?: boolean }) {
  if (!row.stale_on_hand) return <>{pct(row.stale_share)}</>;
  return (
    <Tooltip title={`${row.stale_on_hand.toLocaleString()} on the shelf too long: see them`}>
      <Link component={RouterLink} to={itemsHref(category, row, true)} color="inherit" underline="always"
        sx={{ textDecorationStyle: 'dotted' }}
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

function Cells({ row, category, settings, stopRow }: {
  row: ReviewRow; category: string | null; settings: Record<string, number>; stopRow?: boolean;
}) {
  return (
    <>
      <TableCell align="right">{row.units_in.toLocaleString()}</TableCell>
      <TableCell align="right">{row.units_out.toLocaleString()}</TableCell>
      <TableCell align="right">{row.on_hand.toLocaleString()}</TableCell>
      <TableCell align="right">{weeks(row.weeks_of_supply)}</TableCell>
      <TableCell align="right"><StaleLink row={row} category={category} stopRow={stopRow} /></TableCell>
      <TableCell align="right">{pct(row.bulk_share)}</TableCell>
      <TableCell align="right"><Recovery row={row} /></TableCell>
      <TableCell align="right">{days(row.median_days_to_sell)}</TableCell>
      <TableCell><Flags row={row} settings={settings} dense /></TableCell>
    </>
  );
}

function DeskTable({ data, rows, sort, onSort, onOpen }: {
  data: ReviewResponse; rows: ReviewRow[]; sort: { key: SortKey; desc: boolean }; onSort: (key: SortKey) => void;
  onOpen: (row: ReviewRow) => void;
}) {
  const category = data.category;
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" stickyHeader aria-label={category ? `${category} subcategories` : 'Categories'}
        sx={{ '& th': { whiteSpace: 'nowrap' }, '& td, & th': { px: 1.25 }, '& td': { fontVariantNumeric: 'tabular-nums' } }}>
        <TableHead>
          <TableRow>
            <TableCell sortDirection={sort.key === 'label' ? (sort.desc ? 'desc' : 'asc') : false}>
              <TableSortLabel active={sort.key === 'label'} direction={sort.desc ? 'desc' : 'asc'} onClick={() => onSort('label')}>
                {category ? 'Subcategory' : 'Category'}
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
            <TableCell>{category ? `All of ${category}` : 'All categories'}</TableCell>
            <Cells row={data.total} category={category} settings={data.settings} />
          </TableRow>
          {rows.map((row) => (
            <TableRow key={row.key || '(none)'} hover onClick={() => onOpen(row)} sx={{ cursor: 'pointer' }}>
              <TableCell sx={{ fontWeight: 600, maxWidth: 280 }}>{row.label}</TableCell>
              <Cells row={row} category={category} settings={data.settings} stopRow />
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
        <Stat label="Stale"><StaleLink row={row} category={data.category} stopRow /></Stat>
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

const PHONE_SORTS: { value: string; label: string }[] = [
  { value: 'on_hand', label: 'Most on hand' },
  { value: 'flags', label: 'Most flags' },
  { value: 'weeks_of_supply', label: 'Most weeks of supply' },
  { value: 'stale_share', label: 'Most stale' },
  { value: 'units_out', label: 'Most out' },
  { value: 'recovery', label: 'Best recovery' },
  { value: 'label', label: 'Name' },
];

export default function InventoryReviewPage() {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const span: 1 | 4 = params.get('span') === '4' ? 4 : 1;
  const category = params.get('category') || null;
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'on_hand', desc: true });

  const setParam = useCallback((changes: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
      return next;
    });
  }, [setParams]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['inventory-review', span, category],
    queryFn: async ({ signal }) => (await getInventoryReview({ span, category }, signal)).data,
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
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'label' }));
  }, []);
  const onOpen = useCallback((row: ReviewRow) => {
    if (category) navigate(itemsHref(category, row));
    else setParam({ category: row.key });
  }, [category, navigate, setParam]);

  const shownFor = data && data.category === category;
  const subtitle = data
    ? `${span === 1 ? 'Week' : '4 weeks'} of ${shortDay(data.from)} to ${shortDay(data.to)} · on hand as of ${new Date(data.as_of).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <PageHeader title="Inventory review" dense subtitle={subtitle} />
      <Tabs value="categories" sx={{ mb: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36 } }}>
        <Tab value="categories" label="Categories" />
      </Tabs>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}
        justifyContent="space-between" sx={{ mb: 1 }}>
        {category ? (
          <Breadcrumbs aria-label="Where you are">
            <Link component="button" underline="hover" onClick={() => setParam({ category: null })}>All categories</Link>
            <Typography color="text.primary" sx={{ fontWeight: 600 }}>{category}</Typography>
          </Breadcrumbs>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {phone ? 'Tap a category for its subcategories.' : 'Click a category for its subcategories; click a subcategory for its items.'}
          </Typography>
        )}
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
          {category && (
            <Button size="small" component={RouterLink} to={itemsHref(category, null)}>See items</Button>
          )}
          {phone && (
            <TextField select size="small" value={sort.key} sx={{ minWidth: 150, flex: 1 }}
              onChange={(e) => setSort({ key: e.target.value as SortKey, desc: e.target.value !== 'label' })}
              inputProps={{ 'aria-label': 'Sort' }}>
              {PHONE_SORTS.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
          )}
          <ToggleButtonGroup size="small" exclusive value={span} aria-label="Span"
            onChange={(_e, v) => { if (v) setParam({ span: v === 4 ? '4' : null }); }}>
            <ToggleButton value={1}>Week</ToggleButton>
            <ToggleButton value={4}>4 weeks</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Stack>
      <Box sx={{ height: 4, mb: 0.5 }}>{isFetching && <LinearProgress />}</Box>
      {isError && <Typography color="error" sx={{ mb: 1 }}>The review did not load. Try again.</Typography>}
      {data && shownFor && (phone ? (
        <Box>
          <RowCard row={data.total} title={category ? `All of ${category}` : 'All categories'} data={data} />
          {rows.map((row) => (
            <RowCard key={row.key || '(none)'} row={row} title={row.label} data={data} onOpen={() => onOpen(row)} />
          ))}
        </Box>
      ) : (
        <DeskTable data={data} rows={rows} sort={sort} onSort={onSort} onOpen={onOpen} />
      ))}
      {data && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          In, out, recovery and days to sell are for complete weeks (Monday to Sunday). On hand, stale and bulk are now.
          Recovery is what the store kept (after ThriftBucks) ÷ retail, on sold items that have a retail.
        </Typography>
      )}
    </Box>
  );
}
