import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as assetsApi from '../api/floorplanAssets.api';

export function useFloorPlanAssets(params?: { location?: number }) {
  return useQuery({
    queryKey: ['floorplan-assets', params],
    queryFn: () =>
      assetsApi
        .getFloorPlanAssets({ ...params, page_size: 200 })
        .then((r) => r.data.results),
  });
}

export function useUploadFloorPlanAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File; name?: string; location?: number | null }) =>
      assetsApi.uploadFloorPlanAsset(input).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['floorplan-assets'] }),
  });
}

export function useDeleteFloorPlanAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assetsApi.deleteFloorPlanAsset(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['floorplan-assets'] }),
  });
}
