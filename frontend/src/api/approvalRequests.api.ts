import type { ApprovalRequest } from '../types/approvalRequests.types';
import api from './client';

/** Superuser → Requests. Opening the list also restarts any stalled apply (server side). */
export async function fetchApprovalRequests(status?: string): Promise<ApprovalRequest[]> {
  const { data } = await api.get<ApprovalRequest[]>('/core/requests/', { params: status ? { status } : {} });
  return data;
}

export async function approveRequest(id: number, note = ''): Promise<ApprovalRequest> {
  const { data } = await api.post<ApprovalRequest>(`/core/requests/${id}/approve/`, { note });
  return data;
}

export async function rejectRequest(id: number, note = ''): Promise<ApprovalRequest> {
  const { data } = await api.post<ApprovalRequest>(`/core/requests/${id}/reject/`, { note });
  return data;
}

export async function undoRequest(id: number): Promise<ApprovalRequest> {
  const { data } = await api.post<ApprovalRequest>(`/core/requests/${id}/undo/`, {});
  return data;
}

export async function resumeRequest(id: number): Promise<ApprovalRequest> {
  const { data } = await api.post<ApprovalRequest>(`/core/requests/${id}/resume/`, {});
  return data;
}
