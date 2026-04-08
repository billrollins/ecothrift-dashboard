import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Refresh from '@mui/icons-material/Refresh';
import type { GridPaginationModel } from '@mui/x-data-grid';
import { isAxiosError } from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { useBuyingAuctions } from '../../hooks/useBuyingAuctions';
import { useBuyingAuctionsInfinite } from '../../hooks/useBuyingAuctionsInfinite';
import { useBuyingAuctionSummary } from '../../hooks/useBuyingAuctionSummary';
import { useBuyingMarketplaces } from '../../hooks/useBuyingMarketplaces';
import { postBuyingSweep } from '../../api/buying.api';
import type { BuyingAuctionListParams } from '../../types/buying.types';
import AuctionListDesktop from './AuctionListDesktop';
import AuctionListMobile from './AuctionListMobile';
import AuctionMarketplaceChips from './AuctionMarketplaceChips';

const AUCTION_STATUSES = ['open', 'closing', 'closed', 'cancelled'] as const;

export default function AuctionListPage() {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('');
  const [hasManifest, setHasManifest] = useState<string>('');
  const [ordering, setOrdering] = useState('-end_time');

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

  const { data: globalSummary } = useBuyingAuctionSummary({});

  const countBySlugMerged = useMemo(() => {
    const map: Record<string, number> = {};
    globalSummary?.by_marketplace.forEach((m) => {
      map[m.slug] = m.count;
    });
    return map;
  }, [globalSummary]);

  const listParams = useMemo((): BuyingAuctionListParams => {
    const p: BuyingAuctionListParams = {
      page: paginationModel.page + 1,
      page_size: paginationModel.pageSize,
      ordering,
    };
    if (marketplaceParam) p.marketplace = marketplaceParam;
    if (statusFilter) p.status = statusFilter;
    if (hasManifest === 'true') p.has_manifest = true;
    if (hasManifest === 'false') p.has_manifest = false;
    return p;
  }, [paginationModel.page, paginationModel.pageSize, ordering, marketplaceParam, statusFilter, hasManifest]);

  const mobileListBase = useMemo((): Omit<BuyingAuctionListParams, 'page' | 'page_size'> => {
    const p: Omit<BuyingAuctionListParams, 'page' | 'page_size'> = { ordering };
    if (marketplaceParam) p.marketplace = marketplaceParam;
    if (statusFilter) p.status = statusFilter;
    if (hasManifest === 'true') p.has_manifest = true;
    if (hasManifest === 'false') p.has_manifest = false;
    return p;
  }, [ordering, marketplaceParam, statusFilter, hasManifest]);

  const { data, isLoading, isError, error } = useBuyingAuctions(listParams, { enabled: isMdUp });

  const infinite = useBuyingAuctionsInfinite(mobileListBase, 20, !isMdUp);

  const mobileRows = useMemo(
    () => infinite.data?.pages.flatMap((p) => p.results) ?? [],
    [infinite.data?.pages]
  );

  const mobileTotalCount = infinite.data?.pages?.[0]?.count ?? 0;
  const mobileRemaining = Math.max(0, mobileTotalCount - mobileRows.length);

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
    (slug: string) => {
      setActiveSlugs((prev) => {
        if (!prev || !marketplaces?.length) return prev;
        // Last active chip: tap resets to all on (natural reset gesture).
        if (prev.size === 1 && prev.has(slug)) {
          return new Set(marketplaces.map((m) => m.slug));
        }
        const next = new Set(prev);
        if (next.has(slug)) {
          next.delete(slug);
        } else {
          next.add(slug);
        }
        return next;
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
    setOrdering(next);
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, []);

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

  const rows = data?.results ?? [];
  const rowCount = data?.count ?? 0;

  const onPaginationModelChange = useCallback((model: GridPaginationModel) => {
    setPaginationModel(model);
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
        title="Auctions"
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

      {marketplaces && activeSlugs ? (
        <AuctionMarketplaceChips
          marketplaces={marketplaces}
          countBySlug={countBySlugMerged}
          activeSlugs={activeSlugs}
          onToggle={handleToggleMarketplace}
          onResetAll={handleResetMarketplaces}
        />
      ) : null}

      <Grid container spacing={1.5} sx={{ mb: 2, flexShrink: 0 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="buying-st-label">Status</InputLabel>
            <Select
              labelId="buying-st-label"
              label="Status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPaginationModel((pm) => ({ ...pm, page: 0 }));
              }}
            >
              <MenuItem value="">All</MenuItem>
              {AUCTION_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="buying-hm-label">Has manifest</InputLabel>
            <Select
              labelId="buying-hm-label"
              label="Has manifest"
              value={hasManifest}
              onChange={(e) => {
                setHasManifest(e.target.value);
                setPaginationModel((pm) => ({ ...pm, page: 0 }));
              }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Yes</MenuItem>
              <MenuItem value="false">No</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {isMdUp ? (
        <AuctionListDesktop
          rows={rows}
          rowCount={rowCount}
          loading={isLoading}
          ordering={ordering}
          onOrderingChange={handleOrderingChange}
          paginationModel={paginationModel}
          onPaginationModelChange={onPaginationModelChange}
          onRowNavigate={(id) => navigate(`/buying/auctions/${id}`)}
        />
      ) : (
        <AuctionListMobile
          ordering={ordering}
          onOrderingChange={handleOrderingChange}
          rows={mobileRows}
          hasNextPage={infinite.hasNextPage}
          isFetchingNextPage={infinite.isFetchingNextPage}
          isLoading={infinite.isLoading}
          remainingCount={mobileRemaining}
          onLoadMore={() => void infinite.fetchNextPage()}
          onRowNavigate={(id) => navigate(`/buying/auctions/${id}`)}
        />
      )}
    </Box>
  );
}
