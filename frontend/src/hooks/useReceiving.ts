import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ReceivingDetailDTO, ReceivingPatchPayload } from '../types/inventory.types';
import { fetchReceiving, patchReceiving } from '../api/inventory.api';

export const receivingDetailQueryKey = (orderId: number) => ['receiving', orderId] as const;

export function useReceivingDetail(orderId: number | null) {
  return useQuery({
    queryKey: receivingDetailQueryKey(orderId ?? -1),
    queryFn: async (): Promise<ReceivingDetailDTO> => {
      if (!orderId || !Number.isFinite(orderId)) throw new Error('no_order');
      const { data } = await fetchReceiving(orderId);
      return data;
    },
    enabled:
      orderId != null &&
      Number.isFinite(orderId) &&
      orderId > 0,

  });
}

export function usePatchReceivingMutation(orderId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ReceivingPatchPayload) => {
      if (orderId == null || !Number.isFinite(orderId)) throw new Error('bad_order');
      const { data } = await patchReceiving(orderId, payload);
      return data;
    },
    onSuccess: (data) => {
      if (orderId == null || !Number.isFinite(orderId)) return;
      queryClient.setQueryData(receivingDetailQueryKey(orderId), data);
    },
  });
}
