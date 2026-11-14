export type DepartmentIcon = 'cart' | 'box' | 'tool' | 'home' | 'tag' | 'truck' | 'none';

export interface DepartmentDependencies {
  shifts: number;
  assignments: number;
  sections: number;
  routines: number;
  documents: number;
}

export interface Department {
  id: number;
  name: string;
  slug: string;
  icon: DepartmentIcon;
  sort_order: number;
  description: string;
  location: number | null;
  location_name: string | null;
  manager: number | null;
  manager_name: string | null;
  is_active: boolean;
  /** "Starts in" (#86): the menu workspace this department's people open on; '' = the house default. */
  start_workspace?: string;
  home_count?: number;
  shift_count?: number;
  section_count?: number;
  dependencies?: DepartmentDependencies;
}

export interface TimeEntry {
  id: number;
  employee: number;
  employee_name: string;
  date: string;
  clock_in: string;
  clock_out: string | null;
  shift: string;
  shift_label: string;
  shift_department: string;
  break_minutes: number;
  on_break: boolean;
  break_started_at: string | null;
  total_hours: string | null;
  status: 'pending' | 'approved' | 'flagged';
  /** On the current punch only: open 14h+, so it was almost surely never clocked out. */
  stale?: { since: string; suggested_clock_out: string } | null;
  approved_by: number | null;
  approved_by_name: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
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
  /** What they are cleared for: 40 plus their overtime allowance. */
  hours_limit: string;
  /** The base weekly limit (40). */
  base_limit?: string;
  /** Hours past 40 the owner cleared this person for (0 = no overtime). */
  overtime_allowance?: string;
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

export interface MyPayPeriod extends PayrollPeriod {
  shift_count: number;
  total_hours: string;
  approved_hours: string;
  pending_hours: string;
  /** Hours past 40 in a Mon-Sun week; total_pay pays them at 1.5. */
  overtime_hours: string;
  total_pay: string;
  /** Off payroll (family, #121): total_pay is 0 and no pay is shown. */
  on_payroll?: boolean;
}

/** One scheduled shift on a day of My period, with the hours of it still ahead. */
export interface MyPeriodScheduled {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  /** "9am-3pm" */
  text: string;
  hours: number;
  hours_ahead: string;
  department_name: string;
}

/** A shift worked, with its latest "fix this shift" request. */
export interface MyPeriodWorked extends TimeEntry {
  /** The open shift's hours up to now. */
  hours_so_far?: string;
  change: { id: number; status: 'pending' | 'approved' | 'denied'; review_note: string } | null;
}

/** A schedule request (days off or new times), as the schedule API sends it. */
export interface MyPeriodRequest {
  id: number;
  kind: 'off' | 'times';
  date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  note: string;
  status: 'pending' | 'approved' | 'declined' | 'withdrawn';
  reply: string;
  decided_by_name: string;
  decided_at: string | null;
  created_at: string;
}

/** The Time clock tab's Mine view (#137): this pay period, scheduled and worked. Pay is null when off payroll. */
export interface MyPeriod {
  date_from: string;
  date_to: string;
  label: string;
  today: string;
  days_left: number;
  on_payroll: boolean;
  so_far: { hours: string; overtime_hours: string; pending_hours: string; shift_count: number; pay: string | null };
  ahead: { hours: string; shift_count: number; pay: string | null };
  expected: { hours: string; overtime_hours: string; pay: string | null };
  weeks: Array<{ start: string; end: string; worked: string; ahead: string; limit: string; is_current: boolean }>;
  days: Array<{
    date: string;
    is_today: boolean;
    is_past: boolean;
    scheduled: MyPeriodScheduled[];
    worked: MyPeriodWorked[];
    day_off: MyPeriodRequest | null;
  }>;
  requests: MyPeriodRequest[];
}

export interface TimeEntryRosterRow {
  id: number;
  employee_id: number;
  employee_name: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  shift: string;
  shift_label: string;
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
  /** Off = family who are not paid (#121): pay is 0 and they are left out of the pay sheet. */
  on_payroll?: boolean;
}
