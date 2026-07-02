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

export function useCreateFloorPlanElementKind() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FloorPlanElementKindPayload) =>
      floorplanApi.createFloorPlanElementKind(payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: elementKindsQueryKey }),
  });
}

export function useUpdateFloorPlanElementKind() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<FloorPlanElementKindPayload> }) =>
      floorplanApi.updateFloorPlanElementKind(id, payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: elementKindsQueryKey }),
  });
}

export function useDeleteFloorPlanElementKind() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => floorplanApi.deleteFloorPlanElementKind(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: elementKindsQueryKey }),
  });
}
