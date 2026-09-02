import api from './client';

export type RoutineTrigger = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual' | 'on_demand';
export type RoutineAssignment = 'pooled' | 'per_person';
export type RoutineControl = 'pass_fail' | 'pass_fail_strict' | 'number' | 'text' | 'photo';
/** How the phone renders a run. Only `checklist` is authored in the editor. */
export type RoutineKind = 'checklist' | 'section_tally' | 'section_audit' | 'owner_spot';
export type RoutineSubjectSource = 'pool' | 'my_section' | 'other_section';
/** When an open run stops being merely open and starts counting against the day. */
export type RoutineLateAfter = 'due_time' | 'end_of_day' | 'grace_days';

export interface RoutineCheckDef {
  id: string;
  label: string;
  control: RoutineControl;
  hint?: string;
  unit?: string;
  critical?: boolean;
}

export interface RoutineSectionDef {
  id: string;
  title: string;
  checks: RoutineCheckDef[];
}

export interface RoutineDefinition {
  template_version?: number;
  sections: RoutineSectionDef[];
}

export interface RoutineCheckResponse extends RoutineCheckDef {
  result: '' | 'pass' | 'fail' | 'na';
  value: number | string | null;
  photo: string | null;
  photo_file_id: number | null;
  notes: string;
  touched: boolean;
}

/** The sign-off on the shift before yours, when a routine verifies another. */
export interface RoutineVerifyResponse {
  run_id: number | null;
  result: '' | 'pass' | 'fail' | 'na';
  note: string;
}

export interface RoutineResponses {
  template_version?: number;
  sections: Array<{
    id: string;
    title: string;
    checks: RoutineCheckResponse[];
  }>;
  verify?: RoutineVerifyResponse;
}

/* ------------------------------------------------- section-shaped responses */

/** Counts keyed by taxonomy category, e.g. `{ facing_upright: 4 }`. */
export type AuditCounts = Record<string, number>;

export interface SectionTallyRow {
  section_id: number;
  section_name: string;
  counts: AuditCounts;
  flags: string[];
  photo: string | null;
  photo_file_id: number | null;
  notes: string;
}

/** Daily walk of your own sections. Recorded, never graded. */
export interface SectionTallyResponses {
  sections: SectionTallyRow[];
}

/** Somebody else's section, counted. This one is graded. */
export interface SectionAuditResponses {
  section_id: number | null;
  section_name: string;
  photo: string | null;
  photo_file_id: number | null;
  items_inspected: number;
  counts: AuditCounts;
  flags: string[];
  notes: string;
}

export interface OwnerSpotCheck {
  routine_key: string;
  routine_title: string;
  check_id: string;
  label: string;
  control: RoutineControl;
  result: '' | 'pass' | 'fail' | 'na';
}

export interface OwnerSpotResponses {
  checks: OwnerSpotCheck[];
  audit: SectionAuditResponses;
}

export type AnyRoutineResponses =
  | RoutineResponses
  | SectionTallyResponses
  | SectionAuditResponses
  | OwnerSpotResponses;

/** The category list the phone renders and the score reads, sent with each run. */
export interface AuditTaxonomy {
  graded: Array<{ key: string; label: string }>;
  recorded: Array<{ key: string; label: string }>;
  flags: Array<{ key: string; label: string }>;
  safety_flag: string;
}

/** What the last shift left behind, for the verify block at the top of a runner. */
export interface VerifyContext {
  routine_title: string;
  run_id: number | null;
  completed_at: string | null;
  completed_by_name: string | null;
  failed_count: number;
}

