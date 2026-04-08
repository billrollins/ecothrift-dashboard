import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchBuyingManifestRows } from '../api/buying.api';

export function useBuyingManifestRowsPage(auctionId: number | null, page: number, enabled: boolean) {
  return useQuery({
    queryKey: ['buying', 'auctions', auctionId, 'manifest_rows', page] as const,
    queryFn: () => fetchBuyingManifestRows(auctionId!, { page: page + 1 }),
    enabled: enabled && auctionId != null,
  });
}

export function useBuyingManifestRowsInfinite(auctionId: number | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['buying', 'auctions', auctionId, 'manifest_rows', 'infinite'] as const,
    queryFn: ({ pageParam }) =>
      fetchBuyingManifestRows(auctionId!, { page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, p) => acc + p.results.length, 0);
      if (loaded >= lastPage.count) return undefined;
      return allPages.length + 1;
    },
    enabled: enabled && auctionId != null,
  });
}
