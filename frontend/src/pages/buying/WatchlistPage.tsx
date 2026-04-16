import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import type { GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { deleteBuyingWatchlist, postBuyingWatchlistUpdateNow } from '../../api/buying.api';
import { useBuyingWatchlist } from '../../hooks/useBuyingWatchlist';
import { useBuyingWatchlistInfinite } from '../../hooks/useBuyingWatchlistInfinite';
import type { BuyingWatchlistParams } from '../../types/buying.types';
import WatchlistListDesktop from './WatchlistListDesktop';
import WatchlistListMobile from './WatchlistListMobile';

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'] as const;
const WATCHLIST_STATUS_OPTIONS = ['watching', 'bidding', 'won', 'lost', 'passed'] as const;

export default function WatchlistPage() {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [ordering, setOrdering] = useState('end_time');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [watchlistStatusFilter, setWatchlistStatusFilter] = useState('');
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });

  const [removingId, setRemovingId] = useState<number | null>(null);

  const listParams = useMemo((): BuyingWatchlistParams => {
    const p: BuyingWatchlistParams = {
      page: paginationModel.page + 1,
      page_size: paginationModel.pageSize,
      ordering,
    };
    if (priorityFilter) p.priority = priorityFilter;
    if (watchlistStatusFilter) p.watchlist_status = watchlistStatusFilter;
    return p;
  }, [paginationModel.page, paginationModel.pageSize, ordering, priorityFilter, watchlistStatusFilter]);

  const mobileBase = useMemo(
    (): Omit<BuyingWatchlistParams, 'page' | 'page_size'> => {
      const o: Omit<BuyingWatchlistParams, 'page' | 'page_size'> = { ordering };
      if (priorityFilter) o.priority = priorityFilter;
      if (watchlistStatusFilter) o.watchlist_status = watchlistStatusFilter;
      return o;
    },
    [ordering, priorityFilter, watchlistStatusFilter]
  );

  const { data, isLoading, isError, error } = useBuyingWatchlist(listParams, { enabled: isMdUp });

  const infinite = useBuyingWatchlistInfinite(mobileBase, 20, !isMdUp);

  const mobileRows = useMemo(
    () => infinite.data?.pages.flatMap((p) => p.results) ?? [],
    [infinite.data?.pages]
  );
  const mobileTotalCount = infinite.data?.pages?.[0]?.count ?? 0;
  const mobileRemaining = Math.max(0, mobileTotalCount - mobileRows.length);

  const updateNowMutation = useMutation({
    mutationFn: postBuyingWatchlistUpdateNow,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
      const polled = typeof data.polled === 'number' ? data.polled : 0;
      enqueueSnackbar(`Watch poll: ${polled} auction(s) updated.`, { variant: 'success' });
    },
    onError: () => {
      enqueueSnackbar('Watch update failed.', { variant: 'error' });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (auctionId: number) => deleteBuyingWatchlist(auctionId),
    onMutate: (auctionId) => {
      setRemovingId(auctionId);
    },
    onSuccess: (_void, auctionId) => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
      enqueueSnackbar('Removed from watchlist.', { variant: 'success' });
    },
    onError: () => {
      enqueueSnackbar('Could not remove from watchlist.', { variant: 'error' });
    },
    onSettled: () => {
      setRemovingId(null);
    },
  });

  const handleRemove = useCallback(
    (auctionId: number) => {
      removeMutation.mutate(auctionId);
    },
    [removeMutation]
  );

  const handleOrderingChange = useCallback((next: string) => {
    setOrdering(next);
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, []);

  const handleFilterChange = useCallback(() => {
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, []);

  const rows = isMdUp ? data?.results ?? [] : mobileRows;
  const rowCount = isMdUp ? data?.count ?? 0 : mobileTotalCount;
  const loading = isMdUp ? isLoading : infinite.isLoading && mobileRows.length === 0;

  if (isError) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">
          {error instanceof Error ? error.message : 'Failed to load watchlist.'}
        </Typography>
      </Box>
    );
  }

  const empty = !loading && rowCount === 0;
  const hasActiveFilters = Boolean(priorityFilter || watchlistStatusFilter);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Watchlist"
        subtitle="Auctions you are tracking"
        action={
          <Tooltip title="Poll B-Stock for due watchlist auctions (public auction state API)">
            <span>
              <Button
                variant="outlined"
                size="small"
                disabled={updateNowMutation.isPending}
                onClick={() => updateNowMutation.mutate()}
              >
                {updateNowMutation.isPending ? 'Updating…' : 'Update now'}
              </Button>
            </span>
          </Tooltip>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="wl-priority-filter">Priority</InputLabel>
          <Select
            labelId="wl-priority-filter"
            label="Priority"
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              handleFilterChange();
            }}
          >
            <MenuItem value="">All</MenuItem>
            {PRIORITY_OPTIONS.map((p) => (
              <MenuItem key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="wl-status-filter">Watchlist status</InputLabel>
          <Select
            labelId="wl-status-filter"
            label="Watchlist status"
            value={watchlistStatusFilter}
            onChange={(e) => {
              setWatchlistStatusFilter(e.target.value);
              handleFilterChange();
            }}
          >
            <MenuItem value="">All</MenuItem>
            {WATCHLIST_STATUS_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {empty ? (
        <Typography color="text.secondary" sx={{ py: 4 }}>
          {hasActiveFilters
            ? 'No auctions match these filters.'
            : 'No watched auctions yet. Star auctions from the detail page to track them here.'}
        </Typography>
      ) : isMdUp ? (
        <WatchlistListDesktop
          rows={rows}
          rowCount={rowCount}
          loading={loading}
          ordering={ordering}
          onOrderingChange={handleOrderingChange}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          onRowNavigate={(id) => navigate(`/buying/auctions/${id}`)}
          onRemove={handleRemove}
          removingId={removingId}
        />
      ) : (
        <WatchlistListMobile
          ordering={ordering}
          onOrderingChange={handleOrderingChange}
          rows={rows}
          hasNextPage={Boolean(infinite.hasNextPage)}
          isFetchingNextPage={infinite.isFetchingNextPage}
          isLoading={loading}
          remainingCount={mobileRemaining}
          onLoadMore={() => void infinite.fetchNextPage()}
          onRowNavigate={(id) => navigate(`/buying/auctions/${id}`)}
          onRemove={handleRemove}
          removingId={removingId}
        />
      )}
    </Box>
  );
}
