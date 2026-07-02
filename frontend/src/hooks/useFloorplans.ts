import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as floorplanApi from '../api/floorplan.api';
import type { PlanDocument } from '../types/floorplan.types';

export function useFloorPlans(params?: { location?: number }) {
  return useQuery({
    queryKey: ['floorplans', params],
    queryFn: () => floorplanApi.getFloorPlans(params).then((r) => r.data),
  });
}

export function useFloorPlan(id: number | null) {
  return useQuery({
    queryKey: ['floorplan', id],
    queryFn: () => floorplanApi.getFloorPlan(id as number).then((r) => r.data),
    enabled: id != null,
    // The editor owns the document once loaded; never refetch underneath it.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useCreateFloorPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; location: number }) =>
      floorplanApi.createFloorPlan(data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['floorplans'] }),
  });
}

export function useSaveFloorPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, revision }: { id: number; data: PlanDocument; revision: number }) =>
      floorplanApi.saveFloorPlan(id, data, revision).then((r) => r.data),
    onSuccess: (result) => {
      queryClient.setQueryData(['floorplan', result.id], result);
      queryClient.invalidateQueries({ queryKey: ['floorplans'] });
    },
  });
}

export function useRenameFloorPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      floorplanApi.renameFloorPlan(id, name).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['floorplans'] }),
  });
}

export function useDeleteFloorPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => floorplanApi.deleteFloorPlan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['floorplans'] }),
  });
}
