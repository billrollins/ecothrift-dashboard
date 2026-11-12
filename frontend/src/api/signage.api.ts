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

// ── #122: drafts, votes, versions ────────────────────────────────────────────

export function voteNeeded(id: number, needed: boolean) {
  return api.post<Sign>(`${B}/${id}/vote/`, { needed });
}

/** Give a version this person's next rank (best first). */
export function rankVersion(id: number, version: number) {
  return api.post<Sign>(`${B}/${id}/rank/`, { version });
}

export function clearRanks(id: number) {
  return api.post<Sign>(`${B}/${id}/rank/`, { clear: true });
}

export function addSignNote(id: number, text: string) {
  return api.post<Sign>(`${B}/${id}/notes/`, { text });
}

export function deleteSignNote(id: number, noteId: number) {
  return api.delete<Sign>(`${B}/${id}/notes/${noteId}/`);
}

export function addSignVersion(id: number, pdf: File, png: File | null, label: string) {
  const form = new FormData();
  form.append('pdf', pdf);
  if (png) form.append('png', png);
  if (label.trim()) form.append('label', label.trim());
  return api.post<Sign>(`${B}/${id}/versions/`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
}

export function deleteSignVersion(id: number, versionId: number) {
  return api.delete<Sign>(`${B}/${id}/versions/${versionId}/`);
}

/** A version's PNG preview or PDF through the API. */
export async function getSignVersionFile(id: number, versionId: number, kind: 'preview' | 'pdf'): Promise<Blob> {
  return (await api.get<Blob>(`${B}/${id}/versions/${versionId}/${kind}/`, { responseType: 'blob' })).data;
}

export function approveSign(id: number, version: number) {
  return api.post<Sign>(`${B}/${id}/approve/`, { version });
}
