import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTruckPallets,
  recordTruckPallet,
  truckPalletStep,
  type TruckPalletLedgerDTO,
  type TruckPalletStep,
} from '../api/truckPallets.api';

export const truckPalletsKey = (orderId: number | null | undefined) => ['truck-pallets', orderId] as const;

export function useTruckPallets(orderId: number | null | undefined) {
  return useQuery({
    queryKey: truckPalletsKey(orderId),
    queryFn: async () => (await getTruckPallets(orderId as number)).data,
    enabled: orderId != null,
    staleTime: 15_000,
  });
}

function useSetLedger(orderId: number | null | undefined) {
  const qc = useQueryClient();
  return (data: TruckPalletLedgerDTO) => qc.setQueryData(truckPalletsKey(orderId), data);
}

export function useRecordTruckPallet(orderId: number | null | undefined) {
  const setLedger = useSetLedger(orderId);
  return useMutation({
    mutationFn: async (body: { number: number; code?: string }) =>
      (await recordTruckPallet(orderId as number, body)).data,
    onSuccess: setLedger,
  });
}

export function useTruckPalletStep(orderId: number | null | undefined) {
  const setLedger = useSetLedger(orderId);
  return useMutation({
    mutationFn: async ({ step, ...body }: { step: TruckPalletStep; pallet_id?: number; code?: string }) =>
      (await truckPalletStep(orderId as number, step, body)).data,
    onSuccess: setLedger,
  });
}
