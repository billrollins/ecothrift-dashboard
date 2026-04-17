import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { buyingAuctionListQueryKey, fetchBuyingAuctions } from '../api/buying.api';
import type { BuyingAuctionListParams } from '../types/buying.types';

export function useBuyingAuctions(
  params: BuyingAuctionListParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: buyingAuctionListQueryKey(params),
    queryFn: () => fetchBuyingAuctions(params),
    enabled: options?.enabled ?? true,
    refetchOnMount: false,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
