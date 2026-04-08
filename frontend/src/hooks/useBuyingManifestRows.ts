import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchBuyingManifestRows } from '../api/buying.api';

export type ManifestRowsFilterParams = {
  search?: string;
  category?: string;
};

export function useBuyingManifestRowsPage(
  auctionId: number | null,
  page: number,
  filters: ManifestRowsFilterParams,
  enabled: boolean
) {
  const { search, category } = filters;
  return useQuery({
    queryKey: ['buying', 'auctions', auctionId, 'manifest_rows', page, search ?? '', category ?? ''] as const,
    queryFn: () =>
      fetchBuyingManifestRows(auctionId!, {
        page: page + 1,
        search: search || undefined,
        category: category || undefined,
      }),
    enabled: enabled && auctionId != null,
  });
}

export function useBuyingManifestRowsInfinite(
  auctionId: number | null,
  filters: ManifestRowsFilterParams,
  enabled: boolean
) {
  const { search, category } = filters;
  return useInfiniteQuery({
    queryKey: ['buying', 'auctions', auctionId, 'manifest_rows', 'infinite', search ?? '', category ?? ''] as const,
    queryFn: ({ pageParam }) =>
      fetchBuyingManifestRows(auctionId!, {
        page: pageParam as number,
        search: search || undefined,
        category: category || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, p) => acc + p.results.length, 0);
      if (loaded >= lastPage.count) return undefined;
      return allPages.length + 1;
    },
    enabled: enabled && auctionId != null,
  });
}
