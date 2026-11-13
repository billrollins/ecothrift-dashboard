import type { PaginatedResponse } from '../types/common.types';
import type {
  FloorPlanDetail,
  FloorPlanElementKind,
  FloorPlanElementKindPayload,
  FloorPlanListItem,
  MapPin,
  MapPinPayload,
  PlanDocument,
  StoreMapResponse,
} from '../types/floorplan.types';
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

/** Superuser: make this plan its location's Current plan. Pins on the old Current plan move to it. */
export function makeFloorPlanCurrent(id: number) {
  return api.post<FloorPlanListItem & { pins_moved: number }>(`/floorplan/plans/${id}/make-current/`);
}

// ── Store map (#105) ─────────────────────────────────────────────────────────

export function getStoreMap(params?: { location?: number }) {
  return api.get<StoreMapResponse>('/floorplan/store-map/', { params });
}

export function getMapPins(params: { plan?: number; layer?: number | string; ref_type?: string; ref_id?: number }) {
  return api.get<MapPin[]>('/floorplan/pins/', { params });
}

export function createMapPin(payload: MapPinPayload) {
  return api.post<MapPin>('/floorplan/pins/', payload);
}

export function updateMapPin(id: number, payload: Partial<Pick<MapPin, 'x' | 'y' | 'name' | 'note' | 'ref_id' | 'status'>>) {
  return api.patch<MapPin>(`/floorplan/pins/${id}/`, payload);
}

export function deleteMapPin(id: number) {
  return api.delete(`/floorplan/pins/${id}/`);
}

// ── Element kinds (palette catalog) ──────────────────────────────────────────

export function getFloorPlanElementKinds(params?: { page?: number; page_size?: number }) {
  return api.get<PaginatedResponse<FloorPlanElementKind>>('/floorplan/element-kinds/', { params });
}

export function createFloorPlanElementKind(payload: FloorPlanElementKindPayload) {
  return api.post<FloorPlanElementKind>('/floorplan/element-kinds/', payload);
}

export function updateFloorPlanElementKind(id: number, payload: Partial<FloorPlanElementKindPayload>) {
  return api.patch<FloorPlanElementKind>(`/floorplan/element-kinds/${id}/`, payload);
}

export function deleteFloorPlanElementKind(id: number) {
  return api.delete(`/floorplan/element-kinds/${id}/`);
}
