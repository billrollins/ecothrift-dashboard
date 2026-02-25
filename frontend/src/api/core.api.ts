import api from './client';

// Core types
export interface Location {
  id: number;
  [key: string]: unknown;
}

export interface Setting {
  key: string;
  value: unknown;
  [key: string]: unknown;
}

// Location endpoints
export function getLocations(): Promise<{ data: Location[] }> {
  return api.get<Location[]>('/core/locations/');
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
