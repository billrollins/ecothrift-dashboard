/**
 * Inventory search: one box, one table, one row per product, with its items one click away.
 * Replaces the old Catalog page (`/inventory/workbench`). Search runs on the server
 * (`apps/inventory/services/inventory_search.py`); the page state lives in the URL (`q`, `sold`, `page`, `sort`, `open`).
 * Bulk work (price changes for managers, tag reprints) lives in `components/objects/bulkTools.tsx`.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import AddBox from '@mui/icons-material/AddBox';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import Search from '@mui/icons-material/Search';
import {
  Box, Button, Checkbox, Chip, Collapse, FormControlLabel, IconButton, InputAdornment, LinearProgress, Link, Paper, Stack, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TableSortLabel, TextField, Tooltip,
  Typography,
} from '@mui/material';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  getSimilarProducts, searchInventory, type InventorySearchRow, type InventorySortKey,
} from '../../api/inventorySearch.api';
import { PageHeader } from '../../components/common/PageHeader';
import {
  BulkDrawer, BulkPriceDialog, labelsForSelection, SelectBox, SelectionProvider, useOptionalSelection, usePrintQueue,
} from '../../components/objects/bulkTools';
import {
  formatObjectRef, ObjectLink, ObjectModalProvider, parseObjectRef, useObjectModal, type ObjectRef,
} from '../../components/objects/ObjectModal';
import { ProductItemsTable } from '../../components/objects/ProductItemsTable';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils/format';
import { parseRichSearch, parseWorkbenchSelection } from '../../utils/richInventorySearch';

const DEBOUNCE_MS = 200;

function priceRange(row: InventorySearchRow): string {
  if (row.price_min == null) return '';
  if (row.price_max == null || row.price_max === row.price_min) return formatCurrency(row.price_min);
  return `${formatCurrency(row.price_min)} to ${formatCurrency(row.price_max)}`;
}

/** A money amount with its share of retail under it: the quickest pricing cue. */
function WithPct({ text, pct }: { text: string; pct: number | null }) {
  if (!text) return null;
  return (
    <>
      {text}
      {pct != null && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.1 }}>
          {pct}% of retail
        </Typography>
      )}
    </>
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

