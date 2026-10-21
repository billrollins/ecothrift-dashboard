import type { PaginatedResponse } from '../types/index';
import api, { apiPublic, getAccessToken } from './client';

/** Work location (store) - matches `WorkLocation` on the backend */
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

/** Always a plain array, even if a cached or paginated payload sneaks in. */
export function asSettingRows(data: unknown): Setting[] {
  if (Array.isArray(data)) return data as Setting[];
  if (data && typeof data === 'object' && Array.isArray((data as PaginatedResponse<Setting>).results)) {
    return (data as PaginatedResponse<Setting>).results;
  }
  return [];
}

// Settings endpoints
export async function getSettings(): Promise<{ data: Setting[] }> {
  const { data } = await api.get<Setting[] | PaginatedResponse<Setting>>('/core/settings/');
  return { data: asSettingRows(data) };
}

export function updateSetting(key: string, data: Record<string, unknown>): Promise<{ data: Setting }> {
  return api.patch<Setting>(`/core/settings/${encodeURIComponent(key)}/`, data);
}

/** A setting's changes, newest first (the Settings page's Undo puts back `old_value`). */
export interface SettingChange {
  key: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string;
  changed_at: string;
}

export async function getSettingHistory(key: string): Promise<SettingChange[]> {
  const { data } = await api.get<SettingChange[]>('/core/settings/history/', { params: { key } });
  return data;
}

export function createSetting(data: { key: string; value: unknown; description?: string }): Promise<{ data: Setting }> {
  return api.post<Setting>('/core/settings/', data);
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

/** DEBUG only - resolved targets from `.ai/debug/log.config` */
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


/** Owner's error alerts (critic review 2026-10-21, point 8): server 500s and screen crashes. */
export interface AppErrorRow {
  id: number;
  source: 'server' | 'screen';
  message: string;
  path: string;
  method: string;
  user: string | null;
  version: string;
  seen: boolean;
  created_at: string;
}

export interface AppErrorSummary {
  /** Not yet marked seen. */
  open_count: number;
  last_24h: number;
  last_7d: number;
  /** Newest first. */
  latest: AppErrorRow[];
}

/** Superuser only. */
export function getAppErrors(limit = 10): Promise<{ data: AppErrorSummary }> {
  return api.get<AppErrorSummary>('/core/errors/', { params: { limit } });
}

/** Superuser only. Clears the open count. */
export function markAppErrorsSeen(): Promise<{ data: AppErrorSummary }> {
  return api.post<AppErrorSummary>('/core/errors/seen/');
}

export interface ScreenErrorReport {
  message: string;
  stack?: string;
  component_stack?: string;
  path?: string;
  version?: string;
}

/**
 * A screen crash for the owner's error alerts. Sent without the auth client's interceptors (a crash must not start a
 * token refresh or a sign-in bounce); the current token rides along so the report names who saw it.
 */
export function reportScreenError(report: ScreenErrorReport): Promise<unknown> {
  const token = getAccessToken();
  return apiPublic.post('/core/errors/report/', report, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
}
