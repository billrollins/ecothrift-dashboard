import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as hrApi from '../api/hr.api';
import type { TimeEntryParams } from '../api/hr.api';

export function useTimeEntries(params?: TimeEntryParams) {
  return useQuery({
    queryKey: ['timeEntries', params],
    queryFn: () => hrApi.getTimeEntries(params).then((r) => r.data),
  });
}

export function useApproveEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => hrApi.approveEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}

export function useBulkApprove() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => hrApi.bulkApprove(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      hrApi.updateTimeEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => hrApi.deleteTimeEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}

export function useTimeSummary(params?: TimeEntryParams) {
  return useQuery({
    queryKey: ['timeSummary', params],
    queryFn: () => hrApi.getTimeSummary(params).then((r) => r.data),
  });
}

// Modification request hooks
export function useModificationRequests(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['modRequests', params],
    queryFn: () => hrApi.getModificationRequests(params).then((r) => r.data),
  });
}

export function useCreateModificationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      hrApi.createModificationRequest(data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modRequests'] });
    },
  });
}

export function useApproveModificationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reviewNote }: { id: number; reviewNote?: string }) =>
      hrApi.approveModificationRequest(id, reviewNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modRequests'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}

export function useDenyModificationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reviewNote }: { id: number; reviewNote?: string }) =>
      hrApi.denyModificationRequest(id, reviewNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modRequests'] });
    },
  });
}