/** Price research: products that mean the same kind of thing, loaded only when asked for. */
function SimilarProducts({ productId }: { productId: number }) {
  const [show, setShow] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ['inventory-search-similar', productId],
    queryFn: async ({ signal }) => (await getSimilarProducts(productId, signal)).data.results,
    enabled: show,
    staleTime: 5 * 60_000,
  });
  if (!show) {
    return (
      <Link component="button" type="button" underline="hover" onClick={() => setShow(true)} sx={{ fontSize: 13, mt: 0.75 }}>
        Show similar products
      </Link>
    );
  }
  if (isFetching && !data) return <LinearProgress sx={{ mt: 1, maxWidth: 240 }} />;
  if (!data?.length) return <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>No similar products found.</Typography>;
  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="caption" color="text.secondary">Similar products</Typography>
      <Table size="small" aria-label="Similar products" sx={{ width: 'auto', '& th, & td': { whiteSpace: 'nowrap' } }}>
        <TableHead>
          <TableRow>
            <TableCell>Product</TableCell>
            <TableCell align="right">Match</TableCell>
            <TableCell align="right">On shelf</TableCell>
            <TableCell align="right">Retail</TableCell>
            <TableCell align="right">Price</TableCell>
            <TableCell align="right">Sold</TableCell>
            <TableCell align="right">Avg sold</TableCell>
            <TableCell align="right">Days to sell</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((s) => (
            <TableRow key={s.product_id}>
              <TableCell sx={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <ObjectLink type="product" id={s.product_id} label={s.title} />
              </TableCell>
              <TableCell align="right">{s.similarity != null ? `${Math.round(s.similarity * 100)}%` : ''}</TableCell>
              <TableCell align="right">{s.on_shelf}</TableCell>
              <TableCell align="right">{s.retail != null ? formatCurrency(s.retail) : ''}</TableCell>
              <TableCell align="right"><WithPct text={priceRange(s)} pct={s.price_pct_of_retail} /></TableCell>
              <TableCell align="right">{s.sold || ''}</TableCell>
              <TableCell align="right"><WithPct text={s.avg_sold != null ? formatCurrency(s.avg_sold) : ''} pct={s.sold_pct_of_retail} /></TableCell>
              <TableCell align="right">{s.avg_days_to_sell != null ? s.avg_days_to_sell : ''}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/** The bar that appears when something is ticked, plus the dialog and the drawer it drives. */
function BulkBar() {
  const sel = useOptionalSelection();
  const { hasRole } = useAuth();
  const canPrice = hasRole('Manager');
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { job, print, cancel } = usePrintQueue();
  const [pricing, setPricing] = useState(false);
  const [drawer, setDrawer] = useState(false);
  if (!sel) return null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['inventory-search'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory-search-items'] });
    void queryClient.invalidateQueries({ queryKey: ['bulk-price-changes'] });
  };
  const reprintSelection = async () => {
    const items = await labelsForSelection(sel.selection);
    if (!items.length) {
      enqueueSnackbar('Nothing on the shelf is selected.', { variant: 'info' });
      return;
    }
    setDrawer(true);
    void print(`${items.length.toLocaleString()} tag${items.length === 1 ? '' : 's'} from the selection`, items);
  };
  const parts = [
    sel.productIds.size ? `${sel.productIds.size} product${sel.productIds.size === 1 ? '' : 's'}` : '',
    sel.itemIds.size ? `${sel.itemIds.size} item${sel.itemIds.size === 1 ? '' : 's'}` : '',
  ].filter(Boolean);

  // Nothing ticked and nothing printing: the bar is not there at all.
  const showBar = sel.size > 0 || !!job;
  return (
    <>
      {showBar && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5, minHeight: 36 }}>
          {sel.size > 0 && (
            <>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{parts.join(' and ')} selected</Typography>
              {canPrice && <Button size="small" variant="contained" onClick={() => setPricing(true)}>Change price</Button>}
              <Button size="small" variant="outlined" disabled={!!job?.running} onClick={() => void reprintSelection()}>Reprint tags</Button>
              <Button size="small" onClick={sel.clear}>Clear</Button>
            </>
          )}
          <Box sx={{ flex: 1 }} />
          {job && (
            <Button size="small" onClick={() => setDrawer(true)}>
              {job.running ? `Printing ${job.done} of ${job.total}` : `Printed ${job.done} of ${job.total}`}
            </Button>
          )}
        </Stack>
      )}
      {canPrice && !showBar && (
        <Link component="button" type="button" underline="hover" onClick={() => setDrawer(true)} sx={{ fontSize: 12, float: 'right', color: 'text.secondary' }}>
          Price changes
        </Link>
      )}
      {pricing && (
        <BulkPriceDialog
          open
          selection={sel.selection}
          onClose={() => setPricing(false)}
          onApplied={(change) => {
            setPricing(false);
            sel.clear();
            refresh();
            setDrawer(true);
            enqueueSnackbar(`${change.item_count.toLocaleString()} price${change.item_count === 1 ? '' : 's'} changed. Reprint the tags from the Bulk work drawer.`, { variant: 'success' });
          }}
        />
      )}
      <BulkDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        job={job}
        onCancelPrint={cancel}
        onPrint={(label, items) => void print(label, items)}
        canPrice={canPrice}
      />
    </>
  );
}

