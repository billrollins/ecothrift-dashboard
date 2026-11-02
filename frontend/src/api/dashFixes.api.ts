import type { DashFixDTO, DashFixReport } from '../types/dashFixes.types';
import api from './client';

const BASE = '/core/dash-fixes';

export const getDashFixes = () => api.get<DashFixDTO[]>(`${BASE}/`);

export function createDashFix(payload: DashFixReport) {
  const form = new FormData();
  form.append('details', payload.details);
  form.append('page_path', payload.page_path);
  if (payload.private) form.append('private', 'true');
  (payload.photos ?? []).slice(0, 3).forEach((file) => form.append('photos', file));
  return api.post<DashFixDTO>(`${BASE}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
}

export const addDashFixNote = (id: number, body: string) =>
  api.post<DashFixDTO>(`${BASE}/${id}/notes/`, { body });

export const getDashFixCount = () => api.get<{ count: number }>(`${BASE}/counts/`);
export const markDashFixesSeen = () => api.post<{ count: number }>(`${BASE}/seen/`);

export const getDashFixPhoto = (id: number, photoId: number) =>
  api.get<Blob>(`${BASE}/${id}/photos/${photoId}/`, { responseType: 'blob' });

// Owner only.
export const acceptDashFix = (id: number) => api.post<DashFixDTO>(`${BASE}/${id}/accept/`);
export const declineDashFix = (id: number, reason: string) =>
  api.post<DashFixDTO>(`${BASE}/${id}/decline/`, { reason });
export const startDashFix = (id: number) => api.post<DashFixDTO>(`${BASE}/${id}/working/`);
export const finishDashFix = (id: number, version: string) =>
  api.post<DashFixDTO>(`${BASE}/${id}/done/`, { version });
export const setDashFixPrivate = (id: number, value: boolean) =>
  api.post<DashFixDTO>(`${BASE}/${id}/private/`, { private: value });
export const answerDashFix = (id: number, answer: string) =>
  api.post<DashFixDTO>(`${BASE}/${id}/answer/`, { answer });
export const reorderDashFixes = (ids: number[]) => api.post<DashFixDTO[]>(`${BASE}/reorder/`, { ids });

export interface DashFixCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Working/done tasks that wait on something not done (allowed only with "apply anyway"). */
  blocked: string[];
  changes: string[];
}
export const getDashFixBundle = () => api.get<Record<string, unknown>>(`${BASE}/export/`);
export const checkDashFixDoc = (doc: unknown, allowBlocked: boolean) =>
  api.post<DashFixCheck>(`${BASE}/import-check/`, { doc, allow_blocked: allowBlocked });
export const saveDashFixDoc = (doc: unknown, allowBlocked: boolean) =>
  api.post<{ ok: boolean; changes: string[]; warnings: string[] }>(`${BASE}/import/`, { doc, allow_blocked: allowBlocked });
