import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteBuyingWatchlist, postBuyingWatchlist } from '../api/buying.api';
import {
  patchAllBuyingAuctionLists,
  patchTintIdsForWatch,
  patchWatchlistRemoveAuction,
} from '../utils/buyingOptimisticCache';

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
    onMutate: async ({ auctionId, add }) => {
      void queryClient.cancelQueries({ queryKey: ['buying'] });
      const previousWatchRelated = queryClient.getQueriesData({
        predicate: (q) => {
          const k = q.queryKey;
          return Array.isArray(k) && k[0] === 'buying' && k[1] === 'watchlist';
        },
      });
      const previousAuctions = queryClient.getQueriesData({ queryKey: ['buying', 'auctions'] });

      if (!add) {
        patchWatchlistRemoveAuction(queryClient, auctionId);
      }
      patchTintIdsForWatch(queryClient, auctionId, add);
      patchAllBuyingAuctionLists(queryClient, auctionId, (r) => ({
        ...r,
        watchlist_sort: add,
      }));

      return { previousWatchRelated, previousAuctions };
    },
    onError: (_err, _vars, context) => {
      context?.previousWatchRelated?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      context?.previousAuctions?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail'] });
    },
  });
}
