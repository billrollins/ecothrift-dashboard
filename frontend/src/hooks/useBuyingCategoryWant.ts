import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchBuyingCategoryWant, postBuyingCategoryWant } from '../api/buying.api';

export function useBuyingCategoryWant(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['buying', 'category-want'] as const,
    queryFn: fetchBuyingCategoryWant,
    enabled: options?.enabled ?? true,
  });
}

export function useBuyingCategoryWantMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postBuyingCategoryWant,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'category-want'] });
    },
  });
}
