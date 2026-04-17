import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { buyingWatchlistQueryKey, fetchBuyingWatchlist } from '../api/buying.api';
import type { BuyingWatchlistParams } from '../types/buying.types';

export function useBuyingWatchlist(
  params: BuyingWatchlistParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: buyingWatchlistQueryKey(params),
    queryFn: () => fetchBuyingWatchlist(params),
    enabled: options?.enabled ?? true,
    refetchOnMount: false,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
