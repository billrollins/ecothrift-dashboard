import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSupplemental,
  getSupplementalTransactions,
  drawFromSupplemental,
  returnToSupplemental,
  auditSupplemental,
  getBankTransactions,
  createBankTransaction,
  updateBankTransaction,
  deleteBankTransaction,
  completeBankTransaction,
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

export function useDrawFromSupplemental() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await drawFromSupplemental(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplemental'] });
    },
  });
}

export function useReturnToSupplemental() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await returnToSupplemental(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplemental'] });
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

export function useCreateBankTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createBankTransaction(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
    },
  });
}

export function useUpdateBankTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const { data: result } = await updateBankTransaction(id, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
    },
  });
}

export function useDeleteBankTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await deleteBankTransaction(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
    },
  });
}

export function useCompleteBankTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await completeBankTransaction(id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
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
