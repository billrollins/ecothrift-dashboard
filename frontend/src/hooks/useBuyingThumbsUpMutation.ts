import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteBuyingThumbsUp, postBuyingThumbsUp } from '../api/buying.api';
import {
  optimisticThumbsRow,
  patchAllBuyingAuctionLists,
  patchAllBuyingWatchlistLists,
} from '../utils/buyingOptimisticCache';

export function useBuyingThumbsUpMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ auctionId, active }: { auctionId: number; active: boolean }) => {
      if (active) return postBuyingThumbsUp(auctionId);
      return deleteBuyingThumbsUp(auctionId);
    },
    onMutate: async ({ auctionId, active }) => {
      void queryClient.cancelQueries({ queryKey: ['buying'] });
      const previousAuctions = queryClient.getQueriesData({ queryKey: ['buying', 'auctions'] });
      const previousWatchlist = queryClient.getQueriesData({ predicate: (q) => q.queryKey[0] === 'buying' && q.queryKey[1] === 'watchlist' });

      patchAllBuyingAuctionLists(queryClient, auctionId, (r) => optimisticThumbsRow(r, active));
      patchAllBuyingWatchlistLists(queryClient, auctionId, (r) => ({
        ...r,
        ...optimisticThumbsRow(r, active),
      }));

      return { previousAuctions, previousWatchlist };
    },
    onError: (_err, _vars, context) => {
      context?.previousAuctions?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      context?.previousWatchlist?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: (_data, _err, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
      void queryClient.invalidateQueries({
        queryKey: ['buying', 'auctions', 'detail', variables.auctionId],
      });
    },
  });
}
