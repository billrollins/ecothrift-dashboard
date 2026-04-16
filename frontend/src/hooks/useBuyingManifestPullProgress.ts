import { useQuery } from '@tanstack/react-query';
import {
  fetchBuyingManifestPullProgress,
  type BuyingManifestPullProgress,
} from '../api/buying.api';

/**
 * Poll the lightweight manifest-pull-progress endpoint while an API pull is
 * in-flight so the manifest card can show live row counts and the latest
 * :class:`ManifestPullLog` entry the moment it lands.
 *
 * Polling is disabled when ``isPulling`` is false to avoid hammering the API
 * during normal detail-page browsing; the query is still ``enabled`` so React
 * Query caches the last response and paints it immediately when the next pull
 * starts.
 */
export function useBuyingManifestPullProgress(
  auctionId: number | null,
  isPulling: boolean,
  options?: { pollMs?: number }
) {
  const pollMs = options?.pollMs ?? 1500;
  return useQuery<BuyingManifestPullProgress>({
    queryKey: ['buying', 'auctions', auctionId, 'manifest_pull_progress'] as const,
    queryFn: () => fetchBuyingManifestPullProgress(auctionId!),
    enabled: auctionId != null && Number.isFinite(auctionId),
    refetchInterval: isPulling ? pollMs : false,
    refetchIntervalInBackground: false,
    staleTime: isPulling ? 0 : 30_000,
  });
}
