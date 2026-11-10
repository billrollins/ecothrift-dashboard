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

export const getPhotoDrops = () => api.get<PhotoDropDTO[]>(`${BASE}/`);

export function addPhotoDrop(photo: Blob, filename = 'photo.jpg') {
  const form = new FormData();
  form.append('photo', photo, filename);
  return api.post<PhotoDropDTO>(`${BASE}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
}

export const deletePhotoDrop = (id: number) => api.delete(`${BASE}/${id}/`);

export const markPhotoDropUsed = (id: number, where = '') =>
  api.post<PhotoDropDTO>(`${BASE}/${id}/used/`, { where });

export const getPhotoDropThumb = (id: number) => api.get<Blob>(`${BASE}/${id}/thumb/`, { responseType: 'blob' });
export const getPhotoDropFile = (id: number) => api.get<Blob>(`${BASE}/${id}/file/`, { responseType: 'blob' });
