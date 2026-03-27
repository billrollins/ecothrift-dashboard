import type { PaginatedResponse } from '../types/index';
import api from './client';

/** Work location (store) — matches `WorkLocation` on the backend */
export interface WorkLocation {
  id: number;
  name: string;
  address: string;
  phone: string;
  timezone: string;
  is_active: boolean;
  created_at?: string;
}

export interface Setting {
  key: string;
  value: unknown;
  [key: string]: unknown;
}

// Location endpoints
export function getLocations(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<WorkLocation> }> {
  return api.get<PaginatedResponse<WorkLocation>>('/core/locations/', { params });
}

export function createLocation(data: Record<string, unknown>): Promise<{ data: WorkLocation }> {
  return api.post<WorkLocation>('/core/locations/', data);
}

export function updateLocation(id: number, data: Record<string, unknown>): Promise<{ data: WorkLocation }> {
  return api.patch<WorkLocation>(`/core/locations/${id}/`, data);
}

export function deleteLocation(id: number): Promise<{ data: void }> {
  return api.delete(`/core/locations/${id}/`);
}

// Settings endpoints
export function getSettings(): Promise<{ data: Setting[] }> {
  return api.get<Setting[]>('/core/settings/');
}

export function updateSetting(key: string, data: Record<string, unknown>): Promise<{ data: Setting }> {
  return api.patch<Setting>(`/core/settings/${encodeURIComponent(key)}/`, data);
}

// App version endpoint
export interface AppVersion {
  version: string;
  build_date: string | null;
  description: string;
}

export function getAppVersion(): Promise<{ data: AppVersion }> {
  return api.get<AppVersion>('/core/system/version/');
}

// Print server endpoints
export function getPrintServerVersion(): Promise<{ data: Record<string, unknown> }> {
  return api.get('/core/system/print-server-version/');
}

export function getPrintServerReleases(): Promise<{ data: unknown[] }> {
  return api.get('/core/system/print-server-releases/');
}

/** DEBUG only — resolved targets from `.ai/debug/log.config` */
export interface DevLogConfigResponse {
  enabled: boolean;
  areas: Record<string, string[]>;
}

export function getDevLogConfig(): Promise<{ data: DevLogConfigResponse }> {
  return api.get<DevLogConfigResponse>('/core/dev-log/config/');
}

export function postDevLogLine(payload: { area: string; message: string }): Promise<{ data: { ok: boolean } }> {
  return api.post<{ ok: boolean }>('/core/dev-log/line/', payload);
}
