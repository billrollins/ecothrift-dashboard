import type { PaginatedResponse } from '../types/common.types';
import type { FloorPlanAsset } from '../types/floorplan.types';
import api from './client';

export function getFloorPlanAssets(params?: { location?: number; page?: number; page_size?: number }) {
  return api.get<PaginatedResponse<FloorPlanAsset>>('/floorplan/assets/', { params });
}

export function uploadFloorPlanAsset(input: { file: File; name?: string; location?: number | null }) {
  const form = new FormData();
  form.append('file', input.file);
  if (input.name) form.append('name', input.name);
  if (input.location != null) form.append('location', String(input.location));
  return api.post<FloorPlanAsset>('/floorplan/assets/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function deleteFloorPlanAsset(id: number) {
  return api.delete(`/floorplan/assets/${id}/`);
}
