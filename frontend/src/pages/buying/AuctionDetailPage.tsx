import { useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Link,
  Paper,
  Stack,
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
import { PageHeader } from '../../components/common/PageHeader';
import {
  deleteBuyingWatchlist,
  postBuyingPoll,
  postBuyingPullManifest,
  postBuyingWatchlist,
} from '../../api/buying.api';
import { useBuyingAuctionDetail } from '../../hooks/useBuyingAuctionDetail';
import { useBuyingAuctionSnapshots } from '../../hooks/useBuyingAuctionSnapshots';
import {
  useBuyingManifestRowsInfinite,
  useBuyingManifestRowsPage,
} from '../../hooks/useBuyingManifestRows';
import type { BuyingCategoryDistribution, BuyingManifestRow } from '../../types/buying.types';
import { formatCurrency, formatNumber } from '../../utils/format';
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
  color: 'primary' | 'warning' | 'default';
  variant: 'filled' | 'outlined';
} {
  if (conf === 'direct') return { color: 'primary', variant: 'filled' };
  if (conf === 'ai_mapped') return { color: 'warning', variant: 'filled' };
  return { color: 'default', variant: 'outlined' };
}

function CategoryDistributionBar({ dist }: { dist: BuyingCategoryDistribution }) {
  const theme = useTheme();
  if (!dist || dist.total_rows === 0) return null;

  const barColors = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.info.main,
  ];

  type Seg = { label: string; pct: number; color: string };
  const segments: Seg[] = [];
  dist.top.forEach((t, i) => {
    segments.push({
      label: t.canonical_category,
      pct: t.pct,
      color: barColors[i % barColors.length],
    });
  });
  if (dist.other && dist.other.pct > 0) {
    segments.push({
      label: 'Other',
      pct: dist.other.pct,
      color: theme.palette.grey[400],
    });
  }
  if (dist.not_yet_categorized.pct > 0) {
    segments.push({
      label: 'Not yet categorized',
      pct: dist.not_yet_categorized.pct,
      color: theme.palette.action.disabledBackground,
    });
  }

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
        Category mix (manifest lines)
      </Typography>
      <Box
        sx={{
          display: 'flex',
          height: 12,
          borderRadius: 1,
          overflow: 'hidden',
          border: 1,
          borderColor: 'divider',
        }}
      >
        {segments.map((s, i) => (
          <Tooltip key={i} title={`${s.label}: ${s.pct}%`} placement="top">
            <Box
              sx={{
                flexGrow: s.pct,
                flexShrink: 1,
                flexBasis: 0,
                minWidth: s.pct > 0 ? 4 : 0,
                bgcolor: s.color,
              }}
            />
          </Tooltip>
        ))}
      </Box>
      <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mt: 1 }} useFlexGap>
        {dist.top.map((t) => (
          <Typography key={t.canonical_category} variant="caption" color="text.secondary">
            {t.canonical_category}: {t.pct}%
          </Typography>
        ))}
        {dist.other ? (
          <Typography variant="caption" color="text.secondary">
            Other: {dist.other.pct}%
          </Typography>
        ) : null}
        {dist.not_yet_categorized.count > 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.85 }}>
            Not yet categorized: {dist.not_yet_categorized.pct}%
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

