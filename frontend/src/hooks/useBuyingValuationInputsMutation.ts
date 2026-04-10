import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patchBuyingValuationInputs } from '../api/buying.api';
import type { BuyingValuationInputsPatch } from '../types/buying.types';

export function useBuyingValuationInputsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ auctionId, body }: { auctionId: number; body: BuyingValuationInputsPatch }) =>
      patchBuyingValuationInputs(auctionId, body),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
      queryClient.setQueryData(['buying', 'auctions', 'detail', data.id], data);
    },
  });
}
