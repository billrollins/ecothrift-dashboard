/** The week schedule and call-ins (owner 2026-10-21). */
import api from './client';

export interface ScheduledShift {
  id: number;
  employee: number;
  employee_name: string;
  date: string;
  start_time: string;
  end_time: string;
  /** "9am-3pm" */
  text: string;
  hours: number;
  department: number | null;
  department_name: string;
  /** Not Retail: the times are the plan; leave early or stay late as the day needs. */
  flexible: boolean;
  note: string;
}

export interface CallInCounts {
  d30: number;
  d90: number;
  no_show_90: number;
}

export interface CallIn {
  id: number;
  employee: number;
  employee_name: string;
  shift_date: string;
  scheduled_shift: number | null;
  shift_text: string;
  kind: 'called_in' | 'no_show';
  kind_label: string;
  called_at: string | null;
  reason: string;
  recorded_by: string;
  created_at: string;
}

export interface ScheduleWeek {
  start: string;
  end: string;
  days: string[];
  people: Array<{
    id: number;
    name: string;
    department: number | null;
    department_name: string;
    hours: number;
    call_ins: CallInCounts;
  }>;
  shifts: ScheduledShift[];
  call_ins: CallIn[];
  fixed_departments: string[];
}

export interface ShiftInput {
  employee: number;
  date: string;
  department: number | null;
  start_time: string;
  end_time: string;
  note: string;
}

export const getScheduleWeek = (start: string) => api.get<ScheduleWeek>('/hr/schedule/week/', { params: { start } });
export const createScheduledShift = (data: ShiftInput) => api.post<ScheduledShift>('/hr/schedule/shifts/', data);
export const updateScheduledShift = (id: number, data: Partial<ShiftInput>) =>
  api.patch<ScheduledShift>(`/hr/schedule/shifts/${id}/`, data);
export const deleteScheduledShift = (id: number) => api.delete(`/hr/schedule/shifts/${id}/`);
export const copyScheduleWeek = (from: string, to: string) =>
  api.post<{ made: number }>('/hr/schedule/copy-week/', { from, to });
export const fillScheduleFromUsual = (start: string) =>
  api.post<{ made: number }>('/hr/schedule/fill-usual/', { start });
export const getMyWeek = () =>
  api.get<{ start: string; end: string; shifts: ScheduledShift[] }>('/hr/schedule/my-week/');

export const recordCallIn = (data: {
  employee: number;
  shift_date: string;
  scheduled_shift?: number | null;
  kind: CallIn['kind'];
  reason: string;
}) => api.post<CallIn>('/hr/call-ins/', data);
export const deleteCallIn = (id: number) => api.delete(`/hr/call-ins/${id}/`);
