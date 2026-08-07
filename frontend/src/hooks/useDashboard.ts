import { useQuery } from '@tanstack/react-query';
import { getDashboardMetrics, getDashboardAlerts } from '../api/pos.api';
import type { DashboardMetrics } from '../types/pos.types';

const DASHBOARD_STALE_MS = 30_000;
const DASHBOARD_CACHE_KEY = 'dashboard:metrics:v1';

function readCachedDashboardMetrics(): DashboardMetrics | undefined {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as DashboardMetrics;
  } catch {
    return undefined;
  }
}

function writeCachedDashboardMetrics(metrics: DashboardMetrics) {
  try {
    sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(metrics));
  } catch {
    // Quota or private browsing - ignore.
  }
}

export function useDashboardMetrics() {
  return useQuery<DashboardMetrics>({
    queryKey: ['dashboard', 'metrics', { weeks: 8 }],
    queryFn: async () => {
      const { data } = await getDashboardMetrics({ weeks: 8 });
      writeCachedDashboardMetrics(data);
      return data;
    },
    staleTime: DASHBOARD_STALE_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    placeholderData: readCachedDashboardMetrics,
  });
}

export function useDashboardAlerts() {
  return useQuery({
    queryKey: ['dashboard', 'alerts'],
    queryFn: async () => {
      const { data } = await getDashboardAlerts();
      return data;
    },
    staleTime: DASHBOARD_STALE_MS,
  });
}
