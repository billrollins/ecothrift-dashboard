import type { PaginatedResponse } from '../types/common.types';
import type { FloorPlanDetail, FloorPlanListItem, PlanDocument } from '../types/floorplan.types';
import api from './client';

export function getFloorPlans(params?: { location?: number; page?: number; page_size?: number }) {
  return api.get<PaginatedResponse<FloorPlanListItem>>('/floorplan/plans/', { params });
}

export function getFloorPlan(id: number) {
  return api.get<FloorPlanDetail>(`/floorplan/plans/${id}/`);
}

export function createFloorPlan(data: { name: string; location: number }) {
  return api.post<FloorPlanDetail>('/floorplan/plans/', data);
}

/**
 * Save plan content. `revision` must be the revision the client loaded;
 * a stale revision returns HTTP 409 with `{ code: 'revision_conflict', current_revision }`.
 */
export function saveFloorPlan(id: number, data: PlanDocument, revision: number) {
  return api.patch<FloorPlanDetail>(`/floorplan/plans/${id}/`, { data, revision });
}

export function renameFloorPlan(id: number, name: string) {
  return api.patch<FloorPlanDetail>(`/floorplan/plans/${id}/`, { name });
}

export function deleteFloorPlan(id: number) {
  return api.delete(`/floorplan/plans/${id}/`);
}
