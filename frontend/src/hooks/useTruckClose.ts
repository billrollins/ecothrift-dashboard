import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTruckClose, getUnfiledClaims, truckCloseStep, type TruckCloseStep, type UnfiledClaimDTO } from '../api/truckClose.api';
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
const UNFILED_KEPT = 'unfiled-claims:last';

function keptUnfiledClaims(): UnfiledClaimDTO[] | undefined {
  try {
    const raw = window.localStorage.getItem(UNFILED_KEPT);
    return raw ? (JSON.parse(raw) as UnfiledClaimDTO[]) : undefined;
  } catch {
    return undefined;
  }
}

/** The last answer is kept in the browser and shown at once, so the strip does not push the page down a second later. */
export function useUnfiledClaims() {
  return useQuery({
    queryKey: unfiledClaimsKey,
    queryFn: async () => {
      const claims = (await getUnfiledClaims()).data.claims;
      try { window.localStorage.setItem(UNFILED_KEPT, JSON.stringify(claims)); } catch { /* shown anyway */ }
      return claims;
    },
    placeholderData: keptUnfiledClaims,
    staleTime: 60_000,
  });
}
