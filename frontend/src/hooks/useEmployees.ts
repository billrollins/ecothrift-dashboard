import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getUsers,
  getUser,
  createUser,
  updateUser,
  updateEmployeeProfile,
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  reactivateCustomer,
  sendCustomerSignInLink,
  sendCustomerPasswordReset,
  sendEmployeePasswordReset,
  getCustomerStats,
  getCustomerRollup,
  getEmployeeStats,
  lookupCustomer,
} from '../api/accounts.api';
import type { UserParams, Customer } from '../api/accounts.api';

export function useUsers(params?: UserParams) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: async () => {
      const { data } = await getUsers(params);
      return data;
    },
  });
}

export function useUser(id: number | null) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getUser(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createUser(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Record<string, unknown>;
    }) => {
      const { data: result } = await updateUser(id, data);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', variables.id] });
    },
  });
}

export function useUpdateEmployeeProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      data,
    }: {
      userId: number;
      data: Record<string, unknown>;
    }) => {
      await updateEmployeeProfile(userId, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', variables.userId] });
    },
  });
}

// ── Customer hooks ───────────────────────────────────────────────────────────

export function useCustomers(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: async () => {
      const { data } = await getCustomers(params);
      return data;
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useCustomer(id: number | null) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getCustomer(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createCustomer(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const { data: result } = await updateCustomer(id, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await deleteCustomer(id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useReactivateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await reactivateCustomer(id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useSendCustomerSignInLink() {
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await sendCustomerSignInLink(id);
      return data;
    },
  });
}

export function useSendCustomerPasswordReset() {
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await sendCustomerPasswordReset(id);
      return data;
    },
  });
}

export function useSendEmployeePasswordReset() {
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await sendEmployeePasswordReset(id);
      return data;
    },
  });
}

export function useCustomerRollup(id: number | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['customers', id, 'rollup'],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await getCustomerRollup(id);
      return data;
    },
    enabled: (options?.enabled ?? true) && id != null,
  });
}

// ── Stats strip ──────────────────────────────────────────────────────────────

export function useCustomerStats(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['customers', 'stats'],
    queryFn: async () => {
      const { data } = await getCustomerStats();
      return data;
    },
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useEmployeeStats(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['users', 'stats'],
    queryFn: async () => {
      const { data } = await getEmployeeStats();
      return data;
    },
    enabled: options?.enabled ?? true,
    // Who is clocked in changes through the day.
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useLookupCustomer() {
  return useMutation({
    mutationFn: async (customerNumber: string) => {
      const { data } = await lookupCustomer(customerNumber);
      return data as Customer;
    },
  });
}
