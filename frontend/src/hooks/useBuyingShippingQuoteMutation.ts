import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useSnackbar } from 'notistack';
import { postBuyingShippingQuote } from '../api/buying.api';
import { formatCurrency } from '../utils/format';

function quoteErrorMessage(err: unknown): { text: string; variant: 'info' | 'error' } {
  if (isAxiosError(err)) {
    const data = err.response?.data as { detail?: string; code?: string } | undefined;
    const text =
      typeof data?.detail === 'string' && data.detail.trim() !== ''
        ? data.detail
        : 'Could not read the B-Stock shipping quote.';
    // No quote yet, or no login: things the owner fixes on B-Stock, not failures.
    const variant = data?.code === 'no_quote' || data?.code === 'no_login' ? 'info' : 'error';
    return { text, variant };
  }
  return { text: 'Could not read the B-Stock shipping quote.', variant: 'error' };
}

/** POST /buying/auctions/:id/shipping-quote/ (superuser): read B-Stock's quote and re-value. */
export function useBuyingShippingQuoteMutation() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  return useMutation({
    mutationFn: (auctionId: number) => postBuyingShippingQuote(auctionId),
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
      enqueueSnackbar(`Shipping quote from B-Stock: ${formatCurrency(data.shipping_quote)}`, {
        variant: 'success',
      });
    },
    onError: (err) => {
      const { text, variant } = quoteErrorMessage(err);
      enqueueSnackbar(text, { variant });
    },
  });
}
