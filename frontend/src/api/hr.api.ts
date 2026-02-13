import type { PaginatedResponse } from '../types/index';
import type { Department, TimeEntry, SickLeaveBalance, SickLeaveRequest, TimeEntrySummary } from '../types/hr.types';
import api from './client';

export type { Department, TimeEntry, SickLeaveBalance, SickLeaveRequest, TimeEntrySummary };

export interface TimeEntryParams {
  employee?: number;
  date_from?: string;
  date_to?: string;
  status?: string;
  page?: number;
  page_size?: number;
  [key: string]: unknown;
}

// Department endpoints
export function getDepartments(): Promise<{ data: Department[] }> {
  return api.get<Department[]>('/hr/departments/');
}

export function createDepartment(data: Record<string, unknown>): Promise<{ data: Department }> {
  return api.post<Department>('/hr/departments/', data);
}

// Time entry endpoints
export function getTimeEntries(params?: TimeEntryParams): Promise<{ data: PaginatedResponse<TimeEntry> }> {
  return api.get<PaginatedResponse<TimeEntry>>('/hr/time-entries/', { params });
}

export function createTimeEntry(data: Record<string, unknown>): Promise<{ data: TimeEntry }> {
  return api.post<TimeEntry>('/hr/time-entries/', data);
}

export function updateTimeEntry(id: number, data: Record<string, unknown>): Promise<{ data: TimeEntry }> {
  return api.patch<TimeEntry>(`/hr/time-entries/${id}/`, data);
}

export function clockOut(id: number, breakMinutes?: number): Promise<{ data: TimeEntry }> {
  return api.post<TimeEntry>(`/hr/time-entries/${id}/clock_out/`, { break_minutes: breakMinutes });
}

export function getCurrentEntry(): Promise<{ data: TimeEntry | null }> {
  return api.get<TimeEntry | null>('/hr/time-entries/current/');
}

export function approveEntry(id: number): Promise<{ data: TimeEntry }> {
  return api.post<TimeEntry>(`/hr/time-entries/${id}/approve/`);
}

export function bulkApprove(ids: number[]): Promise<{ data: unknown }> {
  return api.post('/hr/time-entries/bulk_approve/', { ids });
}

export function getTimeSummary(params?: Record<string, unknown>): Promise<{ data: TimeEntrySummary }> {
  return api.get<TimeEntrySummary>('/hr/time-entries/summary/', { params });
}

// Sick leave endpoints
export function getSickLeaveBalances(params?: Record<string, unknown>): Promise<{ data: SickLeaveBalance[] }> {
  return api.get<SickLeaveBalance[]>('/hr/sick-leave/balances/', { params });
}

export function updateSickLeaveBalance(
  id: number,
  data: Record<string, unknown>
): Promise<{ data: SickLeaveBalance }> {
  return api.patch<SickLeaveBalance>(`/hr/sick-leave/balances/${id}/`, data);
}

export function getSickLeaveRequests(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<SickLeaveRequest> }> {
  return api.get<PaginatedResponse<SickLeaveRequest>>('/hr/sick-leave/requests/', { params });
}

export function createSickLeaveRequest(data: Record<string, unknown>): Promise<{ data: SickLeaveRequest }> {
  return api.post<SickLeaveRequest>('/hr/sick-leave/requests/', data);
}

export function approveSickLeave(id: number, reviewNote?: string): Promise<{ data: SickLeaveRequest }> {
  return api.post<SickLeaveRequest>(`/hr/sick-leave/requests/${id}/approve/`, { review_note: reviewNote });
}

export function denySickLeave(id: number, reviewNote?: string): Promise<{ data: SickLeaveRequest }> {
  return api.post<SickLeaveRequest>(`/hr/sick-leave/requests/${id}/deny/`, { review_note: reviewNote });
}
