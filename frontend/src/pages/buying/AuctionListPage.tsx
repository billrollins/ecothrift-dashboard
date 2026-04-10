import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Link,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Refresh from '@mui/icons-material/Refresh';
import type { GridPaginationModel } from '@mui/x-data-grid';
import { isAxiosError } from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { fetchBuyingWatchlist, postBuyingSweep } from '../../api/buying.api';
import BuyingFilterChips, { type AuctionFilterChipId } from '../../components/buying/BuyingFilterChips';
import CategoryNeedPanel from '../../components/buying/CategoryNeedPanel';
import { PageHeader } from '../../components/common/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useBuyingAuctions } from '../../hooks/useBuyingAuctions';
import { useBuyingAuctionsInfinite } from '../../hooks/useBuyingAuctionsInfinite';
import { useBuyingAuctionSummary } from '../../hooks/useBuyingAuctionSummary';
import { useBuyingMarketplaces } from '../../hooks/useBuyingMarketplaces';
import { useBuyingThumbsUpMutation } from '../../hooks/useBuyingThumbsUpMutation';
import { useBuyingValuationInputsMutation } from '../../hooks/useBuyingValuationInputsMutation';
import { useBuyingWatchlist } from '../../hooks/useBuyingWatchlist';
import { useBuyingWatchlistInfinite } from '../../hooks/useBuyingWatchlistInfinite';
import type {
  BuyingAuctionListParams,
  BuyingAuctionSummaryParams,
  BuyingWatchlistParams,
} from '../../types/buying.types';
import AuctionListDesktop from './AuctionListDesktop';
import AuctionListMobile from './AuctionListMobile';
import AuctionMarketplaceChips from './AuctionMarketplaceChips';

/** Stable reference for useBuyingAuctionSummary — inline `{}` is a new object every render and churns the query key. */
const BUYING_SUMMARY_PARAMS_EMPTY: BuyingAuctionSummaryParams = {};

