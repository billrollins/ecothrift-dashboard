import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Download from '@mui/icons-material/Download';
import Search from '@mui/icons-material/Search';
import Undo from '@mui/icons-material/Undo';
import {
  DataGrid,
  type GridColDef,
  type GridRowSelectionModel,
  type GridSortModel,
} from '@mui/x-data-grid';
import {
  apiMessage,
  downloadShrinkCsv,
  getShrinkGroups,
  getShrinkList,
  markShrink,
  unmarkShrink,
  type ShrinkFilter,
  type ShrinkGroup,
  type ShrinkGroupBy,
  type ShrinkList,
  type ShrinkOutcome,
  type ShrinkRow,
} from '../../../api/stocktake.api';

/** The marks, in the order the owner thinks of them; colour = how it reads in the totals. */
const OUTCOMES: { key: ShrinkOutcome; label: string; short: string; color: 'info' | 'secondary' | 'success' | 'primary' | 'error' | 'warning' }[] = [
  { key: 'back_stock', label: 'Back stock', short: 'Back stock', color: 'info' },
  { key: 'owner_took', label: 'Owner took', short: 'Owner took', color: 'secondary' },
  { key: 'sold_generic', label: 'Sold as generic', short: 'Sold generic', color: 'success' },
  // Not true shrink; no price asked, and it counts as no sale (owner, 2026-10-06).
  { key: 'sold_online', label: 'Sold online', short: 'Sold online', color: 'primary' },
  { key: 'stolen', label: 'Shrink: stolen', short: 'Stolen', color: 'error' },
  { key: 'broken', label: 'Shrink: broken', short: 'Broken', color: 'warning' },
  { key: 'scrap', label: 'Shrink: scrap', short: 'Scrap', color: 'warning' },
];
const OUTCOME = Object.fromEntries(OUTCOMES.map((o) => [o.key, o])) as Record<ShrinkOutcome, (typeof OUTCOMES)[number]>;

type View = 'items' | ShrinkGroupBy;
const VIEWS: { key: View; label: string }[] = [
  { key: 'items', label: 'Items' },
  { key: 'order', label: 'By order' },
  { key: 'product', label: 'By product' },
  { key: 'vendor', label: 'By vendor' },
  { key: 'category', label: 'By category' },
];

const money = (v: string | number | null | undefined) =>
  v == null || v === '' ? '-' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const money2 = (v: string | null | undefined) => (v == null || v === '' ? '-' : `$${Number(v).toFixed(2)}`);
const ageWords = (iso: string | null) => {
  if (!iso) return '-';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 14) return `${days} d`;
  if (days < 120) return `${Math.round(days / 7)} wk`;
  return `${Math.round(days / 30)} mo`;
};
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }) : 'never');

function Total({ label, n, price, active, onClick, color }: { label: string; n: number; price: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{ p: 1.25, cursor: 'pointer', borderColor: active ? 'primary.main' : 'divider', borderWidth: active ? 2 : 1, minWidth: 0 }}
    >
      <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: color ?? 'text.secondary' }} noWrap>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>{n.toLocaleString()}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{money(price)} at price</Typography>
    </Paper>
  );
}

