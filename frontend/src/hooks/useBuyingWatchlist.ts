import { useQuery } from '@tanstack/react-query';
import { fetchBuyingWatchlist } from '../api/buying.api';
import type { BuyingWatchlistParams } from '../types/buying.types';

export function useBuyingWatchlist(
  params: BuyingWatchlistParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['buying', 'watchlist', params] as const,
    queryFn: () => fetchBuyingWatchlist(params),
    enabled: options?.enabled ?? true,
  });
}
