import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTruckPlan,
  getTruckSummary,
  saveTruckPlan,
  setTruckTarget,
  type TruckPlanSaveBody,
  type TruckPlanWindowDTO,
} from '../api/truckPlan.api';

export const truckSummaryKey = (orderId: number | null | undefined) => ['truck-summary', orderId] as const;
export const truckPlanKey = (orderId: number | null | undefined) => ['truck-plan', orderId] as const;

/** The numbers at the top of Processing: Paid, Target, On track, disputes so far, dates, the plan. */
export function useTruckSummary(orderId: number | null | undefined) {
  return useQuery({
    queryKey: truckSummaryKey(orderId),
    queryFn: async () => (await getTruckSummary(orderId as number)).data,
    enabled: orderId != null,
    staleTime: 15_000,
  });
}

/** The Truck Plan window: the same numbers plus the staff to pick from. */
export function useTruckPlanWindow(orderId: number | null | undefined) {
  return useQuery({
    queryKey: truckPlanKey(orderId),
    queryFn: async () => (await getTruckPlan(orderId as number)).data,
    enabled: orderId != null,
    staleTime: 15_000,
  });
}

/** A save answers with the whole window, so the window and the Processing header update at once. */
function useSetWindow(orderId: number | null | undefined) {
  const qc = useQueryClient();
  return (data: TruckPlanWindowDTO) => {
    qc.setQueryData(truckPlanKey(orderId), data);
    const { staff: _staff, ...summary } = data;
    qc.setQueryData(truckSummaryKey(orderId), summary);
  };
}

export function useSaveTruckPlan(orderId: number | null | undefined) {
  const setWindow = useSetWindow(orderId);
  return useMutation({
    mutationFn: async (body: TruckPlanSaveBody) => (await saveTruckPlan(orderId as number, body)).data,
    onSuccess: setWindow,
  });
}

export function useSetTruckTarget(orderId: number | null | undefined) {
  const setWindow = useSetWindow(orderId);
  return useMutation({
    mutationFn: async (total: string | null) => (await setTruckTarget(orderId as number, total)).data,
    onSuccess: setWindow,
  });
}
