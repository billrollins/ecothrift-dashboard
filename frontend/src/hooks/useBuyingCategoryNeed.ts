import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useSnackbar } from 'notistack';
import { fetchBuyingCategoryNeed, patchBuyingCategoryGoal } from '../api/buying.api';
import type { BuyingCategoryGoal } from '../types/buying.types';

export function useBuyingCategoryNeed(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['buying', 'category-need'] as const,
    queryFn: fetchBuyingCategoryNeed,
    enabled: options?.enabled ?? true,
    refetchOnMount: 'always',
  });
}

/** Set a category's goal; the server re-scores Need and re-values live auctions. */
export function useBuyingCategoryGoalMutation() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  return useMutation({
    mutationFn: ({ category, goal }: { category: string; goal: BuyingCategoryGoal }) =>
      patchBuyingCategoryGoal(category, goal),
    onSuccess: (data) => {
      queryClient.setQueryData(['buying', 'category-need'], data);
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
    },
    onError: (err) => {
      const detail = isAxiosError(err) ? (err.response?.data as { detail?: string } | undefined)?.detail : undefined;
      enqueueSnackbar(detail || 'Could not save the goal.', { variant: 'error' });
    },
  });
}
