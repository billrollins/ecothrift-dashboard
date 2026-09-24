import { useQuery } from '@tanstack/react-query';
import { fetchBuyingReportCards } from '../api/buying.api';

/** Won trucks, predicted vs actual (Buying → Report cards). */
export function useBuyingReportCards() {
  return useQuery({
    queryKey: ['buying', 'report-cards'],
    queryFn: fetchBuyingReportCards,
    staleTime: 60_000,
  });
}
