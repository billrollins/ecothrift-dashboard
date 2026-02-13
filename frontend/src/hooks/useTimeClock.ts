import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCurrentEntry,
  createTimeEntry,
  clockOut,
} from '../api/hr.api';

export function useCurrentEntry() {
  return useQuery({
    queryKey: ['timeClock', 'current'],
    queryFn: async () => {
      const { data } = await getCurrentEntry();
      return data;
    },
  });
}

export function useClockIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data?: Record<string, unknown>) => {
      const { data: result } = await createTimeEntry(data ?? {});
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeClock', 'current'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}

export function useClockOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      breakMinutes,
    }: {
      id: number;
      breakMinutes?: number;
    }) => {
      const { data } = await clockOut(id, breakMinutes);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeClock', 'current'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}
