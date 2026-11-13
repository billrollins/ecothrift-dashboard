import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as floorplanApi from '../api/floorplan.api';
import type { MapPin, MapPinPayload, PlanDocument } from '../types/floorplan.types';

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
      // Saving sweeps orphaned images server-side - refresh the asset library
      queryClient.invalidateQueries({ queryKey: ['floorplan-assets'] });
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

export function useMakeFloorPlanCurrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => floorplanApi.makeFloorPlanCurrent(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['floorplans'] });
      queryClient.invalidateQueries({ queryKey: ['store-map'] });
    },
  });
}

// ── Store map (#105) ─────────────────────────────────────────────────────────

export function useStoreMap(location?: number) {
  return useQuery({
    queryKey: ['store-map', location ?? null],
    queryFn: () => floorplanApi.getStoreMap(location ? { location } : undefined).then((r) => r.data),
  });
}

/** Pin writes refresh the store map and any per-thing pin lists (a sign's pins). */
function invalidatePins(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['store-map'] });
  queryClient.invalidateQueries({ queryKey: ['map-pins'] });
}

export function useCreateMapPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: MapPinPayload) => floorplanApi.createMapPin(payload).then((r) => r.data),
    onSuccess: () => invalidatePins(queryClient),
  });
}

export function useUpdateMapPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Partial<Pick<MapPin, 'x' | 'y' | 'name' | 'note' | 'ref_id' | 'status'>>) =>
      floorplanApi.updateMapPin(id, payload).then((r) => r.data),
    onSuccess: () => invalidatePins(queryClient),
  });
}

export function useDeleteMapPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => floorplanApi.deleteMapPin(id),
    onSuccess: () => invalidatePins(queryClient),
  });
}
