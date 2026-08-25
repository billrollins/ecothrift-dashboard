import type {
  EnhancementRequestDTO,
  EnhancementRequestNoteDTO,
  EnhancementRequestTriagePayload,
  EnhancementRequestWritePayload,
} from '../types/enhancementRequests.types';
import api from './client';

export function getEnhancementRequests(): Promise<{ data: EnhancementRequestDTO[] }> {
  return api.get<EnhancementRequestDTO[]>('/core/enhancement-requests/');
}

export function createEnhancementRequest(
  payload: EnhancementRequestWritePayload,
): Promise<{ data: EnhancementRequestDTO }> {
  return api.post<EnhancementRequestDTO>('/core/enhancement-requests/', payload);
}

export function updateEnhancementRequest(
  id: number,
  payload: EnhancementRequestWritePayload,
): Promise<{ data: EnhancementRequestDTO }> {
  return api.patch<EnhancementRequestDTO>(`/core/enhancement-requests/${id}/`, payload);
}

export function addEnhancementRequestNote(
  id: number,
  body: string,
): Promise<{ data: EnhancementRequestDTO }> {
  return api.post<EnhancementRequestDTO>(`/core/enhancement-requests/${id}/notes/`, { body });
}

export function getEnhancementRequestNotes(
  id: number,
): Promise<{ data: EnhancementRequestNoteDTO[] }> {
  return api.get<EnhancementRequestNoteDTO[]>(`/core/enhancement-requests/${id}/notes/`);
}

export function triageEnhancementRequest(
  id: number,
  payload: EnhancementRequestTriagePayload,
): Promise<{ data: EnhancementRequestDTO }> {
  return api.post<EnhancementRequestDTO>(`/core/enhancement-requests/${id}/triage/`, payload);
}
