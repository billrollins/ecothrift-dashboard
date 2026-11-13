import type { PaginatedResponse } from '../types/common.types';
import type {
  CurrentChangeResult,
  CurrentPreview,
  FloorPlanDetail,
  FloorPlanElementKind,
  FloorPlanElementKindPayload,
  FloorPlanListItem,
  MapPin,
  MapPinPayload,
  PinTransform,
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

/** One store (#130): the server puts a new plan in it. */
export function createFloorPlan(data: { name: string; location?: number }) {
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

/** Superuser (#130): what Make current would do (where the pins come from, sizes, whether to line them up). */
export function getCurrentPreview(id: number) {
  return api.get<CurrentPreview>(`/floorplan/plans/${id}/current-preview/`);
}

/**
 * Superuser: make this plan the Current plan. The old one stays as a past version with its pins; this plan gets a
 * copy (through `transform` when the sizes differ, else HTTP 409 `align_required`).
 */
export function makeFloorPlanCurrent(id: number, transform?: PinTransform) {
  return api.post<CurrentChangeResult>(`/floorplan/plans/${id}/make-current/`, transform ? { transform } : {});
}

/** Superuser (#130): the plan stops being Current; it keeps its pins. */
export function unsetFloorPlanCurrent(id: number) {
  return api.post<CurrentChangeResult>(`/floorplan/plans/${id}/unset-current/`);
}

// ── Store map (#105) ─────────────────────────────────────────────────────────

/** `plan` = a past version to show instead of the Current plan (#130). */
export function getStoreMap(params?: { plan?: number }) {
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
