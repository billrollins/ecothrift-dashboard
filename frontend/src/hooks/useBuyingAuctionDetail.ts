import { useQuery } from '@tanstack/react-query';
import { fetchBuyingAuction } from '../api/buying.api';

export function useBuyingAuctionDetail(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ['buying', 'auctions', 'detail', id] as const,
    queryFn: () => fetchBuyingAuction(id!),
    enabled: enabled && id != null && Number.isFinite(id),
  });
}
