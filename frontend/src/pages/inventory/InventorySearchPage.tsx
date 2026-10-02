/**
 * Inventory search: one box, one table, one row per product, with its items one click away.
 * Replaces the old Catalog page (`/inventory/workbench`). Search runs on the server
 * (`apps/inventory/services/inventory_search.py`); the page state lives in the URL (`q`, `sold`, `page`, `open`).
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import AddBox from '@mui/icons-material/AddBox';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import Search from '@mui/icons-material/Search';
import {
  Box, Chip, Collapse, FormControlLabel, IconButton, InputAdornment, LinearProgress, Paper, Stack, Switch, Table,
  TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Navigate, useSearchParams } from 'react-router-dom';
import { searchInventory, type InventorySearchRow } from '../../api/inventorySearch.api';
import { PageHeader } from '../../components/common/PageHeader';
import {
  formatObjectRef, ObjectLink, ObjectModalProvider, parseObjectRef, useObjectModal, type ObjectRef,
} from '../../components/objects/ObjectModal';
import { ProductItemsTable } from '../../components/objects/ProductItemsTable';
import { formatCurrency } from '../../utils/format';
import { parseRichSearch, parseWorkbenchSelection } from '../../utils/richInventorySearch';

const DEBOUNCE_MS = 200;

function priceRange(row: InventorySearchRow): string {
  if (row.price_min == null) return '';
  if (row.price_max == null || row.price_max === row.price_min) return formatCurrency(row.price_min);
  return `${formatCurrency(row.price_min)} to ${formatCurrency(row.price_max)}`;
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function ResultRow({ row, includeSold, startOpen }: { row: InventorySearchRow; includeSold: boolean; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const { openObject } = useObjectModal();
  const details = [row.brand, row.tag_name, [row.category, row.subcategory].filter(Boolean).join(' › ')].filter(Boolean);
  return (
    <Fragment>
      <TableRow hover onClick={() => setOpen((v) => !v)} sx={{ cursor: 'pointer', '& > td': { borderBottom: open ? 0 : undefined } }}>
        <TableCell padding="checkbox">
          <IconButton size="small" aria-label={open ? 'Hide items' : 'Show items'}>
            {open ? <KeyboardArrowDown fontSize="small" /> : <KeyboardArrowRight fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ maxWidth: 520 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={row.original_title}>
            {row.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {details.join(' · ')}
            {row.matched_sku && <Chip size="small" color="primary" label={row.matched_sku} sx={{ ml: 1, height: 18 }} />}
          </Typography>
        </TableCell>
        <TableCell align="right" sx={{ fontWeight: 700, color: row.on_shelf ? 'success.main' : 'text.disabled' }}>{row.on_shelf}</TableCell>
        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{priceRange(row)}</TableCell>
        <TableCell align="right">{row.sold || ''}</TableCell>
        <TableCell align="right">{row.avg_sold != null ? formatCurrency(row.avg_sold) : ''}</TableCell>
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
        <TableCell colSpan={10} sx={{ py: 0, bgcolor: 'action.hover', maxWidth: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 1, pl: 5, overflowX: 'auto' }}>
              <ProductItemsTable
                productId={row.product_id}
                includeSold={includeSold}
                highlightSku={row.matched_sku}
                product={{ title: row.tag_name || row.title, brand: row.brand, product_number: row.product_number }}
              />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}

function SearchBody({ q, sold, page, setParam }: {
  q: string; sold: boolean; page: number; setParam: (changes: Record<string, string | null>) => void;
}) {
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text === q) return undefined;
    const timer = window.setTimeout(() => setParam({ q: text || null, page: null }), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text, q, setParam]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['inventory-search', q, sold, page],
    queryFn: async ({ signal }) => (await searchInventory({ q, sold, page }, signal)).data,
    placeholderData: keepPreviousData,
  });
  const rows = data?.results ?? [];
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
      <Typography variant="caption" color={isError ? 'error' : 'text.secondary'} sx={{ display: 'block', mb: 0.5 }}>
        {isError ? 'The search failed. Try again.' : summary}
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" stickyHeader aria-label="Inventory search results" sx={{ '& th': { whiteSpace: 'nowrap' } }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Product</TableCell>
              <TableCell align="right">On shelf</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell align="right">Sold</TableCell>
              <TableCell align="right">Avg sold</TableCell>
              <TableCell align="right">Days to sell</TableCell>
              <TableCell>Last sold</TableCell>
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
                <TableCell colSpan={10}>
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
      <SearchBody q={q} sold={sold} page={page} setParam={setParam} />
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
