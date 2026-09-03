import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCurrentEntry,
  createTimeEntry,
  setTimeEntryShift,
  clockOut,
  startBreak,
  endBreak,
  getWeeklyHoursStatus,
  getMyPay,
} from '../api/hr.api';

export function useCurrentEntry() {
  return useQuery({
    queryKey: ['timeClock', 'current'],
    queryFn: async () => {
      const { data } = await getCurrentEntry();
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useWeeklyHoursStatus() {
  return useQuery({
    queryKey: ['timeClock', 'weeklyStatus'],
    queryFn: async () => {
      const { data } = await getWeeklyHoursStatus();
      return data;
    },
    refetchInterval: 60_000,
  });
}

export function useMyPay(count = 6) {
  return useQuery({
    queryKey: ['timeClock', 'myPay'],
    queryFn: async () => {
      const { data } = await getMyPay(count);
      return data;
    },
    staleTime: 60_000,
  });
}

function invalidateTimeClock(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['timeClock'] });
  queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
  queryClient.invalidateQueries({ queryKey: ['tars-bench-jobs'] });
  queryClient.invalidateQueries({ queryKey: ['routines', 'today'] });
}

export function useClockIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data?: Record<string, unknown>) => {
      const { data: result } = await createTimeEntry(data ?? {});
      return result;
    },
    onSuccess: () => invalidateTimeClock(queryClient),
  });
}

export function useSetShift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, shift }: { id: number; shift: string }) => {
      const { data } = await setTimeEntryShift(id, shift);
      return data;
    },
    onSuccess: () => invalidateTimeClock(queryClient),
  });
}

export function useClockOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const { data } = await clockOut(id);
      return data;
    },
    onSuccess: () => invalidateTimeClock(queryClient),
  });
}

export function useStartBreak() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await startBreak(id);
      return data;
    },
    onSuccess: () => invalidateTimeClock(queryClient),
  });
}

export function useEndBreak() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await endBreak(id);
      return data;
    },
    onSuccess: () => invalidateTimeClock(queryClient),
  });
}
