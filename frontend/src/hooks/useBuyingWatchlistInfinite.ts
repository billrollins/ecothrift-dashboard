import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchBuyingWatchlist } from '../api/buying.api';
import type { BuyingWatchlistParams } from '../types/buying.types';

const DEFAULT_PAGE_SIZE = 20;

export type BuyingWatchlistInfiniteBase = Omit<BuyingWatchlistParams, 'page' | 'page_size'>;

export function useBuyingWatchlistInfinite(
  base: BuyingWatchlistInfiniteBase,
  pageSize: number = DEFAULT_PAGE_SIZE,
  enabled: boolean = true
) {
  return useInfiniteQuery({
    queryKey: ['buying', 'watchlist', 'infinite', base, pageSize] as const,
    queryFn: ({ pageParam }) =>
      fetchBuyingWatchlist({
        ...base,
        page: pageParam as number,
        page_size: pageSize,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, p) => acc + p.results.length, 0);
      if (loaded >= lastPage.count) return undefined;
      return allPages.length + 1;
    },
    enabled,
    refetchOnMount: false,
    staleTime: 60_000,
  });
}
