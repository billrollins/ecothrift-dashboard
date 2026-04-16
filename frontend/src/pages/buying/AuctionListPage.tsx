import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Link,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Refresh from '@mui/icons-material/Refresh';
import type { GridPaginationModel } from '@mui/x-data-grid';
import { isAxiosError } from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  deleteBuyingAuctionArchive,
  deleteBuyingThumbsUp,
  deleteBuyingWatchlist,
  fetchBuyingWatchlist,
  postBuyingAuctionArchive,
  postBuyingSweep,
  postBuyingThumbsUp,
  postBuyingWatchlist,
} from '../../api/buying.api';
import BuyingFilterChips, { type AuctionFilterChipId } from '../../components/buying/BuyingFilterChips';
import ManifestQueueDialog from '../../components/buying/ManifestQueueDialog';
import BuyingSweepProgressDialog from '../../components/buying/BuyingSweepProgressDialog';
import CategoryNeedPanel from '../../components/buying/CategoryNeedPanel';
import { PageHeader } from '../../components/common/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useBuyingAuctions } from '../../hooks/useBuyingAuctions';
import { useBuyingAuctionsInfinite } from '../../hooks/useBuyingAuctionsInfinite';
import { useBuyingAuctionSummary } from '../../hooks/useBuyingAuctionSummary';
import { useBuyingMarketplaces } from '../../hooks/useBuyingMarketplaces';
import { useBuyingThumbsUpMutation } from '../../hooks/useBuyingThumbsUpMutation';
import { useBuyingWatchlistToggleMutation } from '../../hooks/useBuyingWatchlistToggleMutation';
import { useBuyingWatchlist } from '../../hooks/useBuyingWatchlist';
import { useBuyingWatchlistInfinite } from '../../hooks/useBuyingWatchlistInfinite';
import { useLiveBuyingCountdownTick } from '../../hooks/useLiveBuyingCountdown';
import type {
  BuyingAuctionListItem,
  BuyingAuctionListParams,
  BuyingAuctionSummaryParams,
  BuyingSweepResponse,
  BuyingWatchlistParams,
} from '../../types/buying.types';
import AuctionListDesktop from './AuctionListDesktop';
import AuctionListMobile from './AuctionListMobile';
import AuctionMarketplaceChips from './AuctionMarketplaceChips';
import {
  BUYING_AUCTION_LIST_ORDERING_STORAGE_KEY,
  BUYING_WATCHLIST_ORDERING_STORAGE_KEY,
  DEFAULT_BUYING_LIST_ORDERING,
} from '../../utils/buyingAuctionList';
import {
  patchAllBuyingAuctionLists,
  patchAllBuyingWatchlistLists,
  patchArchiveBulk,
  patchThumbsBulk,
  patchWatchBulk,
  optimisticArchiveRow,
} from '../../utils/buyingOptimisticCache';

/** Stable reference for useBuyingAuctionSummary — inline `{}` is a new object every render and churns the query key. */
const BUYING_SUMMARY_PARAMS_EMPTY: BuyingAuctionSummaryParams = {};
const BUYING_SUMMARY_ARCHIVED: BuyingAuctionSummaryParams = { archived: true };

