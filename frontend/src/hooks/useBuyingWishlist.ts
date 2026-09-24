import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchBuyingWishlist, type WishlistRank } from '../api/buying.api';

/** Today's best (Buying Phase 5). Prices move with the sweep, so it refreshes every minute. */
export function useBuyingWishlist(options: { includeOver: boolean; rank: WishlistRank; category: string }) {
  return useQuery({
    queryKey: ['buying', 'wishlist', options],
    queryFn: () => fetchBuyingWishlist(options),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}
