import { useQuery } from '@tanstack/react-query';
import { fetchBuyingAuctions } from '../api/buying.api';
import type { BuyingAuctionListParams } from '../types/buying.types';

export function useBuyingAuctions(
  params: BuyingAuctionListParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['buying', 'auctions', params] as const,
    queryFn: () => fetchBuyingAuctions(params),
    enabled: options?.enabled ?? true,
  });
}
