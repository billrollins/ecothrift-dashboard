import { useQuery } from '@tanstack/react-query';
import { fetchBuyingNags } from '../api/buying.api';
import type { BuyingNags } from '../types/buying.types';
import { useAuth } from './useAuth';

export const NO_BUYING_NAGS: BuyingNags = { ending: [], unrecorded: [], count: 0, tone: 'none' };

/**
 * The buyer's nags for the nag drawer (superusers: they hold the B-Stock login and bid).
 * Refreshed every minute, because a lot can move from amber to red, or pass the max.
 */
export function useBuyingNags(): BuyingNags {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['buying', 'nags'],
    queryFn: fetchBuyingNags,
    enabled: Boolean(user?.is_superuser),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return (user?.is_superuser && query.data) || NO_BUYING_NAGS;
}
