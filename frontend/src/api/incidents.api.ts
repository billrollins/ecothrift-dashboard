/** Incident reports (Dash Updates #131): HR -> Incidents. Backend: apps/hr/incident_views.py. */
import api from './client';

const BASE = '/hr/incidents';

export type IncidentKind =
  | 'fall' | 'injury' | 'health' | 'vehicle' | 'animal' | 'conduct' | 'theft' | 'damage' | 'other';
export type IncidentPlace =
  | 'sales_floor' | 'checkout' | 'entrance' | 'restroom' | 'back' | 'break_room' | 'stairs' | 'dock'
  | 'parking' | 'outside' | 'other';
export type IncidentRole = 'customer' | 'visitor' | 'staff' | 'vendor' | 'other';

export interface IncidentPerson {
  role: IncidentRole;
  name: string;
  contact: string;
}

export interface IncidentSpot {
  plan: number;
  x: number;
  y: number;
}

export interface IncidentNoteDTO {
  id: number;
  kind: 'note' | 'edit' | 'closed' | 'reopened' | 'photo';
  body: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  author_name: string;
  created_at: string;
}

export interface IncidentSummary {
  id: number;
  occurred_at: string;
  kind: IncidentKind;
  kind_label: string;
  place: IncidentPlace;
  place_label: string;
  place_detail: string;
  people: IncidentPerson[];
  what_happened: string;
  injuries: string;
  first_aid: boolean;
  called_911: boolean;
  status: 'open' | 'closed';
  reported_by: number;
  reported_by_name: string;
  created_at: string;
  closed_by_name: string;
  closed_at: string | null;
  photo_count: number;
  note_count: number;
}

export interface IncidentDetail extends IncidentSummary {
  witnesses: string;
  cameras: string;
  follow_up: string;
  map_pin: (IncidentSpot & { id: number }) | null;
  photos: number[];
  notes: IncidentNoteDTO[];
}

/** What the form sends. `map` undefined = leave the spot as it is; null = no spot. */
export interface IncidentWrite {
  occurred_at: string;
  kind: IncidentKind;
  place: IncidentPlace;
  place_detail: string;
  people: IncidentPerson[];
  what_happened: string;
  injuries: string;
  first_aid: boolean;
  called_911: boolean;
  witnesses: string;
  cameras: string;
  follow_up: string;
  map?: IncidentSpot | null;
}

export const getIncidents = (status?: 'open' | 'closed') =>
  api.get<{ can_manage: boolean; reports: IncidentSummary[] }>(`${BASE}/`, { params: status ? { status } : {} });

export const getIncident = (id: number) => api.get<IncidentDetail>(`${BASE}/${id}/`);

export function createIncident(payload: IncidentWrite, photos: File[]) {
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) return;
    if (key === 'people' || key === 'map') form.append(key, value === null ? '' : JSON.stringify(value));
    else form.append(key, String(value));
  });
  photos.forEach((file) => form.append('photos', file));
  return api.post<IncidentDetail>(`${BASE}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
}

export const updateIncident = (id: number, payload: Partial<IncidentWrite>) =>
  api.patch<IncidentDetail>(`${BASE}/${id}/`, payload);

export const addIncidentNote = (id: number, body: string) =>
  api.post<IncidentDetail>(`${BASE}/${id}/notes/`, { body });

export function addIncidentPhotos(id: number, photos: File[]) {
  const form = new FormData();
  photos.forEach((file) => form.append('photos', file));
  return api.post<IncidentDetail>(`${BASE}/${id}/photos/`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
}

export const setIncidentStatus = (id: number, action: 'close' | 'reopen', note = '') =>
  api.post<IncidentDetail>(`${BASE}/${id}/${action}/`, { note });

export const getIncidentPhoto = (id: number, photoId: number) =>
  api.get<Blob>(`${BASE}/${id}/photos/${photoId}/`, { responseType: 'blob' });
