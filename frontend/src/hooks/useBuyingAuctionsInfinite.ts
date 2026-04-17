import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchBuyingAuctions } from '../api/buying.api';
import type { BuyingAuctionListParams } from '../types/buying.types';

const DEFAULT_PAGE_SIZE = 20;

export type BuyingAuctionInfiniteBase = Omit<BuyingAuctionListParams, 'page' | 'page_size'>;

export function useBuyingAuctionsInfinite(
  base: BuyingAuctionInfiniteBase,
  pageSize: number = DEFAULT_PAGE_SIZE,
  enabled: boolean = true
) {
  return useInfiniteQuery({
    queryKey: ['buying', 'auctions', 'infinite', base, pageSize] as const,
    queryFn: ({ pageParam }) =>
      fetchBuyingAuctions({
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
