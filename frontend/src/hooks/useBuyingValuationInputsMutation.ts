import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useSnackbar } from 'notistack';
import { patchBuyingValuationInputs } from '../api/buying.api';
import type { BuyingValuationInputsPatch } from '../types/buying.types';

function valuationSaveErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { detail?: string } | undefined;
    if (typeof data?.detail === 'string' && data.detail.trim() !== '') return data.detail;
  }
  return 'Could not save valuation input.';
}

export function useBuyingValuationInputsMutation() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  return useMutation({
    mutationFn: ({ auctionId, body }: { auctionId: number; body: BuyingValuationInputsPatch }) =>
      patchBuyingValuationInputs(auctionId, body),
    onMutate: async ({ auctionId }) => {
      await queryClient.cancelQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['buying', 'auctions', 'detail', data.id], data);
      void queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey as readonly unknown[];
          if (k[0] !== 'buying' || k[1] !== 'auctions') return false;
          return !(k[2] === 'detail' && k[3] === data.id);
        },
      });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'watchlist'] });
    },
    onError: (err) => {
      enqueueSnackbar(valuationSaveErrorMessage(err), { variant: 'error' });
    },
  });
}