export default function AuctionListPage() {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('Admin');

  const [ordering, setOrdering] = useState(DEFAULT_BUYING_LIST_ORDERING);
  const [filterChips, setFilterChips] = useState<Set<AuctionFilterChipId>>(() => new Set());

  /** null = marketplaces not loaded yet; then all slugs active. */
  const [activeSlugs, setActiveSlugs] = useState<Set<string> | null>(null);

  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });

  /** Draft vs committed — backend `q` only sends committed (Enter / Search). */
  const [searchDraft, setSearchDraft] = useState('');
  const [searchCommitted, setSearchCommitted] = useState('');

  const [relativeTick, setRelativeTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setRelativeTick((t) => t + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const { data: marketplaces } = useBuyingMarketplaces();

  useEffect(() => {
    if (!marketplaces?.length) return;
    setActiveSlugs((prev) => {
      if (prev !== null) return prev;
      return new Set(marketplaces.map((m) => m.slug));
    });
  }, [marketplaces]);

  const marketplaceParam = useMemo(() => {
    if (!marketplaces?.length || !activeSlugs) return undefined;
    const allActive =
      marketplaces.length === activeSlugs.size &&
      marketplaces.every((m) => activeSlugs.has(m.slug));
    if (allActive) return undefined;
    return [...activeSlugs].sort().join(',');
  }, [marketplaces, activeSlugs]);

  const { data: globalSummary } = useBuyingAuctionSummary(BUYING_SUMMARY_PARAMS_EMPTY);
  const { data: archivedSummary } = useBuyingAuctionSummary(BUYING_SUMMARY_ARCHIVED);

  const archivedCount = useMemo(
    () => archivedSummary?.by_marketplace.reduce((a, m) => a + m.count, 0) ?? 0,
    [archivedSummary]
  );

  const countBySlugMerged = useMemo(() => {
    const map: Record<string, number> = {};
    globalSummary?.by_marketplace.forEach((m) => {
      map[m.slug] = m.count;
    });
    return map;
  }, [globalSummary]);

  const hasManifestFilter = useMemo((): boolean | undefined => {
    if (filterChips.has('manifest')) return true;
    return undefined;
  }, [filterChips]);

  const committedSearchTrimmed = searchCommitted.trim();

  const filtersActive = useMemo(
    () => filterChips.size > 0 || Boolean(marketplaceParam) || Boolean(committedSearchTrimmed),
    [filterChips, marketplaceParam, committedSearchTrimmed]
  );

  const isWatched = filterChips.has('watched');

  useEffect(() => {
    try {
      const k = isWatched ? BUYING_WATCHLIST_ORDERING_STORAGE_KEY : BUYING_AUCTION_LIST_ORDERING_STORAGE_KEY;
      const v = localStorage.getItem(k);
      setOrdering(v ?? DEFAULT_BUYING_LIST_ORDERING);
    } catch {
      setOrdering(DEFAULT_BUYING_LIST_ORDERING);
    }
  }, [isWatched]);

  const listParams = useMemo((): BuyingAuctionListParams => {
    const p: BuyingAuctionListParams = {
      page: paginationModel.page + 1,
      page_size: paginationModel.pageSize,
      ordering,
    };
    if (marketplaceParam) p.marketplace = marketplaceParam;
    if (hasManifestFilter === true) p.has_manifest = true;
    if (filterChips.has('profitable')) p.profitable = true;
    if (filterChips.has('needed')) p.needed = true;
    if (filterChips.has('thumbs')) p.thumbs_up = true;
    if (committedSearchTrimmed) p.q = committedSearchTrimmed;
    if (filterChips.has('completed')) p.completed = true;
    if (filterChips.has('archived')) p.archived = true;
    return p;
  }, [
    paginationModel.page,
    paginationModel.pageSize,
    ordering,
    marketplaceParam,
    hasManifestFilter,
    filterChips,
    committedSearchTrimmed,
  ]);

  const auctionListBase = useMemo((): Omit<BuyingAuctionListParams, 'page' | 'page_size'> => {
    const p: Omit<BuyingAuctionListParams, 'page' | 'page_size'> = { ordering };
    if (marketplaceParam) p.marketplace = marketplaceParam;
    if (hasManifestFilter === true) p.has_manifest = true;
    if (filterChips.has('profitable')) p.profitable = true;
    if (filterChips.has('needed')) p.needed = true;
    if (filterChips.has('thumbs')) p.thumbs_up = true;
    if (committedSearchTrimmed) p.q = committedSearchTrimmed;
    if (filterChips.has('completed')) p.completed = true;
    if (filterChips.has('archived')) p.archived = true;
    return p;
  }, [ordering, marketplaceParam, hasManifestFilter, filterChips, committedSearchTrimmed]);

  const watchlistListBase = useMemo((): Omit<BuyingWatchlistParams, 'page' | 'page_size'> => {
    const p: Omit<BuyingWatchlistParams, 'page' | 'page_size'> = { ordering };
    if (marketplaceParam) p.marketplace = marketplaceParam;
    if (hasManifestFilter === true) p.has_manifest = true;
    if (filterChips.has('profitable')) p.profitable = true;
    if (filterChips.has('needed')) p.needed = true;
    if (filterChips.has('thumbs')) p.thumbs_up = true;
    if (committedSearchTrimmed) p.q = committedSearchTrimmed;
    if (filterChips.has('completed')) p.completed = true;
    if (filterChips.has('archived')) p.archived = true;
    return p;
  }, [ordering, marketplaceParam, hasManifestFilter, filterChips, committedSearchTrimmed]);

  const watchlistParams = useMemo(
    (): BuyingWatchlistParams => ({
      ...watchlistListBase,
      page: paginationModel.page + 1,
      page_size: paginationModel.pageSize,
    }),
    [watchlistListBase, paginationModel.page, paginationModel.pageSize]
  );

  const { data: auctionData, isLoading: auctionLoading, isError, error } = useBuyingAuctions(
    listParams,
    { enabled: isMdUp && !isWatched }
  );

  const { data: watchlistData, isLoading: watchlistLoading } = useBuyingWatchlist(watchlistParams, {
    enabled: isMdUp && isWatched,
  });

  const auctionInfinite = useBuyingAuctionsInfinite(auctionListBase, 20, !isMdUp && !isWatched);
  const watchInfinite = useBuyingWatchlistInfinite(watchlistListBase, 20, !isMdUp && isWatched);
  const mobileInfinite = isWatched ? watchInfinite : auctionInfinite;

  const mobileRows = useMemo(
    () => mobileInfinite.data?.pages.flatMap((p) => p.results) ?? [],
    [mobileInfinite.data?.pages]
  );

  const mobileTotalCount = mobileInfinite.data?.pages?.[0]?.count ?? 0;
  const mobileRemaining = Math.max(0, mobileTotalCount - mobileRows.length);

  const rows = isWatched ? (watchlistData?.results ?? []) : (auctionData?.results ?? []);
  const rowCount = isWatched ? (watchlistData?.count ?? 0) : (auctionData?.count ?? 0);
  const listLoading = isWatched ? watchlistLoading : auctionLoading;

  const filtersSummaryLabel = useMemo(() => {
    const showingCount = isMdUp ? rows.length : mobileRows.length;
    const showing = showingCount.toLocaleString();
    if (filtersActive) {
      const filteredRemainder = Math.max(0, rowCount - showingCount);
      return `(${showing} showing | ${filteredRemainder.toLocaleString()} filtered)`;
    }
    return `(${showing} showing | no filters)`;
  }, [isMdUp, rows.length, mobileRows.length, rowCount, filtersActive]);

  const endTimesForCountdown = useMemo(() => {
    const source = isMdUp ? rows : mobileRows;
    return source.map((r) => r.end_time);
  }, [isMdUp, rows, mobileRows]);
  const countdownTick = useLiveBuyingCountdownTick(endTimesForCountdown);

  const archiveMutation = useMutation({
    mutationFn: async ({ id, unarchive }: { id: number; unarchive: boolean }) => {
      if (unarchive) return deleteBuyingAuctionArchive(id);
      return postBuyingAuctionArchive(id);
    },
    onMutate: async ({ id, unarchive }) => {
      void queryClient.cancelQueries({ queryKey: ['buying'] });
      const previousAuctions = queryClient.getQueriesData({ queryKey: ['buying', 'auctions'] });
      const previousWatchlist = queryClient.getQueriesData({
        predicate: (q) => q.queryKey[0] === 'buying' && q.queryKey[1] === 'watchlist',
      });
      const archive = !unarchive;
      patchAllBuyingAuctionLists(queryClient, id, (r) => optimisticArchiveRow(r, archive));
      patchAllBuyingWatchlistLists(queryClient, id, (r) => ({
        ...r,
        ...optimisticArchiveRow(r, archive),
      }));
      return { previousAuctions, previousWatchlist };
    },
    onError: (_err, _vars, context) => {
      context?.previousAuctions?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      context?.previousWatchlist?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'summary'] });
    },
  });

  const handleArchiveToggle = useCallback(
    (row: BuyingAuctionListItem) => {
      archiveMutation.mutate({ id: row.id, unarchive: Boolean(row.archived_at) });
    },
    [archiveMutation]
  );

  const { data: tintPage } = useQuery({
    queryKey: ['buying', 'watchlist', 'tint-ids'] as const,
    queryFn: () => fetchBuyingWatchlist({ page: 1, page_size: 100 }),
    enabled: isMdUp,
  });

  const watchlistIdsForTint = useMemo(() => {
    if (!tintPage || tintPage.count > 100) return undefined;
    return new Set(tintPage.results.map((r) => r.id));
  }, [tintPage]);

  const thumbsMutation = useBuyingThumbsUpMutation();
  const watchMutation = useBuyingWatchlistToggleMutation();

  const handleWatchToggle = useCallback(
    (auctionId: number, add: boolean) => {
      watchMutation.mutate(
        { auctionId, add },
        {
          onError: () => enqueueSnackbar('Could not update watchlist.', { variant: 'error' }),
        }
      );
    },
    [watchMutation, enqueueSnackbar]
  );

  const handleThumbsToggle = useCallback(
    (id: number, next: boolean) => {
      thumbsMutation.mutate(
        { auctionId: id, active: next },
        {
          onError: () => enqueueSnackbar('Could not update thumbs up.', { variant: 'error' }),
        }
      );
    },
    [thumbsMutation, enqueueSnackbar]
  );

  const handleBulkWatch = useCallback(
    async (ids: number[], add: boolean) => {
      if (ids.length === 0) return;
      const previousWatchRelated = queryClient.getQueriesData({
        predicate: (q) => {
          const k = q.queryKey;
          return Array.isArray(k) && k[0] === 'buying' && k[1] === 'watchlist';
        },
      });
      patchWatchBulk(queryClient, ids, add);
      try {
        await Promise.all(ids.map((id) => (add ? postBuyingWatchlist(id) : deleteBuyingWatchlist(id))));
      } catch {
        previousWatchRelated.forEach(([key, data]) => queryClient.setQueryData(key, data));
        enqueueSnackbar('Could not update watchlist.', { variant: 'error' });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail'] });
    },
    [queryClient, enqueueSnackbar]
  );

  const handleBulkThumbs = useCallback(
    async (ids: number[], active: boolean) => {
      if (ids.length === 0) return;
      const previousAuctions = queryClient.getQueriesData({ queryKey: ['buying', 'auctions'] });
      const previousWatchlist = queryClient.getQueriesData({
        predicate: (q) => q.queryKey[0] === 'buying' && q.queryKey[1] === 'watchlist',
      });
      patchThumbsBulk(queryClient, ids, active);
      try {
        await Promise.all(ids.map((id) => (active ? postBuyingThumbsUp(id) : deleteBuyingThumbsUp(id))));
      } catch {
        previousAuctions.forEach(([key, data]) => queryClient.setQueryData(key, data));
        previousWatchlist.forEach(([key, data]) => queryClient.setQueryData(key, data));
        enqueueSnackbar('Could not update thumbs up.', { variant: 'error' });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
    },
    [queryClient, enqueueSnackbar]
  );

  const handleBulkArchive = useCallback(
    async (ids: number[], archive: boolean) => {
      if (ids.length === 0) return;
      const previousAuctions = queryClient.getQueriesData({ queryKey: ['buying', 'auctions'] });
      const previousWatchlist = queryClient.getQueriesData({
        predicate: (q) => q.queryKey[0] === 'buying' && q.queryKey[1] === 'watchlist',
      });
      patchArchiveBulk(queryClient, ids, archive);
      try {
        await Promise.all(
          ids.map((id) => (archive ? postBuyingAuctionArchive(id) : deleteBuyingAuctionArchive(id)))
        );
      } catch {
        previousAuctions.forEach(([key, data]) => queryClient.setQueryData(key, data));
        previousWatchlist.forEach(([key, data]) => queryClient.setQueryData(key, data));
        enqueueSnackbar('Could not update archive state.', { variant: 'error' });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'summary'] });
    },
    [queryClient, enqueueSnackbar]
  );

  const [manifestQueueOpen, setManifestQueueOpen] = useState(false);
  const [sweepDialogOpen, setSweepDialogOpen] = useState(false);
  const [sweepDialogLoading, setSweepDialogLoading] = useState(false);
  const [sweepDialogResponse, setSweepDialogResponse] = useState<BuyingSweepResponse | null>(null);
  const [sweepDialogError, setSweepDialogError] = useState<string | null>(null);

  /** Set after a successful sweep (last response `refreshed_at`); falls back to global summary. */
  const [lastSweepRefreshedAt, setLastSweepRefreshedAt] = useState<string | null>(null);

  const sortedMarketplacesForSweep = useMemo(() => {
    return [...(marketplaces ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  }, [marketplaces]);

  const lastRefreshedAt = lastSweepRefreshedAt ?? globalSummary?.last_refreshed_at ?? null;

  const lastRefreshedLabel = useMemo(() => {
    if (!lastRefreshedAt) return 'Never';
    try {
      return formatDistanceToNow(new Date(lastRefreshedAt), { addSuffix: true });
    } catch {
      return lastRefreshedAt;
    }
  }, [lastRefreshedAt, relativeTick]);

  const handleToggleMarketplace = useCallback(
    (slug: string, event: MouseEvent) => {
      if (!marketplaces?.length) return;
      const allSlugs = marketplaces.map((m) => m.slug);
      const ctrl = event.ctrlKey || event.metaKey;

      setActiveSlugs((prev) => {
        if (!prev) return prev;

        const allSelected = prev.size === marketplaces.length && marketplaces.every((m) => prev.has(m.slug));

        if (ctrl) {
          const next = new Set(prev);
          if (next.has(slug)) {
            next.delete(slug);
          } else {
            next.add(slug);
          }
          if (next.size === 0) {
            return new Set(allSlugs);
          }
          return next;
        }

        if (allSelected) {
          return new Set([slug]);
        }

        if (prev.size === 1 && prev.has(slug)) {
          return new Set(allSlugs);
        }

        if (prev.size === 1 && !prev.has(slug)) {
          return new Set([slug]);
        }

        return new Set([slug]);
      });
      setPaginationModel((pm) => ({ ...pm, page: 0 }));
    },
    [marketplaces]
  );

  const handleResetMarketplaces = useCallback(() => {
    if (!marketplaces?.length) return;
    setActiveSlugs(new Set(marketplaces.map((m) => m.slug)));
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, [marketplaces]);

  const handleOrderingChange = useCallback(
    (next: string) => {
      setOrdering((prev) => {
        if (prev === next) return prev;
        setPaginationModel((pm) => ({ ...pm, page: 0 }));
        return next;
      });
      try {
        const k = isWatched ? BUYING_WATCHLIST_ORDERING_STORAGE_KEY : BUYING_AUCTION_LIST_ORDERING_STORAGE_KEY;
        localStorage.setItem(k, next);
      } catch {
        /* ignore */
      }
    },
    [isWatched]
  );

  const handleFilterChipToggle = useCallback((id: AuctionFilterChipId, event: MouseEvent) => {
    const ctrl = event.ctrlKey || event.metaKey;
    setFilterChips((prev) => {
      const next = new Set(prev);
      if (ctrl) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      if (next.size === 0) {
        return new Set([id]);
      }
      if (next.size === 1 && next.has(id)) {
        return new Set();
      }
      if (next.size === 1 && !next.has(id)) {
        return new Set([id]);
      }
      return new Set([id]);
    });
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setFilterChips(new Set());
    setSearchDraft('');
    setSearchCommitted('');
    if (marketplaces?.length) {
      setActiveSlugs(new Set(marketplaces.map((m) => m.slug)));
    }
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, [marketplaces]);

  const handleClearMiscFilters = useCallback(() => {
    setFilterChips(new Set());
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, []);

  const commitSearch = useCallback(() => {
    setSearchCommitted(searchDraft.trim());
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, [searchDraft]);

  const handleSweepDialogClose = useCallback(() => {
    setSweepDialogOpen(false);
  }, []);

  const handleRefresh = async () => {
    if (sortedMarketplacesForSweep.length === 0) {
      enqueueSnackbar('No marketplaces configured.', { variant: 'warning' });
      return;
    }
    setSweepDialogOpen(true);
    setSweepDialogLoading(true);
    setSweepDialogResponse(null);
    setSweepDialogError(null);
    try {
      const res = await postBuyingSweep(null);
      setSweepDialogResponse(res);
      if (res.refreshed_at) setLastSweepRefreshedAt(res.refreshed_at);
      await queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
      await queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
    } catch (err: unknown) {
      let msg = 'Sweep failed.';
      if (isAxiosError(err)) {
        const d = err.response?.data as { detail?: string } | undefined;
        if (d?.detail) msg = d.detail;
        else if (err.message) msg = err.message;
      }
      setSweepDialogError(msg);
    } finally {
      setSweepDialogLoading(false);
    }
  };

  const onPaginationModelChange = useCallback((model: GridPaginationModel) => {
    setPaginationModel((prev) => {
      if (model.pageSize !== prev.pageSize) {
        return { page: 0, pageSize: model.pageSize };
      }
      return { page: model.page, pageSize: model.pageSize };
    });
  }, []);

  if (isError) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">
          Failed to load auctions: {error instanceof Error ? error.message : 'Unknown error'}
        </Typography>
      </Box>
    );
  }

  const sweepBusy = sweepDialogLoading;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        p: 2,
        boxSizing: 'border-box',
      }}
    >
      <PageHeader
        title="Active auctions"
        action={
          <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              Last refreshed: {lastRefreshedLabel}
            </Typography>
            {isAdmin ? (
              <Button variant="outlined" size="small" onClick={() => setManifestQueueOpen(true)}>
                Manifest queue
              </Button>
            ) : null}
            <Button
              variant="contained"
              disabled={sweepBusy}
              onClick={() => void handleRefresh()}
              startIcon={
                sweepBusy ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <Refresh />
                )
              }
            >
              Refresh auctions
            </Button>
          </Stack>
        }
      />

      <ManifestQueueDialog open={manifestQueueOpen} onClose={() => setManifestQueueOpen(false)} />

      <BuyingSweepProgressDialog
        open={sweepDialogOpen}
        loading={sweepDialogLoading}
        marketplacesPending={sortedMarketplacesForSweep.map((m) => ({ slug: m.slug, name: m.name }))}
        response={sweepDialogResponse}
        errorMessage={sweepDialogError}
        onClose={handleSweepDialogClose}
      />

      {isMdUp ? <CategoryNeedPanel /> : null}

      <Paper variant="outlined" sx={{ mb: 1.25, p: 1.5, flexShrink: 0 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ sm: 'flex-start' }}
          sx={{ mb: 1.25, width: '100%' }}
        >
          <TextField
            size="small"
            label="Search auctions"
            placeholder="Title or vendor…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitSearch();
              }
            }}
            sx={{ flex: 1, minWidth: { xs: '100%', sm: 240 } }}
          />
          <Button variant="outlined" size="medium" onClick={commitSearch} sx={{ mt: { xs: 0, sm: 0.5 } }}>
            Search
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          Press Enter or Search. Multiple words must all match (title or vendor each).
        </Typography>
        <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap spacing={0} sx={{ gap: 1.5, mb: 0.75 }}>
          <Typography variant="subtitle2" fontWeight={600} color="text.primary">
            Filters
          </Typography>
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
          >
            {filtersSummaryLabel}
          </Typography>
          {filtersActive ? (
            <Link
              component="button"
              type="button"
              variant="body2"
              underline="hover"
              onClick={handleClearAllFilters}
              sx={{ cursor: 'pointer', fontSize: '0.8125rem' }}
            >
              Clear all
            </Link>
          ) : null}
        </Stack>
        <Stack spacing={1} sx={{ width: '100%' }}>
          {marketplaces && activeSlugs ? (
            <AuctionMarketplaceChips
              marketplaces={marketplaces}
              countBySlug={countBySlugMerged}
              activeSlugs={activeSlugs}
              onToggle={handleToggleMarketplace}
              onResetAll={handleResetMarketplaces}
            />
          ) : null}
          <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap spacing={0} sx={{ gap: 0.75 }}>
            <Tooltip title="Clear Profitable / Needed / Thumbs / Watched / Has manifest / Completed (keeps marketplace + search)" enterDelay={400} placement="top">
              <Button
                variant="text"
                size="small"
                onClick={handleClearMiscFilters}
                sx={{ minWidth: 0, px: 0.75, height: 26, fontSize: '0.75rem' }}
              >
                Clear
              </Button>
            </Tooltip>
            <BuyingFilterChips
              active={filterChips}
              onToggle={handleFilterChipToggle}
              archivedCount={archivedCount}
            />
          </Stack>
        </Stack>
      </Paper>

      {isMdUp ? (
        <AuctionListDesktop
          rows={rows}
          rowCount={rowCount}
          loading={listLoading}
          ordering={ordering}
          onOrderingChange={handleOrderingChange}
          paginationModel={paginationModel}
          onPaginationModelChange={onPaginationModelChange}
          onRowNavigate={(id) => navigate(`/buying/auctions/${id}`)}
          isAdmin={isAdmin}
          onThumbsToggle={isAdmin ? handleThumbsToggle : undefined}
          onWatchToggle={handleWatchToggle}
          watchlistIds={watchlistIdsForTint}
          countdownTick={countdownTick}
          onArchiveToggle={handleArchiveToggle}
          onBulkWatch={handleBulkWatch}
          onBulkThumbs={handleBulkThumbs}
          onBulkArchive={handleBulkArchive}
        />
      ) : (
        <AuctionListMobile
          ordering={ordering}
          onOrderingChange={handleOrderingChange}
          rows={mobileRows}
          hasNextPage={mobileInfinite.hasNextPage}
          isFetchingNextPage={mobileInfinite.isFetchingNextPage}
          isLoading={mobileInfinite.isLoading}
          remainingCount={mobileRemaining}
          onLoadMore={() => void mobileInfinite.fetchNextPage()}
          onRowNavigate={(id) => navigate(`/buying/auctions/${id}`)}
          watchlistIds={watchlistIdsForTint}
          isAdmin={isAdmin}
          onThumbsToggle={isAdmin ? handleThumbsToggle : undefined}
          onWatchToggle={handleWatchToggle}
          countdownTick={countdownTick}
        />
      )}
    </Box>
  );
}
