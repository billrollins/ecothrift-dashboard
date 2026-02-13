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

export function useTimeSummary(params?: TimeEntryParams) {
  return useQuery({
    queryKey: ['timeSummary', params],
    queryFn: () => hrApi.getTimeSummary(params).then((r) => r.data),
  });
}
