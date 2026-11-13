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
  kind: 'note' | 'edit' | 'closed' | 'reopened' | 'photo' | 'ai_review';
  body: string;
  /** An edit: {field: {old, new}}. An AI review keeps its own shape (see IncidentReviewNoteChanges). */
  changes: Record<string, { old: unknown; new: unknown }> | IncidentReviewNoteChanges;
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

/** The boxes the AI review may tidy (#133). */
export type IncidentTextField = 'place_detail' | 'what_happened' | 'injuries' | 'witnesses' | 'cameras' | 'follow_up';

export interface IncidentReviewNoteChanges {
  model: string;
  done: boolean;
  fields: Partial<Record<IncidentTextField, { old: string; new: string; choice: '' | 'kept' | 'reverted' }>>;
  questions: { field: IncidentTextField; question: string; answer: string }[];
}

/** The report's open AI review (#133). `now` says which text the box holds: the original, the tidied, or neither. */
export interface IncidentReview {
  id: number;
  created_at: string;
  author_name: string;
  fields: {
    field: IncidentTextField;
    old: string;
    new: string;
    choice: '' | 'kept' | 'reverted';
    now: 'old' | 'new' | 'changed';
  }[];
  questions: { index: number; field: IncidentTextField; question: string; answer: string }[];
}

export interface IncidentDetail extends IncidentSummary {
  witnesses: string;
  cameras: string;
  follow_up: string;
  map_pin: (IncidentSpot & { id: number }) | null;
  photos: number[];
  notes: IncidentNoteDTO[];
  ai_review: IncidentReview | null;
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

// AI review (#133). `lang` picks the words for the questions and the history lines.
type Lang = 'en' | 'es';

export const runIncidentReview = (id: number, lang: Lang) =>
  api.post<IncidentDetail>(`${BASE}/${id}/ai-review/`, { lang }, { timeout: 90_000 });

export const decideIncidentReview = (id: number, choice: 'keep' | 'revert', field: IncidentTextField | null, lang: Lang) =>
  api.post<IncidentDetail & { skipped: number }>(`${BASE}/${id}/ai-review/decide/`, { choice, field, lang });

export const answerIncidentReview = (id: number, index: number, answer: string, lang: Lang) =>
  api.post<IncidentDetail>(`${BASE}/${id}/ai-review/answer/`, { index, answer, lang });

export const finishIncidentReview = (id: number) => api.post<IncidentDetail>(`${BASE}/${id}/ai-review/done/`, {});
