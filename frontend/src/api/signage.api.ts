import type { Sign, SignPayload } from '../types/signage.types';
import api from './client';

const B = '/signage/signs';

export function getSigns() {
  return api.get<Sign[]>(`${B}/`);
}

export function createSign(payload: SignPayload) {
  return api.post<Sign>(`${B}/`, payload);
}

export function updateSign(id: number, payload: SignPayload) {
  return api.patch<Sign>(`${B}/${id}/`, payload);
}

export function deleteSign(id: number) {
  return api.delete(`${B}/${id}/`);
}

/** The sign's PDF through the API (the sign-in goes with it). */
export async function getSignPdf(id: number): Promise<Blob> {
  return (await api.get<Blob>(`${B}/${id}/pdf/`, { responseType: 'blob' })).data;
}

export function uploadSignPdf(id: number, file: File) {
  const form = new FormData();
  form.append('file', file);
  return api.post<Sign>(`${B}/${id}/pdf/`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
}

export function removeSignPdf(id: number) {
  return api.delete<Sign>(`${B}/${id}/pdf/`);
}
