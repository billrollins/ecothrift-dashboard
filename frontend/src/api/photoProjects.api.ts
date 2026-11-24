import api from './client';

/** Photo projects (owner 2026-11-24): scan a tag, take a photo, add a note; Grok cleans up a copy. */
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

export type EditKind = 'remove_background' | 'clean_up' | 'square';

export interface ProjectPhotoDTO {
  id: number;
  project: number;
  scanned_code: string;
  item_sku: string;
  item_title: string;
  note: string;
  width: number;
  height: number;
  edit_kind: EditKind | '';
  edit_status: '' | 'working' | 'done' | 'failed';
  edit_error: string;
  has_edit: boolean;
  taken_by_name: string;
  created_at: string;
}

export interface Person {
  id: number;
  name: string;
}

const P = '/core/photo-projects';
const PH = '/core/project-photos';

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
export const editPhoto = (id: number, kind: EditKind) => api.post<ProjectPhotoDTO>(`${PH}/${id}/edit/`, { kind }).then((r) => r.data);

export type PhotoVariant = 'thumb' | 'file' | 'edited' | 'edited-thumb';
export const getPhotoBlob = (id: number, variant: PhotoVariant) =>
  api.get<Blob>(`${PH}/${id}/${variant}/`, { responseType: 'blob' }).then((r) => r.data);
