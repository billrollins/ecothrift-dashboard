import { useQuery } from '@tanstack/react-query';
import { getDashboardMetrics, getDashboardAlerts } from '../api/pos.api';

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: async () => {
      const { data } = await getDashboardMetrics();
      return data;
    },
  });
}

export function useDashboardAlerts() {
  return useQuery({
    queryKey: ['dashboard', 'alerts'],
    queryFn: async () => {
      const { data } = await getDashboardAlerts();
      return data;
    },
  });
}
