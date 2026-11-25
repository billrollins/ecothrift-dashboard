import api from './client';

/** One photo in my photo drawer (Dash Updates #82). */
export interface PhotoDropDTO {
  id: number;
  created_at: string;
  /** Set once the photo was put somewhere; it stays in the drawer until I delete it. */
  used_at: string | null;
  used_where: string;
  width: number;
  height: number;
  size: number;
  filename: string;
}

const BASE = '/core/photo-drops';

/** My drawer; with `owner`, that person's drawer (superuser only, owner 2026-11-25). */
export const getPhotoDrops = (owner?: number) =>
  (owner != null ? api.get<PhotoDropDTO[]>(`${BASE}/`, { params: { owner } }) : api.get<PhotoDropDTO[]>(`${BASE}/`));

/** A person whose drawer holds photos now. */
export interface PhotoDrawerOwnerDTO {
  id: number;
  name: string;
  photos: number;
}

/** Whose drawers hold photos (superuser only); mine is left out. */
export const getPhotoDrawerOwners = () => api.get<PhotoDrawerOwnerDTO[]>(`${BASE}/owners/`);

/** Save a photo to my drawer. `replaces`: a turned or cropped copy of that drop takes its place and keeps its time. */
export function addPhotoDrop(photo: Blob, replaces?: number) {
  const form = new FormData();
  form.append('photo', photo, 'photo.jpg');
  if (replaces != null) form.append('replaces', String(replaces));
  return api.post<PhotoDropDTO>(`${BASE}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
}

export const deletePhotoDrop = (id: number) => api.delete(`${BASE}/${id}/`);

export const markPhotoDropUsed = (id: number, where = '') =>
  api.post<PhotoDropDTO>(`${BASE}/${id}/used/`, { where });

export const getPhotoDropThumb = (id: number) => api.get<Blob>(`${BASE}/${id}/thumb/`, { responseType: 'blob' });
export const getPhotoDropFile = (id: number) => api.get<Blob>(`${BASE}/${id}/file/`, { responseType: 'blob' });
