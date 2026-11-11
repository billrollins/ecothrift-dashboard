import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTruckClose, getUnfiledClaims, truckCloseStep, type TruckCloseStep } from '../api/truckClose.api';
import { truckPlanKey, truckSummaryKey } from './useTruckPlan';

export const truckCloseKey = (orderId: number | null | undefined) => ['truck-close', orderId] as const;
export const unfiledClaimsKey = ['unfiled-claims'] as const;

export function useTruckClose(orderId: number | null | undefined) {
  return useQuery({
    queryKey: truckCloseKey(orderId),
    queryFn: async () => (await getTruckClose(orderId as number)).data,
    enabled: orderId != null,
  });
}

/** Filed, not filed, money back, finalize. Each answers with the whole step; the header and lists refresh. */
export function useTruckCloseStep(orderId: number | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ step, body }: { step: TruckCloseStep; body?: Record<string, string | null> }) =>
      (await truckCloseStep(orderId as number, step, body)).data,
    onSuccess: (data) => {
      qc.setQueryData(truckCloseKey(orderId), data);
      for (const queryKey of [truckSummaryKey(orderId), truckPlanKey(orderId), unfiledClaimsKey,
        ['truck-finalize', orderId], ['bstock-disputes', orderId], ['order-card', orderId]]) {
        void qc.invalidateQueries({ queryKey });
      }
    },
  });
}

/** The count-down: trucks with a claim worth filing that is not filed. */
export function useUnfiledClaims() {
  return useQuery({
    queryKey: unfiledClaimsKey,
    queryFn: async () => (await getUnfiledClaims()).data.claims,
    staleTime: 60_000,
  });
}