export default function AuctionListPage() {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('Admin');

  const [ordering, setOrdering] = useState('-priority,end_time');
  const [filterChips, setFilterChips] = useState<Set<AuctionFilterChipId>>(() => new Set());

  /** null = marketplaces not loaded yet; then all slugs active. */
  const [activeSlugs, setActiveSlugs] = useState<Set<string> | null>(null);

  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });

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

  const filtersActive = useMemo(
    () => filterChips.size > 0 || Boolean(marketplaceParam),
    [filterChips, marketplaceParam]
  );

  const isWatched = filterChips.has('watched');

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
    return p;
  }, [
    paginationModel.page,
    paginationModel.pageSize,
    ordering,
    marketplaceParam,
    hasManifestFilter,
    filterChips,
  ]);

  const auctionListBase = useMemo((): Omit<BuyingAuctionListParams, 'page' | 'page_size'> => {
    const p: Omit<BuyingAuctionListParams, 'page' | 'page_size'> = { ordering };
    if (marketplaceParam) p.marketplace = marketplaceParam;
    if (hasManifestFilter === true) p.has_manifest = true;
    if (filterChips.has('profitable')) p.profitable = true;
    if (filterChips.has('needed')) p.needed = true;
    if (filterChips.has('thumbs')) p.thumbs_up = true;
    return p;
  }, [ordering, marketplaceParam, hasManifestFilter, filterChips]);

  const watchlistListBase = useMemo((): Omit<BuyingWatchlistParams, 'page' | 'page_size'> => {
    const p: Omit<BuyingWatchlistParams, 'page' | 'page_size'> = { ordering };
    if (marketplaceParam) p.marketplace = marketplaceParam;
    if (hasManifestFilter === true) p.has_manifest = true;
    if (filterChips.has('profitable')) p.profitable = true;
    if (filterChips.has('needed')) p.needed = true;
    if (filterChips.has('thumbs')) p.thumbs_up = true;
    return p;
  }, [ordering, marketplaceParam, hasManifestFilter, filterChips]);

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

  /** Keep latest rows for priority steppers without putting `rows` in useCallback deps — that changes every page fetch and rebuilds DataGrid columns, which resets MUI controlled pagination. */
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

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
  const valuationMutation = useBuyingValuationInputsMutation();

  const handleThumbsToggle = useCallback(
    async (id: number, next: boolean) => {
      try {
        await thumbsMutation.mutateAsync({ auctionId: id, active: next });
      } catch {
        enqueueSnackbar('Could not update thumbs up.', { variant: 'error' });
      }
    },
    [thumbsMutation, enqueueSnackbar]
  );

  const handlePriorityDelta = useCallback(
    async (id: number, delta: -1 | 1) => {
      const row = rowsRef.current.find((r) => r.id === id);
      if (!row || typeof row.priority !== 'number') return;
      const next = Math.min(99, Math.max(1, row.priority + delta));
      try {
        await valuationMutation.mutateAsync({ auctionId: id, body: { priority: next } });
      } catch {
        enqueueSnackbar('Could not update priority.', { variant: 'error' });
      }
    },
    [valuationMutation, enqueueSnackbar]
  );

  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepProgress, setSweepProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);

  /** Set after a successful sweep (last response `refreshed_at`); falls back to global summary. */
  const [lastSweepRefreshedAt, setLastSweepRefreshedAt] = useState<string | null>(null);

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

  const handleOrderingChange = useCallback((next: string) => {
    setOrdering((prev) => {
      if (prev === next) return prev;
      setPaginationModel((pm) => ({ ...pm, page: 0 }));
      return next;
    });
  }, []);

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
    if (marketplaces?.length) {
      setActiveSlugs(new Set(marketplaces.map((m) => m.slug)));
    }
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, [marketplaces]);

  const handleRefresh = async () => {
    const mps = [...(marketplaces ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    if (mps.length === 0) {
      enqueueSnackbar('No marketplaces configured.', { variant: 'warning' });
      return;
    }
    setIsSweeping(true);
    setSweepProgress(null);
    let totalUpserted = 0;
    let lastRefreshed: string | undefined;
    const failures: string[] = [];
    let okCount = 0;
    try {
      for (let i = 0; i < mps.length; i++) {
        setSweepProgress({ current: i + 1, total: mps.length, name: mps[i].name });
        try {
          const res = await postBuyingSweep(mps[i].slug);
          totalUpserted += res.upserted;
          if (res.refreshed_at) lastRefreshed = res.refreshed_at;
          okCount += 1;
        } catch (err: unknown) {
          failures.push(mps[i].name);
          let detail = 'Request failed';
          if (isAxiosError(err)) {
            const d = err.response?.data as { detail?: string } | undefined;
            if (d?.detail) detail = d.detail;
            else if (err.message) detail = err.message;
          } else if (err instanceof Error) detail = err.message;
          console.warn(`[buying sweep] marketplace ${mps[i].slug} failed:`, detail);
        }
      }
      if (okCount > 0) {
        if (lastRefreshed) setLastSweepRefreshedAt(lastRefreshed);
        await queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
        await queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
      }
      const failedSuffix =
        failures.length > 0 ? ` (${failures.join(', ')} failed)` : '';
      if (okCount === 0 && failures.length > 0) {
        enqueueSnackbar(`Sweep failed for all marketplaces: ${failures.join(', ')}.`, {
          variant: 'error',
        });
      } else if (okCount > 0) {
        enqueueSnackbar(
          `Sweep complete: ${totalUpserted} auctions updated across ${okCount} marketplace${okCount === 1 ? '' : 's'}${failedSuffix}.`,
          { variant: failures.length ? 'warning' : 'success' },
        );
      }
    } catch (err: unknown) {
      let msg = 'Sweep failed.';
      if (isAxiosError(err)) {
        const d = err.response?.data as { detail?: string } | undefined;
        if (d?.detail) msg = d.detail;
        else if (err.message) msg = err.message;
      }
      enqueueSnackbar(msg, { variant: 'error' });
    } finally {
      setIsSweeping(false);
      setSweepProgress(null);
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

  const sweepBusy = isSweeping;

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
            {sweepProgress ? (
              <Typography variant="caption" color="text.secondary">
                Sweeping {sweepProgress.current}/{sweepProgress.total}: {sweepProgress.name}…
              </Typography>
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

      {isMdUp ? <CategoryNeedPanel /> : null}

      <Box sx={{ mb: 2, flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap spacing={0} sx={{ gap: 1.5, mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600} color="text.primary">
            Filters
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
          <BuyingFilterChips active={filterChips} onToggle={handleFilterChipToggle} />
        </Stack>
      </Box>

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
          onPriorityDelta={isAdmin ? handlePriorityDelta : undefined}
          watchlistIds={watchlistIdsForTint}
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
        />
      )}
    </Box>
  );
}
