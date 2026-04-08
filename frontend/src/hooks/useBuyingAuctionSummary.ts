import { useQuery } from '@tanstack/react-query';
import { fetchBuyingAuctionSummary } from '../api/buying.api';
import type { BuyingAuctionSummaryParams } from '../types/buying.types';

export function useBuyingAuctionSummary(params: BuyingAuctionSummaryParams) {
  return useQuery({
    queryKey: ['buying', 'auctions', 'summary', params] as const,
    queryFn: () => fetchBuyingAuctionSummary(params),
  });
}
