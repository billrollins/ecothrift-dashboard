import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteBuyingThumbsUp, postBuyingThumbsUp } from '../api/buying.api';

export function useBuyingThumbsUpMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ auctionId, active }: { auctionId: number; active: boolean }) => {
      if (active) return postBuyingThumbsUp(auctionId);
      return deleteBuyingThumbsUp(auctionId);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
      void queryClient.invalidateQueries({
        queryKey: ['buying', 'auctions', 'detail', variables.auctionId],
      });
    },
  });
}
