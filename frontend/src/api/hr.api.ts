import type { PaginatedResponse } from '../types/index';
import type {
  Department,
  DepartmentDependencies,
  TimeEntry,
  SickLeaveBalance,
  SickLeaveRequest,
  TimeEntrySummary,
  WeeklyHoursStatus,
  PayrollEmployeeRow,
  PayrollPeriod,
  MyPayPeriod,
  TimeEntryRosterRow,
} from '../types/hr.types';
import api from './client';

export type {
  Department,
  DepartmentDependencies,
  TimeEntry,
  SickLeaveBalance,
  SickLeaveRequest,
  TimeEntrySummary,
  WeeklyHoursStatus,
  PayrollEmployeeRow,
  PayrollPeriod,
  MyPayPeriod,
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
export const DEFAULT_PROGRAM_DEPARTMENT_SLUG = 'retail-operations';

export function programDepartmentSlug(
  settings?: Array<{ key: string; value: unknown }> | { results?: Array<{ key: string; value: unknown }> },
): string {
  const rows = Array.isArray(settings) ? settings : settings?.results;
  const row = rows?.find((item) => item.key === 'retail_qa.program_department');
  return typeof row?.value === 'string' && row.value.trim()
    ? row.value.trim()
    : DEFAULT_PROGRAM_DEPARTMENT_SLUG;
}

/** Always resolves to a plain array, whether or not DRF paginated the response. */
export async function getDepartments(params?: {
  includeInactive?: boolean;
}): Promise<{ data: Department[] }> {
  const query = params?.includeInactive ? { include_inactive: 1 } : undefined;
  const { data } = await api.get<Department[] | PaginatedResponse<Department>>('/hr/departments/', {
    params: query,
  });
  return { data: Array.isArray(data) ? data : data?.results || [] };
}

export function createDepartment(data: Record<string, unknown>): Promise<{ data: Department }> {
  return api.post<Department>('/hr/departments/', data);
}

export function updateDepartment(id: number, data: Record<string, unknown>): Promise<{ data: Department }> {
  return api.patch<Department>(`/hr/departments/${id}/`, data);
}

export function deleteDepartment(id: number): Promise<void> {
  return api.delete(`/hr/departments/${id}/`);
}

export function getDepartmentSummary(id: number): Promise<{ data: DepartmentSummary }> {
  return api.get<DepartmentSummary>(`/hr/departments/${id}/summary/`);
}

export function reorderDepartments(ids: number[]): Promise<{ data: { ok: boolean } }> {
  return api.post<{ ok: boolean }>('/hr/departments/reorder/', { ids });
}

/** Keep a selected inactive department visible so the picker is not blank. */
export function mergeCurrentDepartment<T extends { id: number; name: string }>(
  list: T[],
  current?: { id?: number | null; name?: string | null } | null,
): T[] {
  if (current?.id == null) return list;
  if (list.some((row) => row.id === current.id)) return list;
  return [...list, { ...(current as T), id: current.id, name: current.name || `Department ${current.id}` }];
}

export function mergeCurrentDepartments<T extends { id: number; name: string }>(
  list: T[],
  currents: Array<{ id?: number | null; name?: string | null } | null | undefined>,
): T[] {
  return currents.reduce((rows, current) => mergeCurrentDepartment(rows, current), list);
}

export interface DepartmentSummaryPerson {
  id: number;
  full_name: string;
  role: string | null;
  is_active: boolean;
}

export interface DepartmentSummaryShift {
  id: number;
  name: string;
  time_in: string;
  time_out: string;
  weekdays: number[];
  assigned_count: number;
  assignments: Array<{
    id: number;
    employee: number;
    employee_name: string;
    weekdays: number[];
  }>;
}

export interface DepartmentSummary {
  id: number;
  name: string;
  slug: string;
  icon: Department['icon'];
  sort_order: number;
  description: string;
  location: number | null;
  location_name: string | null;
  manager: number | null;
  manager_name: string | null;
  is_active: boolean;
  home_staff: DepartmentSummaryPerson[];
  shifts: DepartmentSummaryShift[];
  also_scheduled_here: Array<{ id: number; full_name: string; shift_name: string }>;
  home_scheduled_elsewhere: Array<{
    id: number;
    full_name: string;
    shift_name: string;
    department_name: string;
  }>;
  sections?: {
    items: Array<{ id: number; name: string; owner: number | null; owner_name: string | null }>;
    orphans: Array<{ id: number; name: string }>;
    idle: DepartmentSummaryPerson[];
    doubled: Array<{ owner: string; count: number }>;
  };
  routines: Array<{
    id: number;
    title: string;
    audience_type: string;
    system_key: string;
  }>;
  document_count: number;
  dependencies: DepartmentDependencies;
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

export function setTimeEntryShift(id: number, shift: string): Promise<{ data: TimeEntry }> {
  return api.post<TimeEntry>(`/hr/time-entries/${id}/set_shift/`, { shift });
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

export function getMyPay(count = 6): Promise<{ data: MyPayPeriod[] }> {
  return api.get<MyPayPeriod[]>('/hr/time-entries/my_pay/', { params: { count } });
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

/** Named weekly roster row. Clock-in tiles read the same rows. */
export interface RosterShift {
  id: number;
  name: string;
  department: number;
  department_name: string;
  department_slug: string;
  department_sort?: number;
  time_in: string;
  time_out: string;
  weekdays: number[];
  punch_code: string;
  is_active: boolean;
  assigned_count: number;
  locked?: boolean;
  locked_title?: string;
}

export type ClockTile = {
  id: number;
  name: string;
  department: string;
  department_slug: string;
  department_sort: number;
  punch_code: string;
};

export interface RosterAssignment {
  id: number;
  employee: number;
  employee_name: string;
  shift: number;
  shift_name: string;
  department_name: string;
  time_in: string;
  time_out: string;
  /** Empty means every day the shift runs. */
  weekdays: number[];
}

export function getClockTiles(day?: string) {
  return api.get<ClockTile[]>('/hr/shifts/clock_tiles/', { params: day ? { date: day } : undefined });
}

export function getRosterShifts() {
  return api.get<RosterShift[]>('/hr/shifts/');
}

export function createRosterShift(data: Partial<RosterShift>) {
  return api.post<RosterShift>('/hr/shifts/', data);
}

export function updateRosterShift(id: number, data: Partial<RosterShift>) {
  return api.patch<RosterShift>(`/hr/shifts/${id}/`, data);
}

export function deleteRosterShift(id: number) {
  return api.delete(`/hr/shifts/${id}/`);
}

export function getRosterAssignments(params?: { shift?: number; employee?: number }) {
  return api.get<RosterAssignment[]>('/hr/shift-assignments/', { params });
}

export function createRosterAssignment(data: { employee: number; shift: number; weekdays?: number[] }) {
  return api.post<RosterAssignment>('/hr/shift-assignments/', data);
}

export function updateRosterAssignment(id: number, data: Partial<RosterAssignment>) {
  return api.patch<RosterAssignment>(`/hr/shift-assignments/${id}/`, data);
}

export function deleteRosterAssignment(id: number) {
  return api.delete(`/hr/shift-assignments/${id}/`);
}
