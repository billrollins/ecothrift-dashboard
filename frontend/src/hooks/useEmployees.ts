import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getUsers,
  getUser,
  createUser,
  updateUser,
  updateEmployeeProfile,
} from '../api/accounts.api';
import type { UserParams } from '../api/accounts.api';

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
