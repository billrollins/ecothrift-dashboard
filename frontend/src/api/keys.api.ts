import api from './client';

/** Keys and key rings (`apps/keys`, owner and Admin only). Key photos show the cuts: signed links only. */
export type KeyType = '' | 'house' | 'padlock' | 'cabinet' | 'car' | 'mailbox' | 'safe' | 'other';
export const KEY_TYPES: Exclude<KeyType, ''>[] = ['house', 'padlock', 'cabinet', 'car', 'mailbox', 'safe', 'other'];

/** Where a ring is now: out with someone (its last check-out), or home. */
export interface RingWhere {
  status: 'out' | 'home';
  person: string;
  location: string;
  since: string | null;
  note: string;
}

/** What the AI read from a key photo; each is editable. */
export interface KeyMetrics {
  key_type: KeyType;
  keyway: string;
  head_shape: string;
  brand: string;
  stamped_code: string;
  cut_count: number | null;
  /** Head to tip, 0 shallow to 9 deep, e.g. "3-5-2-4-6". */
  cut_depths: string;
}

export interface KeyRow extends KeyMetrics {
  id: number;
  name: string;
  notes: string;
  ring_id: number | null;
  ring_name: string;
  photo_url: string | null;
  thumbnail_url: string | null;
  metrics_model: string;
  metrics_at: string | null;
  where: RingWhere | null;
  created_at: string;
  /** After a save with a photo: why the AI read failed, else ''. */
  ai_error?: string;
}

export interface RingRow {
  id: number;
  name: string;
  notes: string;
  home_location: string;
  home_person_id: number | null;
  home_person_name: string;
  key_count: number;
  where: RingWhere;
}

export interface RingMove {
  id: number;
  kind: 'out' | 'in';
  person: string;
  location: string;
  note: string;
  moved_by: string;
  moved_at: string;
}

export interface RingDetail extends RingRow {
  keys: KeyRow[];
  moves: RingMove[];
}

export interface FindResult {
  metrics: KeyMetrics & { is_key: boolean };
  model: string;
  candidates: Array<{ number: number; score: number; key: KeyRow }>;
  /** The grid number the AI picked, or null for no match. */
  answer: number | null;
  reason: string;
  /** The numbered 3x3 grid the AI saw (a JPEG data URL), or null. */
  grid: string | null;
}

export interface Person {
  id: number;
  name: string;
}

export interface KeyInput {
  name?: string;
  notes?: string;
  ring?: number | null;
  photo?: Blob | null;
}

function keyForm(input: KeyInput & Partial<KeyMetrics>): FormData {
  const form = new FormData();
  for (const [field, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (field === 'photo') {
      if (value) form.append('photo', value as Blob, 'key.jpg');
    } else {
      form.append(field, value == null ? '' : String(value));
    }
  }
  return form;
}

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

export const fetchKeys = (params: { q?: string; ring?: number | 'none' } = {}) =>
  api.get<{ keys: KeyRow[] }>('/keys/keys/', { params }).then((r) => r.data.keys);

export const createKey = (input: KeyInput) =>
  api.post<KeyRow>('/keys/keys/', keyForm(input), MULTIPART).then((r) => r.data);

export const updateKey = (id: number, input: KeyInput & Partial<KeyMetrics>) =>
  api.patch<KeyRow>(`/keys/keys/${id}/`, keyForm(input), MULTIPART).then((r) => r.data);

export const archiveKey = (id: number) => api.delete(`/keys/keys/${id}/`);

export const rereadKey = (id: number) => api.post<KeyRow>(`/keys/keys/${id}/read/`).then((r) => r.data);

export const fetchRings = () => api.get<{ rings: RingRow[] }>('/keys/rings/').then((r) => r.data.rings);

export const fetchRing = (id: number) => api.get<RingDetail>(`/keys/rings/${id}/`).then((r) => r.data);

export interface RingInput {
  name?: string;
  notes?: string;
  home_location?: string;
  home_person?: number | null;
}

export const createRing = (input: RingInput) => api.post<RingRow>('/keys/rings/', input).then((r) => r.data);

export const updateRing = (id: number, input: RingInput) =>
  api.patch<RingDetail>(`/keys/rings/${id}/`, input).then((r) => r.data);

export const archiveRing = (id: number) => api.delete(`/keys/rings/${id}/`);

export interface MoveInput {
  kind: 'out' | 'in';
  person?: number | null;
  person_name?: string;
  location?: string;
  note?: string;
}

export const moveRing = (id: number, input: MoveInput) =>
  api.post<RingRow>(`/keys/rings/${id}/move/`, input).then((r) => r.data);

export const fetchWhere = () =>
  api.get<{ rings: Array<RingRow & { keys: KeyRow[] }>; loose_keys: KeyRow[] }>('/keys/where/').then((r) => r.data);

export const findKey = (photo: Blob) => {
  const form = new FormData();
  form.append('photo', photo, 'find.jpg');
  return api.post<FindResult>('/keys/find/', form, MULTIPART).then((r) => r.data);
};

export const fetchKeyPeople = () => api.get<{ people: Person[] }>('/keys/people/').then((r) => r.data.people);
