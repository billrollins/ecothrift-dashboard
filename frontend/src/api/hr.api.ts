import type { PaginatedResponse } from '../types/index';
import type {
  Department,
  TimeEntry,
  SickLeaveBalance,
  SickLeaveRequest,
  TimeEntrySummary,
  WeeklyHoursStatus,
  PayrollEmployeeRow,
  PayrollPeriod,
  TimeEntryRosterRow,
} from '../types/hr.types';
import api from './client';

export type {
  Department,
  TimeEntry,
  SickLeaveBalance,
  SickLeaveRequest,
  TimeEntrySummary,
  WeeklyHoursStatus,
  PayrollEmployeeRow,
  PayrollPeriod,
  TimeEntryRosterRow,
};

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
/** Always resolves to a plain array, whether or not DRF paginated the response. */
export async function getDepartments(): Promise<{ data: Department[] }> {
  const { data } = await api.get<Department[] | PaginatedResponse<Department>>('/hr/departments/');
  return { data: Array.isArray(data) ? data : data?.results || [] };
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

export function startBreak(id: number): Promise<{ data: TimeEntry }> {
  return api.post<TimeEntry>(`/hr/time-entries/${id}/start_break/`);
}

export function endBreak(id: number): Promise<{ data: TimeEntry }> {
  return api.post<TimeEntry>(`/hr/time-entries/${id}/end_break/`);
}

export function getCurrentEntry(): Promise<{ data: TimeEntry | null }> {
  return api.get<TimeEntry | null>('/hr/time-entries/current/');
}

export function getWeeklyHoursStatus(params?: { employee?: number }): Promise<{ data: WeeklyHoursStatus }> {
  return api.get<WeeklyHoursStatus>('/hr/time-entries/weekly_status/', { params });
}

export function getPayrollHours(params: {
  date_from: string;
  date_to: string;
}): Promise<{ data: PayrollEmployeeRow[] }> {
  return api.get<PayrollEmployeeRow[]>('/hr/time-entries/payroll/', { params });
}

export function getPayrollPeriods(count = 16): Promise<{ data: PayrollPeriod[] }> {
  return api.get<PayrollPeriod[]>('/hr/time-entries/payroll_periods/', { params: { count } });
}

export function getTimeEntryRoster(params: {
  date_from: string;
  date_to: string;
}): Promise<{ data: TimeEntryRosterRow[] }> {
  return api.get<TimeEntryRosterRow[]>('/hr/time-entries/roster/', { params });
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

export function deleteTimeEntry(id: number): Promise<{ data: void }> {
  return api.delete(`/hr/time-entries/${id}/`);
}

export function bulkDeleteTimeEntries(ids: number[]): Promise<{ data: { deleted: number } }> {
  return api.post<{ deleted: number }>('/hr/time-entries/bulk_delete/', { ids });
}

// Modification request endpoints
export interface ModificationRequest {
  id: number;
  time_entry: number;
  employee: number;
  employee_name: string;
  entry_date: string;
  entry_clock_in: string;
  entry_clock_out: string | null;
  requested_clock_in: string | null;
  requested_clock_out: string | null;
  requested_break_minutes: number | null;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  review_note: string;
  reviewed_at: string | null;
  created_at: string;
}

export function getModificationRequests(
  params?: Record<string, unknown>
): Promise<{ data: PaginatedResponse<ModificationRequest> }> {
  return api.get<PaginatedResponse<ModificationRequest>>('/hr/modification-requests/', { params });
}

export function createModificationRequest(
  data: Record<string, unknown>
): Promise<{ data: ModificationRequest }> {
  return api.post<ModificationRequest>('/hr/modification-requests/', data);
}

export function approveModificationRequest(
  id: number,
  reviewNote?: string
): Promise<{ data: ModificationRequest }> {
  return api.post<ModificationRequest>(`/hr/modification-requests/${id}/approve/`, { review_note: reviewNote });
}

export function denyModificationRequest(
  id: number,
  reviewNote?: string
): Promise<{ data: ModificationRequest }> {
  return api.post<ModificationRequest>(`/hr/modification-requests/${id}/reject/`, { review_note: reviewNote });
}

export function updateModificationRequest(
  id: number,
  data: Record<string, unknown>
): Promise<{ data: ModificationRequest }> {
  return api.patch<ModificationRequest>(`/hr/modification-requests/${id}/`, data);
}

export function deleteModificationRequest(id: number): Promise<{ data: void }> {
  return api.delete(`/hr/modification-requests/${id}/`);
}

export function bulkDeleteModificationRequests(
  ids: number[]
): Promise<{ data: { deleted: number } }> {
  return api.post<{ deleted: number }>('/hr/modification-requests/bulk_delete/', { ids });
}

export function bulkApproveModificationRequests(
  ids: number[],
  reviewNote?: string
): Promise<{ data: { approved: number } }> {
  return api.post<{ approved: number }>('/hr/modification-requests/bulk_approve/', {
    ids,
    review_note: reviewNote,
  });
}

export function bulkRejectModificationRequests(
  ids: number[],
  reviewNote?: string
): Promise<{ data: { rejected: number } }> {
  return api.post<{ rejected: number }>('/hr/modification-requests/bulk_reject/', {
    ids,
    review_note: reviewNote,
  });
}
