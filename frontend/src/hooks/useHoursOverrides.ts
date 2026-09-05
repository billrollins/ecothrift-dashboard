import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse } from '../types';
import {
  createHoursOverride,
  deleteHoursOverride,
  getHoursOverrides,
  updateHoursOverride,
  type StoreHoursOverride,
  type StoreHoursOverrideWrite,
} from '../api/webstore.api';

const LIST_KEY = ['hours-overrides'];

function unwrapList(
  data: PaginatedResponse<StoreHoursOverride> | StoreHoursOverride[],
): StoreHoursOverride[] {
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export function useHoursOverrides() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => unwrapList((await getHoursOverrides()).data),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: LIST_KEY }),
    queryClient.invalidateQueries({ queryKey: ['settings'] }),
  ]);
}

export function useCreateHoursOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StoreHoursOverrideWrite) => createHoursOverride(data).then((r) => r.data),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateHoursOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: StoreHoursOverrideWrite }) =>
      updateHoursOverride(id, data).then((r) => r.data),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteHoursOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteHoursOverride(id),
    onSuccess: () => invalidate(queryClient),
  });
}
