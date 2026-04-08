import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { isAxiosError } from 'axios';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import CategoryDistributionBar from '../../components/buying/CategoryDistributionBar';
import { PageHeader } from '../../components/common/PageHeader';
import {
  deleteBuyingWatchlist,
  postBuyingUploadManifest,
  postBuyingWatchlist,
} from '../../api/buying.api';
import { useBuyingAuctionDetail } from '../../hooks/useBuyingAuctionDetail';
import { useBuyingAuctionSnapshots } from '../../hooks/useBuyingAuctionSnapshots';
import {
  useBuyingManifestRowsInfinite,
  useBuyingManifestRowsPage,
} from '../../hooks/useBuyingManifestRows';
import type { BuyingManifestRow } from '../../types/buying.types';
import { formatCurrency, formatCurrencyWhole, formatNumber } from '../../utils/format';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatTimeRemaining, timeRemainingSx } from '../../utils/buyingAuctionList';

const MANIFEST_PAGE_SIZE = 50;

function categoryConfidenceChipProps(conf: string | null | undefined): {
  color: 'primary' | 'secondary' | 'warning' | 'default';
  variant: 'filled' | 'outlined';
} {
  if (conf === 'direct') return { color: 'primary', variant: 'filled' };
  if (conf === 'ai_mapped') return { color: 'warning', variant: 'filled' };
  if (conf === 'fast_cat') return { color: 'secondary', variant: 'filled' };
  return { color: 'default', variant: 'outlined' };
}

const manifestColumns: GridColDef<BuyingManifestRow>[] = [
  { field: 'row_number', headerName: '#', width: 70, type: 'number' },
  { field: 'title', headerName: 'Title', flex: 1, minWidth: 160 },
  { field: 'brand', headerName: 'Brand', width: 120 },
  {
    field: 'fast_cat_key',
    headerName: 'Fast key',
    width: 130,
    sortable: false,
    renderCell: (params) => {
      const k = params.row.fast_cat_key;
      if (!k) {
        return (
          <Typography variant="body2" color="text.secondary">
            —
          </Typography>
        );
      }
      const short = k.length > 36 ? `${k.slice(0, 36)}…` : k;
      return (
        <Tooltip title={k}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
            {short}
          </Typography>
        </Tooltip>
      );
    },
  },
  {
    field: 'canonical_category',
    headerName: 'Category',
    flex: 0.9,
    minWidth: 150,
    sortable: false,
    renderCell: (params) => {
      const row = params.row;
      const label = row.canonical_category ?? row.fast_cat_value;
      if (!label) {
        return (
          <Typography variant="body2" color="text.secondary">
            —
          </Typography>
        );
      }
      const chip = categoryConfidenceChipProps(row.category_confidence);
      return (
        <Chip
          size="small"
          label={label}
          color={chip.color}
          variant={chip.variant}
        />
      );
    },
  },
  {
    field: 'quantity',
    headerName: 'Qty',
    width: 80,
    type: 'number',
    valueFormatter: (v) => formatNumber(v as number | null),
  },
  {
    field: 'retail_value',
    headerName: 'Retail',
    width: 110,
    type: 'number',
    valueFormatter: (v) => formatCurrency(v as string | null),
  },
  { field: 'condition', headerName: 'Condition', width: 110 },
  { field: 'upc', headerName: 'UPC', width: 120 },
  { field: 'sku', headerName: 'SKU', width: 120 },
];

function formatEndTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'MMM d, yyyy h:mm a');
  } catch {
    return iso;
  }
}