function ResultRow({ row, includeSold, startOpen }: { row: InventorySearchRow; includeSold: boolean; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const { openObject } = useObjectModal();
  const details = [row.brand, row.tag_name, [row.category, row.subcategory].filter(Boolean).join(' › ')].filter(Boolean);
  return (
    <Fragment>
      <TableRow hover onClick={() => setOpen((v) => !v)} sx={{ cursor: 'pointer', '& > td': { borderBottom: open ? 0 : undefined } }}>
        <TableCell padding="checkbox" sx={{ whiteSpace: 'nowrap' }}>
          {row.on_shelf > 0 && <SelectBox kind="product" id={row.product_id} label={`Select every shelf item of ${row.title}`} />}
          <IconButton size="small" aria-label={open ? 'Hide items' : 'Show items'}>
            {open ? <KeyboardArrowDown fontSize="small" /> : <KeyboardArrowRight fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ width: '100%', maxWidth: 0, minWidth: 220 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={`${row.title}
Original title: ${row.original_title}`}>
            {row.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {details.join(' · ')}
            {row.matched_sku && <Chip size="small" color="primary" label={row.matched_sku} sx={{ ml: 1, height: 18 }} />}
          </Typography>
        </TableCell>
        <TableCell align="right" sx={{ fontWeight: 700, color: row.on_shelf ? 'success.main' : 'text.disabled' }}>{row.on_shelf}</TableCell>
        <TableCell align="right">{row.retail != null ? formatCurrency(row.retail) : ''}</TableCell>
        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}><WithPct text={priceRange(row)} pct={row.price_pct_of_retail} /></TableCell>
        <TableCell align="right">{row.sold || ''}</TableCell>
        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
          <WithPct text={row.avg_sold != null ? formatCurrency(row.avg_sold) : ''} pct={row.sold_pct_of_retail} />
        </TableCell>
        <TableCell align="right">{row.avg_days_to_sell != null ? row.avg_days_to_sell : ''}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{shortDate(row.last_sold_at)}</TableCell>
        <TableCell><ObjectLink type="product" id={row.product_id} label={row.product_number || `#${row.product_id}`} /></TableCell>
        <TableCell align="right" padding="checkbox">
          <Tooltip title="Add more of this product">
            <IconButton
              size="small"
              aria-label={`Add items of ${row.title}`}
              onClick={(e) => {
                e.stopPropagation();
                openObject({ type: 'new-checkin', id: row.product_id });
              }}
            >
              <AddBox fontSize="small" />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={11} sx={{ py: 0, bgcolor: 'action.hover', maxWidth: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 1, pl: 5, overflowX: 'auto' }}>
              <ProductItemsTable
                productId={row.product_id}
                includeSold={includeSold}
                highlightSku={row.matched_sku}
                product={{ title: row.tag_name || row.title, brand: row.brand, product_number: row.product_number }}
              />
              <SimilarProducts productId={row.product_id} />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}

/** The header box: ticks every product on this page that has something on the shelf. */
function SelectAll({ rows }: { rows: InventorySearchRow[] }) {
  const sel = useOptionalSelection();
  const ids = rows.filter((r) => r.on_shelf > 0).map((r) => r.product_id);
  if (!sel || !ids.length) return null;
  const picked = ids.filter((id) => sel.productIds.has(id)).length;
  return (
    <Checkbox
      size="small"
      checked={picked === ids.length}
      indeterminate={picked > 0 && picked < ids.length}
      onChange={() => sel.setProducts(ids, picked !== ids.length)}
      inputProps={{ 'aria-label': 'Select every product on this page' }}
      sx={{ p: 0.25 }}
    />
  );
}

/** A header that sorts every match on the server: first click high to low (A to Z for text), then the other way, then off. */
function SortHeader({ label, column, sort, onSort, align, text }: {
  label: string; column: InventorySortKey; sort: string; onSort: (next: string | null) => void; align?: 'right'; text?: boolean;
}) {
  const active = sort.replace(/^-/, '') === column;
  const descending = sort.startsWith('-');
  const first = text ? column : `-${column}`;
  const second = text ? `-${column}` : column;
  const next = !active ? first : sort === first ? second : null;
  return (
    <TableCell align={align} sortDirection={active ? (descending ? 'desc' : 'asc') : false}>
      <TableSortLabel active={active} direction={active && !descending ? 'asc' : 'desc'} onClick={() => onSort(next)}>
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

function SearchBody({ q, sold, page, sort, setParam }: {
  q: string; sold: boolean; page: number; sort: string; setParam: (changes: Record<string, string | null>) => void;
}) {
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text === q) return undefined;
    const timer = window.setTimeout(() => setParam({ q: text || null, page: null }), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text, q, setParam]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['inventory-search', q, sold, page, sort],
    queryFn: async ({ signal }) => (await searchInventory({ q, sold, page, sort }, signal)).data,
    placeholderData: keepPreviousData,
  });
  const rows = data?.results ?? [];
  const onSort = useCallback((next: string | null) => setParam({ sort: next, page: null }), [setParam]);
  const summary = useMemo(() => {
    if (!data) return '';
    const n = `${data.count.toLocaleString()}${data.more ? '+' : ''} product${data.count === 1 ? '' : 's'}`;
    return data.fuzzy ? `Nothing matched exactly. Closest ${n}.` : `${n} · ${data.took_ms} ms`;
  }, [data]);

  return (
    <Box>
      <PageHeader title="Inventory search" dense />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 1 }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Search by name, brand, model, category, UPC, product number, or scan a tag"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam({ q: text || null, page: null });
          }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          inputProps={{ 'aria-label': 'Search inventory' }}
        />
        <FormControlLabel
          sx={{ whiteSpace: 'nowrap', m: 0 }}
          control={<Switch size="small" checked={sold} onChange={(e) => setParam({ sold: e.target.checked ? '1' : null, page: null })} />}
          label="Include sold"
        />
      </Stack>
      <Box sx={{ height: 4, mb: 0.5 }}>{isFetching && <LinearProgress />}</Box>
      <BulkBar />
      <Typography variant="caption" color={isError ? 'error' : 'text.secondary'} sx={{ display: 'block', mb: 0.5 }}>
        {isError ? 'The search failed. Try again.' : summary}
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" stickyHeader aria-label="Inventory search results" sx={{ '& th': { whiteSpace: 'nowrap' }, '& th, & td': { px: 1 } }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ whiteSpace: 'nowrap' }}>
                <SelectAll rows={rows} />
              </TableCell>
              <SortHeader label="Product" column="title" text sort={sort} onSort={onSort} />
              <SortHeader label="Shelf" column="on_shelf" align="right" sort={sort} onSort={onSort} />
              <SortHeader label="Retail" column="retail" align="right" sort={sort} onSort={onSort} />
              <SortHeader label="Price" column="price" align="right" sort={sort} onSort={onSort} />
              <SortHeader label="Sold" column="sold" align="right" sort={sort} onSort={onSort} />
              <SortHeader label="Avg sold" column="avg_sold" align="right" sort={sort} onSort={onSort} />
              <SortHeader label="Days" column="days" align="right" sort={sort} onSort={onSort} />
              <SortHeader label="Last sold" column="last_sold" sort={sort} onSort={onSort} />
              <TableCell>Product #</TableCell>
              <TableCell padding="checkbox" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <ResultRow
                key={row.product_id}
                row={row}
                includeSold={sold}
                startOpen={!!row.matched_sku || rows.length === 1}
              />
            ))}
            {data && !rows.length && (
              <TableRow>
                <TableCell colSpan={11}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    {sold ? 'Nothing found.' : 'Nothing on the shelf matches. Turn on "Include sold" to search everything we have had.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {data && data.count > data.page_size && (
        <TablePagination
          component="div"
          count={data.more ? -1 : data.count}
          page={page - 1}
          rowsPerPage={data.page_size}
          rowsPerPageOptions={[data.page_size]}
          onPageChange={(_e, next) => setParam({ page: next ? String(next + 1) : null })}
        />
      )}
    </Box>
  );
}

