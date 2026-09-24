import { useQuery } from '@tanstack/react-query';
import { fetchBuyingAuctionDecision } from '../api/buying.api';

/** The auction page's decision panel; refreshes with the price (every minute). */
export function useBuyingAuctionDecision(auctionId: number | null | undefined) {
  return useQuery({
    queryKey: ['buying', 'auctions', auctionId, 'decision'],
    queryFn: () => fetchBuyingAuctionDecision(auctionId as number),
    enabled: Boolean(auctionId),
    refetchInterval: 60_000,
  });
}