/** Pick an outcome (and a note), then apply it to what the caller says. */
function MarkBar({ label, disabled, onMark }: { label: string; disabled?: boolean; onMark: (o: ShrinkOutcome, note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} useFlexGap flexWrap="wrap">
      <Typography sx={{ fontWeight: 700, fontSize: 14, mr: 0.5 }}>{label}</Typography>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {OUTCOMES.map((o) => (
          <Button key={o.key} size="small" variant="outlined" color={o.color} disabled={disabled} onClick={() => onMark(o.key, note)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            {o.short}
          </Button>
        ))}
      </Stack>
      <TextField size="small" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" sx={{ minWidth: 200 }} inputProps={{ maxLength: 300 }} />
    </Stack>
  );
}

/**
 * Not found (inventory_effort Phase 3, owner 2026-10-06): everything the inventory expected and did not find, and
 * what each one really is. Sort, filter and search; mark one, a selection, everything in a filter, or a whole order,
 * product, vendor or category as back stock, owner took, sold as generic, or shrink. Every mark can be undone.
 * Items change only when the inventory is closed.
 */
/** The Shrinkage tab: what the inventory expected and did not find. Each one is a shrink estimate, "Shrink (general)"
 * until the owner estimates it as something else. Estimates only: nothing changes on the item (owner, 2026-10-06). */
export default function ShrinkPage({ countId }: { countId: number }) {
  const [params, setParams] = useSearchParams();
  const view: View = (VIEWS.find((v) => v.key === params.get('view'))?.key ?? 'items') as View;
  const [filter, setFilter] = useState<ShrinkFilter>({ outcome: 'open' });
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<GridSortModel>([{ field: 'price', sort: 'desc' }]);
  const [paging, setPaging] = useState({ page: 0, pageSize: 50 });
  const [data, setData] = useState<ShrinkList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [notice, setNotice] = useState<{ text: string; batch?: string } | null>(null);
  const [groups, setGroups] = useState<Record<string, ShrinkGroup[]>>({});
  const [vendors, setVendors] = useState<ShrinkGroup[]>([]);
  const [categories, setCategories] = useState<ShrinkGroup[]>([]);
  const [labels, setLabels] = useState<{ order?: string; product?: string }>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const setView = (next: View) => {
    const p = new URLSearchParams(params);
    if (next === 'items') p.delete('view');
    else p.set('view', next);
    setParams(p, { replace: true });
  };

  useEffect(() => {
    const t = window.setTimeout(() => setFilter((f) => ({ ...f, q: q.trim() || undefined })), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => setPaging((p) => ({ ...p, page: 0 })), [filter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = sort[0];
      const res = await getShrinkList(countId, {
        ...filter,
        sort: s ? `${s.sort === 'desc' ? '-' : ''}${s.field === 'checked_in' ? 'checked_in' : s.field}` : '-price',
        page: paging.page + 1,
        page_size: paging.pageSize,
      });
      setData(res);
    } catch (e) {
      setError(apiMessage(e, 'Could not load the list. Check the connection.'));
    } finally {
      setLoading(false);
    }
  }, [countId, filter, sort, paging]);
  useEffect(() => void load(), [load, refreshKey]);

  useEffect(() => {
    getShrinkGroups(countId, 'vendor').then(setVendors).catch(() => setVendors([]));
    getShrinkGroups(countId, 'category').then(setCategories).catch(() => setCategories([]));
  }, [countId, refreshKey]);
  useEffect(() => {
    if (view === 'items') return;
    getShrinkGroups(countId, view)
      .then((g) => setGroups((all) => ({ ...all, [view]: g })))
      .catch(() => setError('Could not load the groups.'));
  }, [countId, view, refreshKey]);

  const done = (text: string, batch?: string) => {
    setNotice({ text, batch });
    setSelected([]);
    setRefreshKey((k) => k + 1);
  };
  const mark = async (body: Parameters<typeof markShrink>[1], what: string) => {
    try {
      const res = await markShrink(countId, body);
      done(`${res.marked.toLocaleString()} ${what} marked ${OUTCOME[body.outcome].label}.`, res.batch);
    } catch (e) {
      setError(apiMessage(e, 'Could not save the marks.'));
    }
  };
  const undoBatch = async (batch: string) => {
    try {
      const res = await unmarkShrink(countId, { batch });
      done(`Undone: ${res.unmarked.toLocaleString()} back to open.`);
    } catch (e) {
      setError(apiMessage(e, 'Could not undo.'));
    }
  };
  const undoOne = async (row: ShrinkRow) => {
    try {
      await unmarkShrink(countId, { item_ids: [row.id] });
      done(`${row.sku} is open again.`);
    } catch (e) {
      setError(apiMessage(e, 'Could not undo.'));
    }
  };

  const openGroup = (by: ShrinkGroupBy, g: ShrinkGroup) => {
    const key = g.key === '' ? '__none__' : String(g.key);
    setFilter({ outcome: 'open', [by]: by === 'product' ? Number(g.key) : key } as ShrinkFilter);
    setLabels(by === 'order' ? { order: g.label } : by === 'product' ? { product: g.label } : {});
    setQ('');
    setView('items');
  };

  const t = data?.totals;
  const shrinkTotal = t
    ? (['stolen', 'broken', 'scrap'] as ShrinkOutcome[]).reduce(
        (acc, k) => ({ n: acc.n + t[k].n, price: String(Number(acc.price) + Number(t[k].price)) }),
        { n: 0, price: '0' },
      )
    : { n: 0, price: '0' };
  const allMissing = t ? Object.values(t).reduce((n, v) => n + v.n, 0) : 0;

  const columns: GridColDef<ShrinkRow>[] = useMemo(
    () => [
      { field: 'sku', headerName: 'SKU', width: 118, renderCell: (p) => <Box sx={{ fontFamily: 'monospace', fontSize: 13 }}>{p.row.sku}</Box> },
      {
        field: 'title',
        headerName: 'Item',
        flex: 1,
        minWidth: 220,
        renderCell: (p) => (
          <Box sx={{ minWidth: 0, lineHeight: 1.25 }}>
            <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }} title={p.row.title}>
              {p.row.title}
            </Typography>
            <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
              {[p.row.category, p.row.subcategory].filter(Boolean).join(' › ') || 'No category'}
            </Typography>
          </Box>
        ),
      },
      { field: 'order', headerName: 'Order', width: 150, renderCell: (p) => <Typography noWrap sx={{ fontSize: 12, fontFamily: 'monospace' }}>{p.row.order || 'No order'}</Typography> },
      { field: 'vendor', headerName: 'Vendor', width: 82 },
      { field: 'category', headerName: 'Category', width: 150 },
      { field: 'price', headerName: 'Price', width: 88, type: 'number', renderCell: (p) => money2(p.row.price) },
      { field: 'retail', headerName: 'Retail', width: 88, type: 'number', renderCell: (p) => money2(p.row.retail) },
      { field: 'checked_in', headerName: 'On shelf', width: 86, description: 'Time since check-in', renderCell: (p) => ageWords(p.row.checked_in) },
      { field: 'last_seen', headerName: 'Last counted', width: 104, sortable: false, description: 'Last time an earlier inventory counted it', renderCell: (p) => shortDate(p.row.last_seen) },
      {
        field: 'outcome',
        headerName: 'Marked',
        width: 150,
        renderCell: (p) =>
          p.row.outcome ? (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Tooltip title={p.row.note || ''}>
                <Chip size="small" color={OUTCOME[p.row.outcome].color} label={OUTCOME[p.row.outcome].short} />
              </Tooltip>
              <Tooltip title="Undo this mark">
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); void undoOne(p.row); }} aria-label={`Undo ${p.row.sku}`}>
                  <Undo fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Shrink (general)</Typography>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countId],
  );

  const groupColumns = (by: ShrinkGroupBy): GridColDef<ShrinkGroup>[] => [
    {
      field: 'label',
      headerName: { order: 'Order', product: 'Product', vendor: 'Vendor', category: 'Category' }[by],
      flex: 1,
      minWidth: 220,
      renderCell: (p) => (
        <Button size="small" onClick={() => openGroup(by, p.row)} sx={{ textTransform: 'none', fontWeight: 700, justifyContent: 'flex-start', minWidth: 0 }}>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.row.label}</Box>
        </Button>
      ),
    },
    { field: 'missing', headerName: 'Not found', width: 100, type: 'number' },
    { field: 'expected', headerName: 'Expected', width: 96, type: 'number' },
    { field: 'missing_pct', headerName: '% not found', width: 110, type: 'number', renderCell: (p) => `${p.row.missing_pct}%` },
    { field: 'price', headerName: '$ price', width: 100, type: 'number', valueGetter: (_v, r) => Number(r.price), renderCell: (p) => money(p.row.price) },
    { field: 'retail', headerName: '$ retail', width: 100, type: 'number', valueGetter: (_v, r) => Number(r.retail), renderCell: (p) => money(p.row.retail) },
    { field: 'open', headerName: 'Not estimated', width: 110, type: 'number' },
    {
      field: 'outcomes',
      headerName: 'Marked',
      width: 220,
      sortable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {Object.entries(p.row.outcomes).map(([k, n]) => (
            <Chip key={k} size="small" color={OUTCOME[k as ShrinkOutcome].color} variant="outlined" label={`${OUTCOME[k as ShrinkOutcome].short} ${n}`} />
          ))}
        </Stack>
      ),
    },
    {
      field: 'mark',
      headerName: 'Mark the open ones',
      width: 190,
      sortable: false,
      renderCell: (p) =>
        p.row.open > 0 ? (
          <TextField
            select
            size="small"
            value=""
            label={`Mark ${p.row.open} as…`}
            onChange={(e) => {
              const o = e.target.value as ShrinkOutcome;
              if (window.confirm(`Mark the ${p.row.open} open items of "${p.row.label}" as ${OUTCOME[o].label}?`)) {
                void mark({ outcome: o, group: { by, key: p.row.key } }, `items of ${p.row.label}`);
              }
            }}
            sx={{ width: 170 }}
          >
            {OUTCOMES.map((o) => (
              <MenuItem key={o.key} value={o.key}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        ) : null,
    },
  ];

  const filterChips: { label: string; clear: () => void }[] = [];
  if (filter.order !== undefined) filterChips.push({ label: `Order ${labels.order || filter.order || 'none'}`, clear: () => setFilter((f) => ({ ...f, order: undefined })) });
  if (filter.product !== undefined) filterChips.push({ label: `Product: ${labels.product || filter.product}`, clear: () => setFilter((f) => ({ ...f, product: undefined })) });

  const selection: GridRowSelectionModel = { type: 'include', ids: new Set(selected) };
  const openFilter = (filter.outcome ?? 'open') === 'open';

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-end' }} gap={1} sx={{ mb: 1.5 }}>
        <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
          {allMissing.toLocaleString()} items expected and not found. Each is a shrink estimate: &quot;Shrink (general)&quot; until you
          estimate it as back stock, owner took, sold as generic, sold online, stolen, broken or scrap. Estimates only: nothing changes
          on the item, and nothing counts as a sale.
        </Typography>
        <Button startIcon={<Download />} variant="outlined" onClick={() => void downloadShrinkCsv(countId, filter).catch(() => setError('Could not download the CSV.'))} sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}>
          CSV of this list
        </Button>
      </Stack>

      {t && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', sm: 'repeat(3, minmax(0,1fr))', md: 'repeat(6, minmax(0,1fr))' }, gap: 1, mb: 1.5 }}>
          <Total label="Shrink (general)" n={t.open.n} price={t.open.price} active={filter.outcome === 'open'} onClick={() => setFilter((f) => ({ ...f, outcome: 'open' }))} />
          <Total label="Back stock" n={t.back_stock.n} price={t.back_stock.price} active={filter.outcome === 'back_stock'} onClick={() => setFilter((f) => ({ ...f, outcome: 'back_stock' }))} color="info.main" />
          <Total label="Owner took" n={t.owner_took.n} price={t.owner_took.price} active={filter.outcome === 'owner_took'} onClick={() => setFilter((f) => ({ ...f, outcome: 'owner_took' }))} color="secondary.main" />
          <Total label="Sold as generic" n={t.sold_generic.n} price={t.sold_generic.price} active={filter.outcome === 'sold_generic'} onClick={() => setFilter((f) => ({ ...f, outcome: 'sold_generic' }))} color="success.main" />
          <Total label="Sold online" n={t.sold_online.n} price={t.sold_online.price} active={filter.outcome === 'sold_online'} onClick={() => setFilter((f) => ({ ...f, outcome: 'sold_online' }))} color="primary.main" />
          <Total label="Shrink" n={shrinkTotal.n} price={shrinkTotal.price} active={['stolen', 'broken', 'scrap'].includes(filter.outcome ?? '')} onClick={() => setFilter((f) => ({ ...f, outcome: 'stolen' }))} color="error.main" />
        </Box>
      )}

      {notice && (
        <Alert
          severity="success"
          onClose={() => setNotice(null)}
          sx={{ mb: 1.5 }}
          action={notice.batch ? <Button color="inherit" size="small" onClick={() => void undoBatch(notice.batch!)}>Undo</Button> : undefined}
        >
          {notice.text}
        </Alert>
      )}
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}

      <Tabs value={view} onChange={(_e, v: View) => setView(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        {VIEWS.map((v) => (
          <Tab key={v.key} value={v.key} label={v.label} sx={{ textTransform: 'none', fontWeight: 700 }} />
        ))}
      </Tabs>

      {view === 'items' ? (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1 }} useFlexGap flexWrap="wrap">
            <TextField
              size="small"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search SKU, title or order"
              sx={{ minWidth: 240, flex: 1 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }}
            />
            <TextField select size="small" label="Estimate" value={filter.outcome ?? 'open'} onChange={(e) => setFilter((f) => ({ ...f, outcome: e.target.value }))} sx={{ minWidth: 150 }}>
              <MenuItem value="open">Shrink (general), not estimated</MenuItem>
              <MenuItem value="marked">Estimated</MenuItem>
              <MenuItem value="all">All</MenuItem>
              {OUTCOMES.map((o) => (
                <MenuItem key={o.key} value={o.key}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Vendor" value={filter.vendor ?? ''} onChange={(e) => setFilter((f) => ({ ...f, vendor: e.target.value || undefined }))} sx={{ minWidth: 130 }}>
              <MenuItem value="">All vendors</MenuItem>
              {vendors.map((v) => (
                <MenuItem key={String(v.key)} value={String(v.key)}>
                  {v.label} ({v.missing.toLocaleString()})
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Category" value={filter.category ?? ''} onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value || undefined }))} sx={{ minWidth: 170 }}>
              <MenuItem value="">All categories</MenuItem>
              {categories.map((c) => (
                <MenuItem key={String(c.key)} value={String(c.key)}>
                  {c.label} ({c.missing.toLocaleString()})
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="On shelf" value={filter.age ?? ''} onChange={(e) => setFilter((f) => ({ ...f, age: e.target.value || undefined }))} sx={{ minWidth: 150 }}>
              <MenuItem value="">Any time</MenuItem>
              {data?.ages.map((a) => (
                <MenuItem key={a.key} value={a.key}>
                  {a.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Price" value={filter.price_band ?? ''} onChange={(e) => setFilter((f) => ({ ...f, price_band: e.target.value || undefined }))} sx={{ minWidth: 130 }}>
              <MenuItem value="">Any price</MenuItem>
              {data?.price_bands.map((b) => (
                <MenuItem key={b.key} value={b.key}>
                  {b.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          {filterChips.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              {filterChips.map((c) => (
                <Chip key={c.label} label={c.label} onDelete={c.clear} />
              ))}
            </Stack>
          )}

          <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
            {selected.length > 0 ? (
              <MarkBar label={`Mark ${selected.length} selected as`} onMark={(o, note) => void mark({ outcome: o, note, item_ids: selected }, 'items')} />
            ) : (
              <MarkBar
                label={data ? `Mark all ${data.filtered.n.toLocaleString()} in this list (${money(data.filtered.price)}) as` : 'Mark all in this list as'}
                disabled={!data || !data.filtered.n || !openFilter}
                onMark={(o, note) => {
                  if (!data) return;
                  if (window.confirm(`Mark all ${data.filtered.n.toLocaleString()} items in this list as ${OUTCOME[o].label}?`)) {
                    void mark({ outcome: o, note, filter }, 'items');
                  }
                }}
              />
            )}
            {!openFilter && selected.length === 0 && (
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>Marking a whole list works on open items. Tick rows to change marked ones.</Typography>
            )}
          </Paper>

          <Box sx={{ height: 640, bgcolor: 'background.paper' }}>
            <DataGrid
              rows={data?.rows ?? []}
              columns={columns}
              loading={loading}
              rowCount={data?.filtered.n ?? 0}
              paginationMode="server"
              sortingMode="server"
              paginationModel={paging}
              onPaginationModelChange={setPaging}
              pageSizeOptions={[50, 100, 200]}
              sortModel={sort}
              onSortModelChange={(m) => setSort(m.length ? m : [{ field: 'price', sort: 'desc' }])}
              checkboxSelection
              keepNonExistentRowsSelected
              rowSelectionModel={selection}
              onRowSelectionModelChange={(m) => setSelected(Array.from(m.ids).map(Number))}
              rowHeight={50}
              disableColumnMenu
              localeText={{ noRowsLabel: 'Nothing here. Every item in this list is found or marked.' }}
              sx={{ border: 0 }}
            />
          </Box>
          {data && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}>
              This list: {data.filtered.n.toLocaleString()} items · {money(data.filtered.price)} at price · {money(data.filtered.retail)} retail.
            </Typography>
          )}
        </>
      ) : (
        <>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 1 }}>
            Most items not found first; click any column to sort (% not found shows the skewed ones). Click a name to see its items; a whole group can be marked at once (only its open items).
          </Typography>
          <Box sx={{ height: 680, bgcolor: 'background.paper' }}>
            <DataGrid
              rows={groups[view] ?? []}
              getRowId={(r: ShrinkGroup) => `${view}:${r.key}`}
              columns={groupColumns(view)}
              loading={!groups[view]}
              rowHeight={52}
              disableColumnMenu
              initialState={{ pagination: { paginationModel: { pageSize: 100 } } }}
              pageSizeOptions={[50, 100, 200]}
              sx={{ border: 0 }}
            />
          </Box>
        </>
      )}
    </Box>
  );
}
