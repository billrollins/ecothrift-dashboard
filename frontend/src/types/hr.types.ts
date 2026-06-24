export interface Department {
  id: number;
  name: string;
  description: string;
  location: number | null;
  location_name: string | null;
  manager: number | null;
  manager_name: string | null;
  is_active: boolean;
}

export interface TimeEntry {
  id: number;
  employee: number;
  employee_name: string;
  date: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  on_break: boolean;
  break_started_at: string | null;
  total_hours: string | null;
  status: 'pending' | 'approved' | 'flagged';
  approved_by: number | null;
  approved_by_name: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SickLeaveBalance {
  id: number;
  employee: number;
  employee_name: string;
  year: number;
  hours_earned: string;
  hours_used: string;
  hours_available: string;
  is_capped: boolean;
}

export interface SickLeaveRequest {
  id: number;
  employee: number;
  employee_name: string;
  start_date: string;
  end_date: string;
  hours_requested: string;
  status: 'pending' | 'approved' | 'denied';
  reason: string;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  review_note: string;
  reviewed_at: string | null;
  created_at: string;
}

export interface TimeEntrySummary {
  total_hours: string;
  total_entries: number;
  approved_hours: string;
  pending_hours: string;
}

export interface WeeklyHoursStatus {
  week_start: string;
  week_end: string;
  hours_worked: string;
  hours_limit: string;
  hours_remaining: string;
  is_at_limit: boolean;
  is_over_limit: boolean;
  overtime_hours: string;
}

export interface PayrollEmployeeRow {
  employee_id: number;
  employee_name: string;
  pay_rate: string;
  hours_this_week: string;
  total_hours: string;
  total_pay: string;
  approved_hours: string;
  pending_hours: string;
  entry_count: number;
}

export interface PayrollPeriod {
  date_from: string;
  date_to: string;
  label: string;
  is_current: boolean;
}

export interface TimeEntryRosterRow {
  id: number;
  employee_id: number;
  employee_name: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  break_label: string;
  on_break: boolean;
  total_hours: string;
  pay_rate: string;
  pay: string;
  week_start: string;
  week_end: string;
  weekly_cumulative_hours: string;
  is_open: boolean;
}
