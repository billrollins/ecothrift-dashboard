import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteBuyingWatchlist, postBuyingWatchlist } from '../api/buying.api';

/** Toggle watchlist from auction list row (POST / DELETE …/watchlist/). */
export function useBuyingWatchlistToggleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ auctionId, add }: { auctionId: number; add: boolean }) => {
      if (add) {
        await postBuyingWatchlist(auctionId);
      } else {
        await deleteBuyingWatchlist(auctionId);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail'] });
    },
  });
}