export default function InventorySearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sold = params.get('sold') === '1';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const sort = params.get('sort') ?? '';

  const setParam = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(changes).forEach(([key, value]) => {
            if (value == null || value === '') next.delete(key);
            else next.set(key, value);
          });
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const onModalChange = useCallback((ref: ObjectRef | null) => setParam({ open: formatObjectRef(ref) || null }), [setParam]);
  const [initial] = useState(() => parseObjectRef(params.get('open')));

  return (
    <ObjectModalProvider initial={initial} onChange={onModalChange}>
      <SelectionProvider>
        <SearchBody q={q} sold={sold} page={page} sort={sort} setParam={setParam} />
      </SelectionProvider>
    </ObjectModalProvider>
  );
}

/** Old Catalog links (`/inventory/workbench?tab=&q=&selected=`) land on Inventory search with the same thing open. */
export function LegacyWorkbenchRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams();
  const raw = params.get('q') ?? '';
  const selected = parseWorkbenchSelection(params.get('selected'));
  let open = selected ? `${selected.type}:${selected.id}` : '';
  if (raw.includes('{')) {
    const { filters, text } = parseRichSearch(raw);
    if (!open && /^\d+$/.test(filters.checkin ?? '')) open = `checkin:${filters.checkin}`;
    if (!open && /^\d+$/.test(filters.product ?? '')) open = `product:${filters.product}`;
    if (text) next.set('q', text);
  } else if (raw) {
    next.set('q', raw);
  }
  if (open) next.set('open', open);
  if (params.get('tab') === 'items' || open) next.set('sold', '1');
  const qs = next.toString();
  return <Navigate to={qs ? `/inventory/search?${qs}` : '/inventory/search'} replace />;
}
