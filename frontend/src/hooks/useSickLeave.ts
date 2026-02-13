import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSickLeaveBalances,
  getSickLeaveRequests,
  createSickLeaveRequest,
  approveSickLeave,
  denySickLeave,
} from '../api/hr.api';

export function useSickLeaveBalances(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['sickLeave', 'balances', params],
    queryFn: async () => {
      const { data } = await getSickLeaveBalances(params);
      return data;
    },
  });
}

export function useSickLeaveRequests(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['sickLeave', 'requests', params],
    queryFn: async () => {
      const { data } = await getSickLeaveRequests(params);
      return data;
    },
  });
}

export function useCreateSickLeaveRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result } = await createSickLeaveRequest(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sickLeave'] });
    },
  });
}

export function useApproveSickLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      reviewNote,
    }: {
      id: number;
      reviewNote?: string;
    }) => {
      const { data } = await approveSickLeave(id, reviewNote);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sickLeave'] });
    },
  });
}

export function useDenySickLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      reviewNote,
    }: {
      id: number;
      reviewNote?: string;
    }) => {
      const { data } = await denySickLeave(id, reviewNote);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sickLeave'] });
    },
  });
}
