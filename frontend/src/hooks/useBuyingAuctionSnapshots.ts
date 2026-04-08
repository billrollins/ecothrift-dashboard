import { useQuery } from '@tanstack/react-query';

import { fetchBuyingSnapshots } from '../api/buying.api';

export function useBuyingAuctionSnapshots(auctionId: number | null) {
  return useQuery({
    queryKey: ['buying', 'auctions', auctionId, 'snapshots'],
    queryFn: () => fetchBuyingSnapshots(auctionId!),
    enabled: auctionId != null,
  });
}