export default function AuctionDetailPage() {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
  const { id: rawId } = useParams<{ id: string }>();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const auctionId = useMemo(() => {
    const n = Number(rawId);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [rawId]);

  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: MANIFEST_PAGE_SIZE,
  });
  const [manifestSearch, setManifestSearch] = useState('');
  const [debouncedManifestSearch, setDebouncedManifestSearch] = useState('');
  const [manifestCategoryFilter, setManifestCategoryFilter] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedManifestSearch(manifestSearch), 300);
    return () => window.clearTimeout(t);
  }, [manifestSearch]);

  useEffect(() => {
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, [debouncedManifestSearch, manifestCategoryFilter]);

  const manifestFilters = useMemo(
    () => ({
      search: debouncedManifestSearch.trim() || undefined,
      category: manifestCategoryFilter || undefined,
    }),
    [debouncedManifestSearch, manifestCategoryFilter]
  );

  const { data: detail, isLoading: detailLoading, isError: detailError } =
    useBuyingAuctionDetail(auctionId);

  const snapshotsQuery = useBuyingAuctionSnapshots(auctionId);
  const chartAsTable = useMediaQuery(theme.breakpoints.down('sm'));

  const manifestPage = useBuyingManifestRowsPage(
    auctionId,
    paginationModel.page,
    manifestFilters,
    Boolean(isMdUp && auctionId)
  );

  const manifestInfinite = useBuyingManifestRowsInfinite(
    auctionId,
    manifestFilters,
    Boolean(!isMdUp && auctionId)
  );

  const categoryFilterOptions = useMemo(() => {
    const d = detail?.category_distribution;
    if (!d || d.total_rows === 0) return [];
    const opts: { value: string; label: string }[] = d.top.map((t) => ({
      value: t.canonical_category,
      label: t.canonical_category,
    }));
    if (d.not_yet_categorized.count > 0) {
      opts.push({ value: '__uncategorized__', label: 'Not yet categorized' });
    }
    return opts;
  }, [detail]);

  const flatManifestRows = useMemo(() => {
    if (!manifestInfinite.data?.pages?.length) return [];
    return manifestInfinite.data.pages.flatMap((p) => p.results);
  }, [manifestInfinite.data]);

  const invalidateAuctionAndManifest = () => {
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', auctionId, 'manifest_rows'] });
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
  };

  const invalidateAuctionSnapshots = () => {
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', auctionId, 'snapshots'] });
  };

  const addWatchlist = useMutation({
    mutationFn: () => postBuyingWatchlist(auctionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', auctionId, 'snapshots'] });
    },
    onError: () => {
      enqueueSnackbar('Could not add to watchlist.', { variant: 'error' });
    },
  });

  const removeWatchlist = useMutation({
    mutationFn: () => deleteBuyingWatchlist(auctionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', auctionId, 'snapshots'] });
    },
    onError: () => {
      enqueueSnackbar('Could not remove from watchlist.', { variant: 'error' });
    },
  });

  const manifestFileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => postBuyingUploadManifest(auctionId!, file),
    onSuccess: async (data) => {
      invalidateAuctionAndManifest();
      await queryClient.refetchQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
      await queryClient.refetchQueries({
        queryKey: ['buying', 'auctions', auctionId, 'manifest_rows'],
      });
      enqueueSnackbar(
        `Saved ${data.rows_created} row(s). ${data.rows_with_fast_cat_value} with fast category mapping.`,
        { variant: 'success' }
      );
    },
    onError: (err: unknown) => {
      if (isAxiosError(err)) {
        const data = err.response?.data as { detail?: string } | undefined;
        const msg = typeof data?.detail === 'string' ? data.detail : 'Could not upload manifest.';
        enqueueSnackbar(msg, { variant: 'error' });
        return;
      }
      enqueueSnackbar('Could not upload manifest.', { variant: 'error' });
    },
  });

  const watchlistBusy = addWatchlist.isPending || removeWatchlist.isPending;

  const snapshotRows = snapshotsQuery.data?.results ?? [];
  const chartSeries = useMemo(() => {
    return [...snapshotRows].reverse().map((s) => ({
      t: s.captured_at,
      price: s.price != null ? Number.parseFloat(s.price) : Number.NaN,
      bids: s.bid_count,
    }));
  }, [snapshotRows]);

  const onToggleWatchlist = () => {
    if (!detail || !auctionId) return;
    if (detail.watchlist_entry) {
      removeWatchlist.mutate();
    } else {
      addWatchlist.mutate();
    }
  };

  if (auctionId == null) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">Invalid auction id.</Typography>
        <Button component={RouterLink} to="/buying/auctions" sx={{ mt: 2 }}>
          Back to auctions
        </Button>
      </Box>
    );
  }

  if (detailLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (detailError || !detail) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">Could not load this auction.</Typography>
        <Button component={RouterLink} to="/buying/auctions" sx={{ mt: 2 }}>
          Back to auctions
        </Button>
      </Box>
    );
  }

  const watched = Boolean(detail.watchlist_entry);
  const hasManifestRows = (detail.manifest_row_count ?? 0) > 0;
  const categorizedRows =
    detail.category_distribution != null
      ? detail.category_distribution.total_rows - detail.category_distribution.not_yet_categorized.count
      : 0;

  const onPickManifestFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && auctionId) uploadMutation.mutate(f);
    e.target.value = '';
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Button
        component={RouterLink}
        to="/buying/auctions"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2 }}
      >
        Auctions
      </Button>

      <PageHeader
        title="Auction"
        subtitle={detail.marketplace?.name}
        action={
          <Tooltip title={watched ? 'Remove from watchlist' : 'Add to watchlist'}>
            <span>
              <IconButton
                aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                color={watched ? 'warning' : 'default'}
                disabled={watchlistBusy}
                onClick={onToggleWatchlist}
                size="large"
              >
                {watchlistBusy ? (
                  <CircularProgress size={24} />
                ) : watched ? (
                  <StarIcon />
                ) : (
                  <StarBorderIcon />
                )}
              </IconButton>
            </span>
          </Tooltip>
        }
      />

      <Grid container spacing={2} sx={{ mb: 2, alignItems: 'stretch' }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ p: 1.5, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.25, lineHeight: 1.35 }}>
              {detail.title}
            </Typography>
            <Grid container spacing={1} columnSpacing={2}>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
                  Marketplace
                </Typography>
                {detail.marketplace?.name ? (
                  <Chip size="small" label={detail.marketplace.name} sx={{ mt: 0.5 }} />
                ) : (
                  <Typography variant="body2" sx={{ mt: 0.25 }}>
                    —
                  </Typography>
                )}
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
                  Status
                </Typography>
                <Chip size="small" label={detail.status} sx={{ mt: 0.5 }} variant="outlined" />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
                  Current price
                </Typography>
                <Typography variant="body2" fontWeight={600} sx={{ mt: 0.25 }}>
                  {formatCurrency(detail.current_price)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
                  Starting price
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>{formatCurrency(detail.starting_price)}</Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
                  Buy now price
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>{formatCurrency(detail.buy_now_price)}</Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
                  Bid count
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>{formatNumber(detail.bid_count)}</Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
                  Condition
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>{detail.condition_summary || '—'}</Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
                  Time remaining
                </Typography>
                <Typography variant="body2" sx={[{ mt: 0.25 }, timeRemainingSx(detail.end_time)]}>
                  {formatTimeRemaining(detail.end_time)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
                  End time
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>{formatEndTime(detail.end_time)}</Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
                  Lot size
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>{formatNumber(detail.lot_size)}</Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
                  Total retail (listing)
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>{formatCurrencyWhole(detail.total_retail_value)}</Typography>
              </Grid>
            </Grid>
            {detail.description ? (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Description
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.25 }}>
                  {detail.description}
                </Typography>
              </Box>
            ) : null}
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            variant="outlined"
            sx={{
              p: 1.5,
              height: '100%',
              borderStyle: 'dashed',
              borderWidth: hasManifestRows ? 1 : 2,
            }}
          >
            <Stack spacing={1.25}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                <Typography variant="subtitle2" component="h2">
                  Manifest
                </Typography>
                <Chip
                  size="small"
                  label={
                    hasManifestRows
                      ? `Has manifest (${formatNumber(detail.manifest_row_count)} rows)`
                      : 'No manifest'
                  }
                  color={hasManifestRows ? 'primary' : 'default'}
                  variant={hasManifestRows ? 'filled' : 'outlined'}
                />
              </Stack>
              {hasManifestRows ? (
                <Typography variant="body2" color="text.secondary">
                  {formatNumber(detail.manifest_row_count ?? 0)} lines · {formatNumber(categorizedRows)} categorized
                </Typography>
              ) : null}
              {hasManifestRows && detail.category_distribution && detail.category_distribution.total_rows > 0 ? (
                <CategoryDistributionBar dist={detail.category_distribution} />
              ) : null}
              <input
                ref={manifestFileInputRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={onPickManifestFile}
              />
              <Box
                onClick={() => manifestFileInputRef.current?.click()}
                onDragOver={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  const f = ev.dataTransfer.files?.[0];
                  if (f && auctionId) uploadMutation.mutate(f);
                }}
                sx={{
                  py: hasManifestRows ? 1 : 2,
                  px: 1,
                  textAlign: 'center',
                  cursor: uploadMutation.isPending ? 'wait' : 'pointer',
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                }}
              >
                {uploadMutation.isPending ? (
                  <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                    <CircularProgress size={22} />
                    <Typography variant="body2">Processing manifest…</Typography>
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {hasManifestRows
                      ? 'Drop CSV to replace manifest or click to browse'
                      : 'Drop manifest CSV here or click to browse'}
                  </Typography>
                )}
              </Box>
              {detail.url ? (
                <Link href={detail.url} target="_blank" rel="noopener noreferrer" variant="body2">
                  Open on B-Stock <OpenInNewIcon sx={{ fontSize: 14, verticalAlign: 'middle', ml: 0.25 }} />
                </Link>
              ) : null}
            </Stack>
          </Card>
        </Grid>
      </Grid>

      <Typography variant="h6" component="h2" sx={{ mt: 2, mb: 1 }}>
        Manifest rows
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }} alignItems={{ sm: 'stretch' }}>
        <TextField
          size="small"
          fullWidth
          label="Search rows"
          placeholder="Title, brand, SKU, UPC, category…"
          value={manifestSearch}
          onChange={(e) => setManifestSearch(e.target.value)}
        />
        <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }}>
          <InputLabel id="manifest-cat-filter">Fast category</InputLabel>
          <Select
            labelId="manifest-cat-filter"
            label="Fast category"
            value={manifestCategoryFilter}
            onChange={(e) => setManifestCategoryFilter(e.target.value)}
          >
            <MenuItem value="">All categories</MenuItem>
            {categoryFilterOptions.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {isMdUp ? (
        <Box sx={{ flex: 1, minHeight: 400 }}>
          <DataGrid
            rows={manifestPage.data?.results ?? []}
            columns={manifestColumns}
            rowCount={manifestPage.data?.count ?? 0}
            loading={manifestPage.isLoading || manifestPage.isFetching}
            pageSizeOptions={[MANIFEST_PAGE_SIZE]}
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            getRowId={(row) => row.id}
            disableRowSelectionOnClick
            density="compact"
            autoHeight
            sx={{
              border: 'none',
              '& .MuiDataGrid-footerContainer': { borderTop: '1px solid', borderColor: 'divider' },
            }}
          />
        </Box>
      ) : (
        <Stack spacing={2}>
          {manifestInfinite.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            flatManifestRows.map((row) => (
              <Card key={row.id} variant="outlined">
                <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    #{row.row_number} · {row.title || '—'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {row.brand || '—'}
                    {row.model ? ` · ${row.model}` : ''}
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
                    {row.canonical_category || row.fast_cat_value ? (
                      <Chip
                        size="small"
                        label={row.canonical_category ?? row.fast_cat_value ?? ''}
                        color={categoryConfidenceChipProps(row.category_confidence).color}
                        variant={categoryConfidenceChipProps(row.category_confidence).variant}
                      />
                    ) : null}
                    <Chip size="small" label={`Qty ${formatNumber(row.quantity)}`} variant="outlined" />
                    <Chip size="small" label={`Retail ${formatCurrency(row.retail_value)}`} variant="outlined" />
                    {row.condition ? (
                      <Chip size="small" label={row.condition} variant="outlined" />
                    ) : null}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    UPC {row.upc || '—'} · SKU {row.sku || '—'}
                  </Typography>
                </CardContent>
              </Card>
            ))
          )}
          {!manifestInfinite.isLoading && flatManifestRows.length === 0 ? (
            <Typography color="text.secondary">No manifest rows yet. Upload a CSV above.</Typography>
          ) : null}
          {manifestInfinite.hasNextPage ? (
            <Button
              variant="outlined"
              fullWidth
              disabled={manifestInfinite.isFetchingNextPage}
              onClick={() => void manifestInfinite.fetchNextPage()}
            >
              {manifestInfinite.isFetchingNextPage ? <CircularProgress size={22} /> : 'Load more'}
            </Button>
          ) : null}
        </Stack>
      )}

      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mt: 4, mb: 2 }}>
        <Typography variant="h6" component="h2">
          Price history
        </Typography>
        {detail.watchlist_entry ? (
          <Typography variant="body2" color="text.secondary">
            {detail.watchlist_entry.last_polled_at
              ? `Last polled ${formatDistanceToNow(parseISO(detail.watchlist_entry.last_polled_at), { addSuffix: true })}`
              : 'Not polled yet'}
          </Typography>
        ) : null}
      </Stack>

      {snapshotsQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : snapshotRows.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          No price history yet. Snapshots are recorded when watchlist polling runs.
        </Typography>
      ) : chartAsTable ? (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {snapshotRows.map((s) => (
            <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="body2">
                {format(parseISO(s.captured_at), 'MMM d, h:mm a')} · {formatCurrency(s.price)} ·{' '}
                {formatNumber(s.bid_count)} bids
              </Typography>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Box sx={{ width: '100%', height: 320, mb: 3 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartSeries} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                tickFormatter={(v) => {
                  try {
                    return format(parseISO(String(v)), 'M/d h:mm');
                  } catch {
                    return '';
                  }
                }}
                minTickGap={24}
              />
              <YAxis yAxisId="left" domain={['auto', 'auto']} tickFormatter={(v) => `$${v}`} />
              <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} allowDecimals={false} />
              <RechartsTooltip
                labelFormatter={(v) => {
                  try {
                    return format(parseISO(String(v)), 'MMM d, yyyy h:mm a');
                  } catch {
                    return String(v);
                  }
                }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="price"
                name="price"
                stroke={theme.palette.primary.main}
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="bids"
                name="bids"
                stroke={theme.palette.secondary.main}
                dot={false}
                strokeWidth={1}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Box>
  );
}
