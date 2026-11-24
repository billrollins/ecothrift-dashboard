import api from './client';

/** Photo projects (owner 2026-11-24): scan a tag, take a photo, add a note; the photo editor makes versions (#209). */
export interface PhotoProjectDTO {
  id: number;
  name: string;
  description: string;
  created_by: number | null;
  created_by_name: string;
  shared_with: number[];
  photo_count: number;
  can_manage: boolean;
  created_at: string;
}

export type AiAction = 'remove_background' | 'optimize' | 'studio' | 'room' | 'holiday' | 'clean_up' | 'free';

/** One version of a photo: an Edit drawn in the browser, or an AI run (working until the picture is back). */
export interface PhotoVersionDTO {
  id: number;
  photo: number;
  made_from: number | null;
  kind: 'edit' | 'ai';
  action: AiAction | '';
  caption: string;
  width: number;
  height: number;
  see_through: boolean;
  status: 'working' | 'done' | 'failed';
  error: string;
  made_by_name: string;
  made_at: string;
}

export interface ProjectPhotoDTO {
  id: number;
  project: number;
  scanned_code: string;
  item_sku: string;
  item_title: string;
  note: string;
  width: number;
  height: number;
  versions: PhotoVersionDTO[];
  /** The version the project grid shows; null = Raw. */
  main: number | null;
  taken_by_name: string;
  created_at: string;
}

export interface Person {
  id: number;
  name: string;
}

const P = '/core/photo-projects';
const PH = '/core/project-photos';
const PV = '/core/photo-versions';

export const listProjects = () => api.get<PhotoProjectDTO[]>(`${P}/`).then((r) => r.data);
export const getProject = (id: number) => api.get<PhotoProjectDTO>(`${P}/${id}/`).then((r) => r.data);
export const createProject = (body: { name: string; description: string; shared_with: number[] }) =>
  api.post<PhotoProjectDTO>(`${P}/`, body).then((r) => r.data);
export const updateProject = (id: number, body: Partial<{ name: string; description: string; shared_with: number[] }>) =>
  api.patch<PhotoProjectDTO>(`${P}/${id}/`, body).then((r) => r.data);
export const deleteProject = (id: number) => api.delete(`${P}/${id}/`);
export const listPeople = () => api.get<Person[]>(`${P}/people/`).then((r) => r.data);
export const lookupCode = (code: string) =>
  api.get<{ found: boolean; sku?: string; title?: string }>(`${P}/lookup/`, { params: { code } }).then((r) => r.data);

export const listPhotos = (projectId: number) => api.get<ProjectPhotoDTO[]>(`${P}/${projectId}/photos/`).then((r) => r.data);
export function addPhoto(projectId: number, photo: Blob, code: string, note: string) {
  const form = new FormData();
  form.append('photo', photo, 'photo.jpg');
  form.append('code', code);
  form.append('note', note);
  return api
    .post<ProjectPhotoDTO>(`${P}/${projectId}/photos/`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
}
export const getPhoto = (id: number) => api.get<ProjectPhotoDTO>(`${PH}/${id}/`).then((r) => r.data);
export const setPhotoNote = (id: number, note: string) => api.patch<ProjectPhotoDTO>(`${PH}/${id}/`, { note }).then((r) => r.data);
export const deletePhoto = (id: number) => api.delete(`${PH}/${id}/`);

/** Keep a picture drawn by the Edit tab as a new version (PNG when see-through, else JPEG). */
export function saveEditVersion(photoId: number, picture: Blob, madeFrom: number | null, caption: string) {
  const form = new FormData();
  form.append('file', picture, picture.type === 'image/png' ? 'edit.png' : 'edit.jpg');
  if (madeFrom != null) form.append('made_from', String(madeFrom));
  form.append('caption', caption);
  return api
    .post<PhotoVersionDTO>(`${PH}/${photoId}/versions/`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
}
export const runAi = (photoId: number, body: { action: AiAction; made_from: number | null; color?: string; words?: string }) =>
  api.post<PhotoVersionDTO>(`${PH}/${photoId}/ai/`, body).then((r) => r.data);
/** Star Main: a version id, or null for Raw. */
export const setMain = (photoId: number, version: number | null) =>
  api.post<ProjectPhotoDTO>(`${PH}/${photoId}/main/`, { version }).then((r) => r.data);
export const deleteVersion = (id: number) => api.delete(`${PV}/${id}/`);
export const runAgain = (id: number) => api.post<PhotoVersionDTO>(`${PV}/${id}/again/`).then((r) => r.data);

/** A picture: Raw (`version` null) or a version, full size or thumbnail. Files never change, so cache them for good. */
export function getPictureBlob(photoId: number, version: number | null, size: 'file' | 'thumb') {
  const url = version == null ? `${PH}/${photoId}/${size}/` : `${PV}/${version}/${size}/`;
  return api.get<Blob>(url, { responseType: 'blob' }).then((r) => r.data);
}