export interface Routine {
  id: number;
  title: string;
  intro: string;
  icon: string;
  kind: RoutineKind;
  /** Set on seeded program routines (`retail.open`, …). Null on authored ones. */
  system_key: string | null;
  /** Runner opens by checking the last run of this routine was done to standard. */
  verifies: number | null;
  subject_source: RoutineSubjectSource;
  definition: RoutineDefinition;
  trigger: RoutineTrigger;
  weekdays: number[];
  anchor_date: string | null;
  /** Soft nag. Null starts at the top of the day. */
  remind_time: string | null;
  /** Hard nag. Null means the nag waits for clock-out. */
  due_time: string | null;
  late_after: RoutineLateAfter;
  grace_days: number;
  assignment: RoutineAssignment;
  assigned_role: string;
  assigned_department: number | null;
  assigned_department_name: string | null;
  assigned_user_ids: number[];
  subject_pool: string[];
  is_blocking: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoutineRun {
  id: number;
  routine: number;
  title: string;
  intro: string;
  period_key: string;
  subject: string;
  /** The run's anchor instant. Use `nag_at` / `late_at` for what to say and when to shout. */
  due_at: string;
  remind_at: string;
  /** Null on a clock-out run: the time clock confronts it instead of the app bar. */
  nag_at: string | null;
  late_at: string;
  kind: RoutineKind;
  system_key: string | null;
  section: number | null;
  section_name: string | null;
  /** Drawn when the run was materialized (owner spot check sample). */
  generated: Record<string, unknown>;
  assigned_to: number | null;
  assigned_to_name: string | null;
  department_name: string | null;
  status: 'open' | 'done' | 'missed';
  is_blocking: boolean;
  is_overdue: boolean;
  trigger: RoutineTrigger;
  assignment: RoutineAssignment;
  href: string;
  completed_at: string | null;
  completed_by: number | null;
  completed_by_name: string | null;
  completed_late: boolean;
  failed_count: number;
  has_critical_fail: boolean;
  /** This user's draft, on open rows from /mine/. Null when untouched. */
  progress?: { answered: number; total: number } | null;
  definition?: RoutineDefinition;
  draft?: RoutineSubmission | null;
  /** The submitted answers, on a finished run from /runs/:id/. */
  submission?: RoutineSubmission | null;
  /** Category list, on section-shaped runs from /runs/:id/. */
  taxonomy?: AuditTaxonomy | null;
  /** The audit floor, sent with the run because staff cannot read settings. */
  audit_min_items?: number;
  /** The shift this run signs off on, when the routine verifies another. */
  verify?: VerifyContext | null;
  /** The sections a daily tally covers, from /runs/:id/. */
  sections?: Array<{ id: number; name: string }>;
}

/** Everything the run detail carries; `/runs/:id/` always fills these in. */
export type RoutineRunDetail = RoutineRun & {
  taxonomy: AuditTaxonomy | null;
  verify: VerifyContext | null;
  sections: Array<{ id: number; name: string }>;
  audit_min_items: number;
};

export interface RoutineSubmission {
  id: number;
  routine: number;
  routine_title: string;
  run: number | null;
  submitted_by: number | null;
  submitted_by_name: string | null;
  status: 'draft' | 'submitted';
  /** Shape depends on the routine's kind; narrow with `routine.kind`. */
  responses: AnyRoutineResponses;
  failed_count: number;
  has_critical_fail: boolean;
  started_at: string;
  updated_at: string;
  submitted_at: string | null;
}

export interface MyRoutines {
  open: RoutineRun[];
  done: RoutineRun[];
  on_demand: Routine[];
}

export function getMyRoutineRuns() {
  return api.get<MyRoutines>('/routines/runs/mine/');
}

export function getRoutineRun(id: number) {
  return api.get<RoutineRunDetail>(`/routines/runs/${id}/`);
}

/** Take an absent teammate's run so the aisle still gets walked. */
export function coverRoutineRun(id: number) {
  return api.post<RoutineRun>(`/routines/runs/${id}/cover/`);
}

export function getRoutines() {
  return api.get<Routine[] | { results: Routine[] }>('/routines/routines/');
}

export function getRoutine(id: number) {
  return api.get<Routine>(`/routines/routines/${id}/`);
}

export interface RoutineAssignee {
  id: number;
  full_name: string;
  email: string;
  /** Highest staff group: Admin, Manager, Employee, or '' */
  role: string;
  department_id: number | null;
  department_name: string | null;
}

export function getRoutineAssignees() {
  return api.get<RoutineAssignee[]>('/routines/routines/assignees/');
}

export function createRoutine(data: Partial<Routine>) {
  return api.post<Routine>('/routines/routines/', data);
}

export function updateRoutine(id: number, data: Partial<Routine>) {
  return api.patch<Routine>(`/routines/routines/${id}/`, data);
}

export function deleteRoutine(id: number) {
  return api.delete(`/routines/routines/${id}/`);
}

/** Run history for one routine, as the Admin control page shows it. */
export interface RoutineStats {
  done: number;
  passed: number;
  critical_fails: number;
  open: number;
  overdue: number;
  missed: number;
  last_completed_at: string | null;
  last_completed_by_name: string | null;
  next_due_at: string | null;
  assignee_count: number;
}

export interface AdminRoutine extends Routine {
  stats: RoutineStats;
  created_by_name: string | null;
}

/** Every routine, retired ones included. Superuser only. */
export function getAdminRoutines() {
  return api.get<AdminRoutine[]>('/routines/routines/admin/');
}

export function restoreRoutine(id: number) {
  return api.post<Routine>(`/routines/routines/${id}/restore/`);
}

/** Gone for good, history included. The server refuses unless the routine is already retired. */
export function hardDeleteRoutine(id: number) {
  return api.delete(`/routines/routines/${id}/hard-delete/`);
}

/* ----------------------------------------------------------------- sections */

/** A named area of the floor and the person who keeps it. */
export interface Section {
  id: number;
  department: number;
  department_name: string;
  name: string;
  owner: number | null;
  owner_name: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function getSections(params?: { department?: number; includeRetired?: boolean }) {
  return api.get<Section[]>('/routines/sections/', {
    params: {
      department: params?.department,
      include_retired: params?.includeRetired ? '1' : undefined,
    },
  });
}

export function createSection(data: Partial<Section>) {
  return api.post<Section>('/routines/sections/', data);
}

export function updateSection(id: number, data: Partial<Section>) {
  return api.patch<Section>(`/routines/sections/${id}/`, data);
}

/** Retires the section. History stays; nobody is asked to check it again. */
export function deleteSection(id: number) {
  return api.delete(`/routines/sections/${id}/`);
}

export function reorderSections(ids: number[]) {
  return api.post<Section[]>('/routines/sections/reorder/', { ids });
}

/* ------------------------------------------------------------------ grades */

export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'F';

export interface DayPerformed {
  score: number;
  status: 'open' | 'done' | 'missed' | 'missing';
  late: boolean;
  completed_by_name: string | null;
  title: string;
}

export interface DayGrade {
  date: string;
  open_day: boolean;
  graded: boolean;
  score: number;
  letter: GradeLetter;
  performed: Record<string, DayPerformed>;
  performed_score: number;
  owner_score: number | null;
  owner_run_id: number | null;
  owner_section: string | null;
}

export interface CrossCheckRow {
  run_id: number;
  date: string;
  section_id: number | null;
  section_name: string;
  auditor_name: string | null;
  status: 'open' | 'done' | 'missed';
  score: number;
  photo: string | null;
  items_inspected: number;
  counts: AuditCounts;
  flags: string[];
  notes: string;
}

export interface TallyTotals {
  section_id: number | null;
  section_name: string;
  counts: AuditCounts;
  walks: number;
}

export interface CalibrationRow {
  section_id: number | null;
  section_name: string;
  owner_score: number;
  checker_score: number;
  checker_name: string | null;
  gaps: Array<{ key: string; label: string; owner: number; checker: number }>;
}

export interface WeekGrade {
  week: string;
  monday: string;
  score: number | null;
  letter: GradeLetter | null;
  daily_average: number | null;
  cross_check_average: number | null;
  days: DayGrade[];
  cross_checks: CrossCheckRow[];
  tallies: TallyTotals[];
  calibration: CalibrationRow[];
  settings: Record<string, number>;
  missing_owners: Array<{ run_id: number; owner_name: string; sections: string }>;
  taxonomy: AuditTaxonomy;
}

export function getRetailGrades(week?: string) {
  return api.get<WeekGrade>('/routines/grades/', { params: { week } });
}

export function createRoutineSubmission(data: { routine: number; run?: number }) {
  return api.post<RoutineSubmission>('/routines/submissions/', data);
}

export function patchRoutineSubmission(id: number, responses: AnyRoutineResponses) {
  return api.patch<RoutineSubmission>(`/routines/submissions/${id}/`, { responses });
}

export function submitRoutineSubmission(id: number, responses: AnyRoutineResponses) {
  return api.post<RoutineSubmission>(`/routines/submissions/${id}/submit/`, { responses });
}
