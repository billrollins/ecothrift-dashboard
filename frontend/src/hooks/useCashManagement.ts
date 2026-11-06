import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSupplemental,
  getSupplementalTransactions,
  auditSupplemental,
  getBankTransactions,
  cashDrop,
} from '../api/pos.api';

export function useSupplemental() {
  return useQuery({
    queryKey: ['supplemental'],
    queryFn: async () => {
      const { data } = await getSupplemental();
      return data;
    },
  });
}

export function useSupplementalTransactions() {
  return useQuery({
    queryKey: ['supplemental', 'transactions'],
    queryFn: async () => {
      const { data } = await getSupplementalTransactions();
      return data;
    },
  });
}

export function useAuditSupplemental() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await auditSupplemental(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplemental'] });
    },
  });
}

export function useBankTransactions(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['bankTransactions', params],
    queryFn: async () => {
      const { data } = await getBankTransactions(params);
      return data;
    },
  });
}

export function useCashDrop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      drawerId,
      data,
    }: {
      drawerId: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await cashDrop(drawerId, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawers'] });
    },
  });
}
