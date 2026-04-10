import { useQuery } from '@tanstack/react-query';
import { fetchBuyingCategoryNeed } from '../api/buying.api';

export function useBuyingCategoryNeed(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['buying', 'category-need'] as const,
    queryFn: fetchBuyingCategoryNeed,
    enabled: options?.enabled ?? true,
    refetchOnMount: 'always',
  });
}