const manifestColumns: GridColDef<BuyingManifestRow>[] = [
  { field: 'row_number', headerName: '#', width: 70, type: 'number' },
  { field: 'title', headerName: 'Title', flex: 1, minWidth: 160 },
  { field: 'brand', headerName: 'Brand', width: 120 },
  {
    field: 'canonical_category',
    headerName: 'Category',
    flex: 0.9,
    minWidth: 150,
    sortable: false,
    renderCell: (params) => {
      const row = params.row;
      if (!row.canonical_category) {
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
          label={row.canonical_category}
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
  const [pullTokenCode, setPullTokenCode] = useState<string | null>(null);
  const [pollTokenCode, setPollTokenCode] = useState<string | null>(null);

  const { data: detail, isLoading: detailLoading, isError: detailError } =
    useBuyingAuctionDetail(auctionId);

  const snapshotsQuery = useBuyingAuctionSnapshots(auctionId);
  const chartAsTable = useMediaQuery(theme.breakpoints.down('sm'));

  const manifestPage = useBuyingManifestRowsPage(
    auctionId,
    paginationModel.page,
    Boolean(isMdUp && auctionId)
  );

  const manifestInfinite = useBuyingManifestRowsInfinite(auctionId, Boolean(!isMdUp && auctionId));

  const flatManifestRows = useMemo(() => {
    if (!manifestInfinite.data?.pages?.length) return [];
    return manifestInfinite.data.pages.flatMap((p) => p.results);
  }, [manifestInfinite.data]);

  const invalidateAuctionAndManifest = () => {
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', auctionId, 'manifest_rows'] });
  };

  const invalidateAuctionSnapshots = () => {
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', auctionId, 'snapshots'] });
  };

  const pullMutation = useMutation({
    mutationFn: () => postBuyingPullManifest(auctionId!),
    onMutate: () => {
      setPullTokenCode(null);
    },
    onSuccess: (data) => {
      invalidateAuctionAndManifest();
      enqueueSnackbar(
        data.manifest_rows_saved > 0
          ? `Saved ${data.manifest_rows_saved} manifest row(s).`
          : 'Manifest pull completed.',
        { variant: 'success' }
      );
    },
    onError: (err: unknown) => {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data as { code?: string; detail?: string } | undefined;
        if (status === 401 && data?.code) {
          setPullTokenCode(data.code);
          return;
        }
        const msg =
          typeof data?.detail === 'string'
            ? data.detail
            : err.message || 'Could not pull manifest.';
        enqueueSnackbar(msg, { variant: 'error' });
        return;
      }
      enqueueSnackbar('Could not pull manifest.', { variant: 'error' });
    },
  });

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

  const pollMutation = useMutation({
    mutationFn: () => postBuyingPoll(auctionId!),
    onMutate: () => setPollTokenCode(null),
    onSuccess: () => {
      invalidateAuctionSnapshots();
      enqueueSnackbar('Poll completed. Price history updated.', { variant: 'success' });
    },
    onError: (err: unknown) => {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data as { code?: string; detail?: string } | undefined;
        if (status === 401 && data?.code) {
          setPollTokenCode(data.code);
          return;
        }
        const msg =
          typeof data?.detail === 'string'
            ? data.detail
            : err.message || 'Could not poll auction.';
        enqueueSnackbar(msg, { variant: 'error' });
        return;
      }
      enqueueSnackbar('Could not poll auction.', { variant: 'error' });
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
  const canPullManifest = (detail.manifest_row_count ?? 0) === 0;
  const hasLotId = Boolean((detail.lot_id ?? '').trim());

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
        title={detail.title}
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

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Current price
            </Typography>
            <Typography variant="body1" fontWeight={600}>
              {formatCurrency(detail.current_price)}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Total retail
            </Typography>
            <Typography variant="body1">{formatCurrency(detail.total_retail_value)}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Bids
            </Typography>
            <Typography variant="body1">{formatNumber(detail.bid_count)}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Time remaining
            </Typography>
            <Typography variant="body1" sx={timeRemainingSx(detail.end_time)}>
              {formatTimeRemaining(detail.end_time)}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Ends
            </Typography>
            <Typography variant="body1">{formatEndTime(detail.end_time)}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Condition
            </Typography>
            <Typography variant="body1">{detail.condition_summary || '—'}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Status
            </Typography>
            <Typography variant="body1">{detail.status}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Listing type
            </Typography>
            <Typography variant="body1">{detail.listing_type || '—'}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Starting / Buy now
            </Typography>
            <Typography variant="body1">
              {formatCurrency(detail.starting_price)} / {formatCurrency(detail.buy_now_price)}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Lot ID
            </Typography>
            <Typography variant="body1" sx={{ wordBreak: 'break-all' }}>
              {detail.lot_id || '—'}
            </Typography>
          </Grid>
          <Grid size={12}>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
              {detail.marketplace?.name && (
                <Chip size="small" label={detail.marketplace.name} variant="outlined" />
              )}
              <Chip
                size="small"
                label={detail.has_manifest ? 'Has manifest' : 'No manifest'}
                color={detail.has_manifest ? 'primary' : 'default'}
                variant={detail.has_manifest ? 'filled' : 'outlined'}
              />
              {detail.url ? (
                <Link href={detail.url} target="_blank" rel="noopener noreferrer" variant="body2">
                  Open on B-Stock <OpenInNewIcon sx={{ fontSize: 14, verticalAlign: 'middle', ml: 0.25 }} />
                </Link>
              ) : null}
            </Stack>
          </Grid>
          {detail.description ? (
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary">
                Description
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {detail.description}
              </Typography>
            </Grid>
          ) : null}
        </Grid>
      </Paper>

      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: 2 }}>
        <Typography variant="h6" component="h2">
          Manifest
          {detail.manifest_row_count != null ? (
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              ({formatNumber(detail.manifest_row_count)} lines)
            </Typography>
          ) : null}
        </Typography>
        {canPullManifest ? (
          <Tooltip
            title={
              !hasLotId
                ? 'Cannot pull: this auction has no lotId in the database. Run a sweep or verify the listing.'
                : ''
            }
          >
            <span>
              <Button
                variant="contained"
                disabled={!hasLotId || pullMutation.isPending}
                onClick={() => pullMutation.mutate()}
              >
                {pullMutation.isPending ? <CircularProgress size={22} color="inherit" /> : 'Pull manifest'}
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </Stack>

      {pullTokenCode === 'bstock_token_missing' ? (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setPullTokenCode(null)}>
          No B-Stock JWT on the server. Configure <code>bstock_token</code> in <code>.env</code>, run{' '}
          <code>python manage.py bstock_token</code>, or use the bookmarklet workflow (see{' '}
          <code>apps/buying/bookmarklet/bstock_elt_bookmarklet.md</code> in the repo).
        </Alert>
      ) : null}
      {pullTokenCode === 'bstock_token_expired' ? (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setPullTokenCode(null)}>
          B-Stock token expired. Refresh it via the bookmarklet or CLI, then try again.
        </Alert>
      ) : null}

      {detail?.category_distribution && detail.category_distribution.total_rows > 0 ? (
        <CategoryDistributionBar dist={detail.category_distribution} />
      ) : null}

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
                    {row.canonical_category ? (
                      <Chip
                        size="small"
                        label={row.canonical_category}
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
            <Typography color="text.secondary">No manifest rows yet. Pull the manifest if available.</Typography>
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
          <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
            <Typography variant="body2" color="text.secondary">
              {detail.watchlist_entry.last_polled_at
                ? `Last polled ${formatDistanceToNow(parseISO(detail.watchlist_entry.last_polled_at), { addSuffix: true })}`
                : 'Not polled yet'}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              disabled={pollMutation.isPending}
              onClick={() => pollMutation.mutate()}
            >
              {pollMutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'Poll now'}
            </Button>
          </Stack>
        ) : null}
      </Stack>

      {pollTokenCode === 'bstock_token_missing' ? (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setPollTokenCode(null)}>
          No B-Stock JWT on the server. Configure <code>bstock_token</code> in <code>.env</code>, run{' '}
          <code>python manage.py bstock_token</code>, or use the bookmarklet workflow (see{' '}
          <code>apps/buying/bookmarklet/bstock_elt_bookmarklet.md</code> in the repo).
        </Alert>
      ) : null}
      {pollTokenCode === 'bstock_token_expired' ? (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setPollTokenCode(null)}>
          B-Stock token expired. Refresh it via the bookmarklet or CLI, then try again.
        </Alert>
      ) : null}

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
