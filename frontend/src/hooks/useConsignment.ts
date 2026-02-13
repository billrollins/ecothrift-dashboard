import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getConsigneeAccounts,
  getConsigneeAccount,
  createConsigneeAccount,
  updateConsigneeAccount,
  deleteConsigneeAccount,
  getAgreements,
  createAgreement,
  updateAgreement,
  deleteAgreement,
  getConsignmentItems,
  getPayouts,
  generatePayout,
  markPayoutPaid,
  getMyItems,
  getMyPayouts,
  getMySummary,
} from '../api/consignment.api';

// ── Consignee Account hooks ──────────────────────────────────────────────────

export function useConsigneeAccounts(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['consignment', 'accounts', params],
    queryFn: async () => {
      const { data } = await getConsigneeAccounts(params);
      return data;
    },
  });
}

export function useConsigneeAccount(id: number | null) {
  return useQuery({
    queryKey: ['consignment', 'accounts', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getConsigneeAccount(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreateConsigneeAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createConsigneeAccount(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consignment', 'accounts'] });
    },
  });
}

export function useUpdateConsigneeAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const { data: result } = await updateConsigneeAccount(id, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consignment', 'accounts'] });
    },
  });
}

export function useDeleteConsigneeAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await deleteConsigneeAccount(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consignment', 'accounts'] });
    },
  });
}

// ── Agreement hooks ──────────────────────────────────────────────────────────

export function useAgreements(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['consignment', 'agreements', params],
    queryFn: async () => {
      const { data } = await getAgreements(params);
      return data;
    },
  });
}

export function useCreateAgreement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createAgreement(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consignment', 'agreements'] });
    },
  });
}

export function useUpdateAgreement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const { data: result } = await updateAgreement(id, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consignment', 'agreements'] });
    },
  });
}

export function useDeleteAgreement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await deleteAgreement(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consignment', 'agreements'] });
    },
  });
}

export function useConsignmentItems(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['consignment', 'items', params],
    queryFn: async () => {
      const { data } = await getConsignmentItems(params);
      return data;
    },
  });
}

export function usePayouts(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['consignment', 'payouts', params],
    queryFn: async () => {
      const { data } = await getPayouts(params);
      return data;
    },
  });
}

export function useGeneratePayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await generatePayout(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consignment', 'payouts'] });
    },
  });
}

export function useMarkPayoutPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await markPayoutPaid(id, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consignment', 'payouts'] });
    },
  });
}

export function useMyItems() {
  return useQuery({
    queryKey: ['consignment', 'my', 'items'],
    queryFn: async () => {
      const { data } = await getMyItems();
      return data;
    },
  });
}

export function useMyPayouts() {
  return useQuery({
    queryKey: ['consignment', 'my', 'payouts'],
    queryFn: async () => {
      const { data } = await getMyPayouts();
      return data;
    },
  });
}

export function useMySummary() {
  return useQuery({
    queryKey: ['consignment', 'my', 'summary'],
    queryFn: async () => {
      const { data } = await getMySummary();
      return data;
    },
  });
}
