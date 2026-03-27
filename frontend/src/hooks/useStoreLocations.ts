import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} from '../api/core.api';

export function useWorkLocations(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['workLocations', params],
    queryFn: async () => {
      const { data } = await getLocations({ page_size: 200, ...params });
      return data;
    },
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => createLocation(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workLocations'] }),
  });
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      updateLocation(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workLocations'] }),
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLocation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workLocations'] }),
  });
}
