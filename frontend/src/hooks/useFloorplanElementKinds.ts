import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as floorplanApi from '../api/floorplan.api';
import type { FloorPlanElementKindPayload } from '../types/floorplan.types';

export const elementKindsQueryKey = ['floorplan-element-kinds'] as const;

export function useFloorPlanElementKinds() {
  return useQuery({
    queryKey: elementKindsQueryKey,
    queryFn: () =>
      floorplanApi
        .getFloorPlanElementKinds({ page_size: 200 })
        .then((r) => r.data.results),
    staleTime: 60_000,
  });
}

// Kind writes trigger a server-side orphan-image sweep, so the asset library
// is refreshed alongside the catalog.
function invalidateKindQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: elementKindsQueryKey });
  queryClient.invalidateQueries({ queryKey: ['floorplan-assets'] });
}

export function useCreateFloorPlanElementKind() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FloorPlanElementKindPayload) =>
      floorplanApi.createFloorPlanElementKind(payload).then((r) => r.data),
    onSuccess: () => invalidateKindQueries(queryClient),
  });
}

export function useUpdateFloorPlanElementKind() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<FloorPlanElementKindPayload> }) =>
      floorplanApi.updateFloorPlanElementKind(id, payload).then((r) => r.data),
    onSuccess: () => invalidateKindQueries(queryClient),
  });
}

export function useDeleteFloorPlanElementKind() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => floorplanApi.deleteFloorPlanElementKind(id),
    onSuccess: () => invalidateKindQueries(queryClient),
  });
}
