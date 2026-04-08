import { useQuery } from '@tanstack/react-query';
import { fetchBuyingMarketplaces } from '../api/buying.api';

export function useBuyingMarketplaces() {
  return useQuery({
    queryKey: ['buying', 'marketplaces'] as const,
    queryFn: () => fetchBuyingMarketplaces(),
  });
}
