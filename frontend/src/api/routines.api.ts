import api from './client';

export type RoutineTrigger = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual' | 'on_demand';
export type RoutineAssignment = 'pooled' | 'per_person';
export type RoutineAudienceType = 'person' | 'shift' | 'department';
export type RoutineControl = 'pass_fail' | 'pass_fail_strict' | 'number' | 'text' | 'photo';
/** How the phone renders a run. Only `checklist` is authored in the editor. */
export type RoutineKind = 'checklist' | 'section_tally' | 'section_audit' | 'owner_spot' | 'work_cycle';
export type RoutineSubjectSource = 'pool' | 'my_section' | 'other_section';
/** When an open run stops being merely open and starts counting against the day. */
export type RoutineLateAfter = 'due_time' | 'end_of_day' | 'grace_days';
export type RoutineExpireRule = 'never' | 'end_of_day' | 'end_of_week' | 'after';
export type RoutineExpireUnit = 'hours' | 'days' | 'weeks' | 'months';

export interface RoutineCheckDef {
  id: string;
  label: string;
  label_es?: string;
  control: RoutineControl;
  hint?: string;
  hint_es?: string;
  unit?: string;
  critical?: boolean;
  verify_prev?: boolean;
}

export interface RoutineSectionDef {
  id: string;
  title: string;
  title_es?: string;
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

export interface VerifyCheckResponse {
  check_id: string;
  label: string;
  label_es?: string;
  their_result: '' | 'pass' | 'fail' | 'na';
  result: '' | 'pass' | 'fail' | 'na';
  note: string;
  photo?: string | null;
  photo_file_id?: number | null;
  photo_required?: boolean;
}

/** The next shift confirms these checks from the last run. */
export interface RoutineVerifyResponse {
  run_id: number | null;
  checks: VerifyCheckResponse[];
}

export interface RoutineResponses {
  template_version?: number;
  sections: Array<{
    id: string;
    title: string;
    title_es?: string;
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
  severity?: string;
}

export interface OwnerSpotResponses {
  checks: OwnerSpotCheck[];
  audit: SectionAuditResponses;
}

export interface WorkCycleShelf {
  section_id: number | null;
  section_name: string;
  counts: AuditCounts;
  flags: string[];
  photo: string | null;
  photo_file_id: number | null;
  notes: string;
}

export interface WorkCycleResponses {
  mode: 'shelf' | 'non_shelf' | '';
  shelf: WorkCycleShelf;
  non_shelf: { done: string[]; notes: string };
}

export interface NonShelfCheck {
  routine_key: string;
  routine_title: string;
  section_id?: string;
  section_title?: string;
  section_title_es?: string;
  check_id: string;
  label: string;
  label_es?: string;
}

export interface WorkCycleRunnerContext {
  taxonomy: AuditTaxonomy;
  sections: Array<{ id: number; name: string }>;
  non_shelf_checks: NonShelfCheck[];
}

export type AnyRoutineResponses =
  | RoutineResponses
  | SectionTallyResponses
  | SectionAuditResponses
  | OwnerSpotResponses
  | WorkCycleResponses;

export interface TaxonomyItem {
  key: string;
  label: string;
  label_es?: string;
}

export interface TaxonomyGroup {
  key: string;
  solution: string;
  label: string;
  label_es?: string;
  items: TaxonomyItem[];
}

/** The category list the phone renders and the score reads, sent with each run. */
export interface AuditTaxonomy {
  groups?: TaxonomyGroup[];
  graded: TaxonomyItem[];
  recorded: TaxonomyItem[];
  flags: TaxonomyItem[];
  safety_flag: string;
}

/** What the last shift left behind, for the verify block at the top of a runner. */
export interface VerifyContext {
  routine_title: string;
  run_id: number | null;
  completed_at: string | null;
  completed_by_name: string | null;
  failed_count: number;
  checks: VerifyCheckResponse[];
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
  /** When the run becomes overdue (amber). Null means the nag waits for clock-out. */
  due_time: string | null;
  /** Hard deadline: red stripe and an automatic nudge. */
  hard_time: string | null;
  late_after: RoutineLateAfter;
  grace_days: number;
  expire_rule: RoutineExpireRule;
  expire_count: number;
  expire_unit: RoutineExpireUnit;
  expire_from_time: string | null;
  assignment: RoutineAssignment;
  audience_type: RoutineAudienceType;
  audience_all: boolean;
  assigned_shifts: string[];
  assigned_department_ids: number[];
  assigned_role: string;
  assigned_department: number | null;
  assigned_department_name: string | null;
  assigned_user_ids: number[];
  shift?: number | null;
  shift_name?: string | null;
  shift_locked?: boolean;
  is_blocking: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** On GET /routines/:id/ when kind is work_cycle. */
  runner?: WorkCycleRunnerContext;
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
  owner_check?: {
    allowed: boolean;
    reason: 'ready' | 'blocked' | 'missed';
    message: string;
    owner_id: number | null;
    owner_name: string | null;
    tally_run_id: number | null;
  } | null;
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
  audience_type: RoutineAudienceType;
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
  /** Owner spot: another tallied aisle exists today. */
  can_reroll?: boolean;
  /** Owner spot: waiting until something is tallied, or ready to walk. */
  spot_state?: 'waiting' | 'ready' | null;
  seconds_taken?: number | null;
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
  audit_min_items?: number;
  can_reroll?: boolean;
};

export interface NamedPerson {
  id: number;
  name: string;
}

export interface SpotScoreCard {
  spot_score: number;
  run_id?: number;
  check_score?: number;
  count_score?: number;
  found?: number;
  expected_new?: number;
  R?: number;
  explanation?: string;
  safety?: boolean;
  attributed_to?: NamedPerson | null;
  section_id?: number | null;
  section_name?: string;
  note?: string;
  photo?: string | null;
  checks?: Array<{ label: string; result: string; severity: string }>;
}

export interface RoutineSubmission {
  id: number;
  routine: number;
  routine_title: string;
  kind: RoutineKind;
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
  /** Owner spot: computed residual score, only on submit. */
  spot_score?: SpotScoreCard | null;
}

export interface RoutineDraft {
  id: number;
  routine: number;
  routine_title: string;
  kind: RoutineKind;
  mode: string;
  section_name: string;
  started_at: string;
  href: string;
  run: number | null;
}

export interface MyRoutines {
  open: RoutineRun[];
  done: RoutineRun[];
  on_demand: Routine[];
  drafts: RoutineDraft[];
  idle_prompt_minutes: number;
}

export interface TodayGlance {
  shift: string;
  shift_label: string;
  shift_department: string;
  start_with: RoutineRun | null;
  verify_of: string | null;
  open: RoutineRun[];
  drafts: RoutineDraft[];
  on_demand: Routine[];
  language: 'en' | 'es';
}

export function getMyRoutineRuns() {
  return api.get<MyRoutines>('/routines/runs/mine/');
}

export function getTodayGlance() {
  return api.get<TodayGlance>('/routines/today/');
}

export function getRoutineRun(id: number) {
  return api.get<RoutineRunDetail>(`/routines/runs/${id}/`);
}

/** Pick a different unseen aisle on an open owner spot check. */
export function rerollRoutineSection(id: number) {
  return api.post<RoutineRunDetail>(`/routines/runs/${id}/reroll-section/`);
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

/** Gone for good. The server refuses unless the section is already retired. */
export function hardDeleteSection(id: number) {
  return api.delete(`/routines/sections/${id}/hard-delete/`);
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
  verify?: RoutineVerifyResponse | null;
}

export interface GradeThirds {
  doing: number | null;
  cross: number | null;
  owner: number | null;
}

export interface GradeWeights {
  spot?: number;
  do?: number;
  cross?: number;
}

export interface DoingRoutineRow {
  key: string;
  title: string;
  run_id: number | null;
  status: string;
  late?: boolean;
  assigned_to?: NamedPerson | null;
  completed_by?: NamedPerson | null;
  section_id?: number;
}

export interface VerifyScoreRow {
  key: string;
  title: string;
  run_id: number | null;
  fails: number | null;
  score: number;
  status: string;
  items: Array<{ label: string; result: string; photo_required?: boolean }>;
}

export interface DayGrade {
  date: string;
  open_day: boolean;
  graded: boolean;
  score: number | null;
  letter: GradeLetter | null;
  weights?: GradeWeights;
  excluded?: string[];
  thirds?: GradeThirds;
  doing?: { done: number; needed: number; score: number | null; routines: DoingRoutineRow[] };
  cross?: {
    score: number | null;
    verify: VerifyScoreRow[];
    verify_score: number | null;
    audits: CrossCheckRow[];
    audit_score: number | null;
  };
  owner?: {
    score: number | null;
    spots: SpotScoreCard[];
    pending?: boolean;
  };
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
  auditor_name?: string | null;
  checker?: NamedPerson | null;
  section_owner?: NamedPerson | null;
  status: string;
  score: number;
  photo: string | null;
  items_inspected: number;
  counts: AuditCounts;
  flags: string[];
  notes: string;
  found?: number;
  section_mean?: number;
  tail?: number | null;
  seconds_taken?: number | null;
  in_baseline?: boolean;
  excluded_reason?: string;
  warm?: boolean;
}

export interface PersonWeekRow {
  id: number;
  name: string;
  assigned: number;
  done: number;
  late: number;
  missed: number;
  verify_average: number | null;
  cross_check_average: number | null;
  spot_count: number;
  spot_average: number | null;
  open_flags: number;
  on_task?: number | null;
  due_today?: number;
  section_days?: Array<'done' | 'due' | 'missed' | 'none'>;
}

export function getRoutineSubmission(id: number) {
  return api.get<RoutineSubmission>(`/routines/submissions/${id}/`);
}

export function createRoutineSubmission(data: { routine: number; run?: number; mode?: string }) {
  return api.post<RoutineSubmission>('/routines/submissions/', data);
}

export function logWorkCyclePrompt(data: {
  outcome: 'shelf' | 'non_shelf' | 'dismissed';
  idle_seconds: number;
  shown_at: string;
  register?: number | null;
  submission?: number | null;
}) {
  return api.post('/routines/work-cycle/prompt/', data);
}

export function patchRoutineSubmission(id: number, responses: AnyRoutineResponses) {
  return api.patch<RoutineSubmission>(`/routines/submissions/${id}/`, { responses });
}

export function submitRoutineSubmission(id: number, responses: AnyRoutineResponses) {
  return api.post<RoutineSubmission>(`/routines/submissions/${id}/submit/`, { responses });
}

/** Throw away an open draft. Cancel on the phone. */
export function discardRoutineDraft(id: number) {
  return api.delete(`/routines/submissions/${id}/`);
}

/* -------------------------------------------------------------- retail QA */

export interface QaAlerts {
  unassigned_cross_checks: number;
  sections_without_owner: number;
  checker_flags: number;
  safety_flags: number;
  total: number;
}

export interface QaWeek {
  week: string;
  monday: string;
  score: number | null;
  letter: GradeLetter | null;
  thirds: GradeThirds;
  weights?: GradeWeights;
  excluded?: string[];
  excluded_reasons?: Record<string, string>;
  projected?: GradeThirds & {
    score: number | null;
    letter: GradeLetter | null;
    weights?: GradeWeights;
    excluded?: string[];
  };
  days: DayGrade[];
  store: string;
  today: string;
  open_today: boolean;
  alerts: QaAlerts;
  cross_check_due?: string | null;
  tiles?: QaDayTile[];
  score_items?: string[];
  pos_on_task?: string;
  cashier_activity?: Array<{ id: number; name: string; cycles: number; idle_stretches: number; on_task: number | null }>;
  cross_diagnostics?: Array<{
    section: string;
    owner: string | null;
    checker: string | null;
    result: string;
    items_fixed: number;
    flag: string;
  }>;
}

export interface QaDayTile {
  date: string;
  weekday: string;
  open: boolean;
  letter: GradeLetter | null;
  projected_letter: GradeLetter | null;
  doing: number | null;
  spot: number | null;
  cross: number | null;
  weights?: GradeWeights;
  excluded?: string[];
  is_today: boolean;
  is_future: boolean;
}

export type QaStatusWord =
  | 'Done'
  | 'Expected'
  | 'Due'
  | 'Overdue'
  | 'Missed'
  | 'Not tallied'
  | 'In'
  | 'Late'
  | 'Called in'
  | 'Left'
  | 'Unassigned'
  | 'Off'
  | 'Closed'
  | 'Projected'
  | 'Not done'
  | 'Validated'
  | 'Issues found';

export type QaIssueType =
  | 'late'
  | 'call_in_unassigned'
  | 'overdue_routine'
  | 'cross_overdue'
  | 'no_spot'
  | 'empty_shift';

export interface QaIssue {
  id: string;
  type: QaIssueType;
  severity: 'red' | 'amber' | 'grey';
  sentence: string;
  action: 'call_in' | 'reassign' | 'nudge' | 'open_cross' | 'do_spot' | 'open_shifts' | 'clear_call_in' | 're_nudge';
  person_id: number | null;
  person_name: string | null;
  run_id: number | null;
  call_in_id: number | null;
  nudged_at: string | null;
  can_act: boolean;
}

export interface QaJob {
  group: 'section' | 'shift';
  key: string;
  title: string;
  run_id: number | null;
  section_id: number | null;
  owner: NamedPerson | null;
  owner_state?: 'scheduled' | 'in' | 'pool' | null;
  owner_late?: boolean;
  due_at: string | null;
  due_label: string;
  hard_label?: string;
  urgency?: 'due' | 'overdue' | 'hard' | 'missed' | null;
  completed_label?: string;
  nudged_at?: string | null;
  status: QaStatusWord;
  closed: boolean;
  can_close: boolean;
  shift_people?: Array<{ id: number; name?: string; full_name?: string }>;
}

export interface QaStaffRow {
  id: number;
  name: string;
  role: string;
  department: string;
  department_slug?: string;
  department_icon?: 'cart' | 'box' | 'tool' | 'home' | 'tag' | 'truck' | 'none';
  department_sort?: number;
  department_active?: boolean;
  shift_id?: number | null;
  shift_name: string;
  time_in: string;
  time_out: string;
  clocked_in: boolean;
  arrival: string | null;
  expected_not_in: boolean;
  on_roster: boolean;
  status?: QaStatusWord;
  late_minutes?: number | null;
  late_severity?: 'amber' | 'red' | null;
  call_in_id?: number | null;
  can_call_in?: boolean;
  called_in?: boolean;
  added?: boolean;
}

export interface QaCallInRow {
  id: number;
  employee: NamedPerson | null;
  date: string;
  shift_id: number | null;
  shift_name: string;
  marked_by: NamedPerson | null;
  created_at: string;
  cleared: Array<{ run_id: number; assigned_to_id: number; unassign_key?: string }>;
}

export interface QaNudgeRow {
  id: number;
  run_id: number;
  created_by?: NamedPerson | null;
  created_at: string;
  at_label: string;
  ack_label?: string;
  message: string;
  source?: string;
  employee?: NamedPerson | null;
  acked_at?: string | null;
  ack_kind?: string;
  acked_by_device?: string;
}

export interface QaSectionRow {
  id: number;
  name: string;
  owner: NamedPerson | null;
  tallied_at: string | null;
  tally_count: number | null;
  tally_run_id: number | null;
  cross_check: {
    run_id: number | null;
    assigned_to: NamedPerson | null;
    status: string | null;
    score: number | null;
  };
  owner_spot: { done: boolean; score: number | null; run_id: number | null };
  safety: boolean;
  closed: boolean;
}

export interface QaToday {
  date: string;
  open: boolean;
  store: string;
  closed_label?: string;
  hours?: { open: string; close: string };
  cross_check_due?: string | null;
  week: {
    monday: string;
    label: string;
    thirds: GradeThirds;
    letter: GradeLetter | null;
    score: number | null;
    projected?: GradeThirds & { score: number | null; letter: GradeLetter | null };
  };
  alerts: QaAlerts;
  doing: DayGrade['doing'];
  staff: QaStaffRow[];
  off?: QaStaffRow[];
  jobs?: QaJob[];
  issues?: QaIssue[];
  call_ins?: QaCallInRow[];
  nudges?: QaNudgeRow[];
  spot?: { done: boolean; run_id: number | null; score: number | null; state: string };
  cross?: {
    due: string | null;
    due_label: string;
    total: number;
    done: number;
    missing: Array<{
      run_id: number | null;
      section_id: number | null;
      section_name: string;
      owner: NamedPerson | null;
      checker: NamedPerson | string | null;
    }>;
    rows: Array<{
      run_id: number | null;
      section_id: number | null;
      section_name: string;
      owner: NamedPerson | null;
      checker: NamedPerson | null;
      status: QaStatusWord;
      status_label?: string;
      tone?: 'grey' | 'bad' | '';
      items_fixed: number | null;
      score: number | null;
      notes: string;
    }>;
    score: number | null;
  };
  score_items?: { day: string[]; week: string[] };
  pos_on_task?: string;
  can_call_in?: boolean;
  checklists: Array<{
    key: string;
    title: string;
    run_id: number | null;
    assigned_to: NamedPerson | null;
    own_part: string;
    verify: VerifyScoreRow | null;
    completed_at: string | null;
  }>;
  sections: QaSectionRow[];
}

export interface QaFlag {
  id: number;
  user: NamedPerson;
  kind: string;
  status: string;
  raised_at: string;
  window_start: string | null;
  window_end: string | null;
  evidence: Record<string, unknown>;
  note: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface QaMine {
  store: {
    thirds: GradeThirds;
    letter: GradeLetter | null;
    projected?: GradeThirds & { score: number | null; letter: GradeLetter | null };
  };
  today: Array<{
    id: number;
    title: string;
    kind: RoutineKind;
    status: string;
    due_at: string | null;
    href: string;
  }>;
  week: {
    done: number;
    late: number;
    missed: number;
    items: Array<{ id: number; title: string; status: string; date: string; href: string }>;
  };
  my_sections: {
    spots: Array<{ section: string; day: string; score: number | null; reason: string }>;
    cross_checks: Array<{ section: string; day: string; score: number | null; reason: string }>;
  };
  verifies: Array<{ title: string; day: string; score: number | null; fails: number | null }>;
  my_cross_checks: Array<{ section: string; day: string; score: number | null }>;
  under_review: boolean;
  trend: Array<{ week: string; completion: number | null; spot_average: number | null }>;
}

export interface QaPreview {
  before: { thirds: GradeThirds; score: number | null; letter: GradeLetter | null };
  after: { thirds: GradeThirds; score: number | null; letter: GradeLetter | null };
}

export interface QaSettingHistory {
  key: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string | null;
  changed_at: string;
}

export function getQaWeek(week?: string) {
  return api.get<QaWeek>('/routines/qa/week/', { params: { week } });
}

export function getQaToday(date?: string) {
  return api.get<QaToday>('/routines/qa/today/', { params: { date } });
}

export type RetailSpotState = 'done' | 'not_yet' | 'none';
export type RetailCrossState = 'pending' | 'live';

export interface RetailSummaryCounts {
  done: number;
  expected: number;
}

export interface RetailGradeScale {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface RetailDaySummary {
  date?: string;
  week?: string;
  open: boolean | null;
  letter: string | null;
  score: number | null;
  goal_letter: string | null;
  goal_met: boolean;
  grade_scale?: RetailGradeScale;
  weights?: { spot?: number; do?: number; cross?: number };
  excluded?: string[];
  cross_info?: {
    done: number;
    due: number;
    due_date: string | null;
    state: RetailCrossState | 'done';
    done_on_this_day: number;
  } | null;
  do: {
    score: number | null;
    section_checks: RetailSummaryCounts;
    open_day_close: RetailSummaryCounts;
  } | null;
  spot: {
    score: number | null;
    walks: { done: number; min_for_week: number };
    state: RetailSpotState;
  } | null;
  cross: {
    score: number | null;
    done: number;
    due: number;
    due_date: string | null;
    state: RetailCrossState;
  } | null;
}

export function getQaDaySummary(params: { date: string } | { week: string }) {
  return api.get<RetailDaySummary>('/routines/qa/day-summary/', { params });
}

export function assignQaBoard(data: {
  date?: string;
  section?: number;
  run?: number;
  kind: 'owner' | 'cross_checker' | 'close' | 'run';
  user?: number | null;
  closed?: boolean;
}) {
  return api.post('/routines/qa/board/assign/', data);
}

export function createQaCallIn(data: { user: number; date: string }) {
  return api.post<{ ok: boolean; call_in: QaCallInRow }>('/routines/qa/call-in/', data);
}

export function undoQaCallIn(id: number) {
  return api.delete<{ ok: boolean }>(`/routines/qa/call-in/${id}/`);
}

export function createQaLeftEarly(data: { user: number; date: string }) {
  return api.post<{ ok: boolean }>('/routines/qa/left-early/', data);
}

export function createQaExclude(data: { user: number; date: string }) {
  return api.post<{ ok: boolean; id: number }>('/routines/qa/exclude/', data);
}

export function createQaOverride(data: {
  user: number;
  date: string;
  shift: number;
  time_in?: string;
  time_out?: string;
}) {
  return api.post<{ ok: boolean; id: number }>('/routines/qa/override/', data);
}

export function createQaNudge(data: { run: number; message?: string }) {
  return api.post<{ ok: boolean; nudge: QaNudgeRow }>('/routines/qa/nudge/', data);
}

export function getPendingQaNudges() {
  return api.get<{ nudges: QaNudgeRow[] }>('/routines/qa/nudges/pending/');
}

export function ackQaNudge(id: number, data: { kind: 'heard' | 'not_me'; device: string }) {
  return api.post<{ ok: boolean; nudge: QaNudgeRow }>(`/routines/qa/nudges/${id}/ack/`, data);
}

export function getQaSpots(params?: { week?: string; section?: number; person?: number }) {
  return api.get<{ week: string; spots: Array<SpotScoreCard & { date: string }> }>(
    '/routines/qa/spots/',
    { params },
  );
}

export function getQaCrossChecks(week?: string) {
  return api.get<{ week: string; cross_checks: CrossCheckRow[]; flags: QaFlag[] }>(
    '/routines/qa/cross-checks/',
    { params: { week } },
  );
}

export function getQaFlags() {
  return api.get<{ flags: QaFlag[] }>('/routines/qa/flags/');
}

export function reviewQaFlag(id: number, data: { status: string; note: string }) {
  return api.post<QaFlag[]>(`/routines/qa/flags/${id}/review/`, data);
}

export function getQaRoutines(params?: {
  date?: string;
  week?: string;
  type?: string;
  person?: number;
  status?: string;
}) {
  return api.get<{ routines: RoutineRun[] }>('/routines/qa/routines/', { params });
}

export function getQaPeople(week?: string) {
  return api.get<{ week: string; people: PersonWeekRow[] }>('/routines/qa/people/', { params: { week } });
}

export function getQaPerson(id: number, weeks = 8) {
  return api.get<{
    user_id: number;
    history: Array<{ week: string; monday: string; letter: GradeLetter | null; person: PersonWeekRow | null }>;
  }>(`/routines/qa/people/${id}/`, { params: { weeks } });
}

export function getQaTrends(weeks = 8) {
  return api.get<{
    weeks: Array<{ week: string; monday: string; letter: GradeLetter | null; thirds: GradeThirds }>;
    sections: Array<{
      section_id: number;
      section_name: string;
      cross_average: number | null;
      spot_average: number | null;
    }>;
  }>('/routines/qa/trends/', { params: { weeks } });
}

export function getQaMine(week?: string) {
  return api.get<QaMine>('/routines/qa/mine/', { params: { week } });
}

export function previewQaWeek(values: Record<string, unknown>) {
  return api.post<QaPreview>('/routines/qa/preview/', values);
}

export function getQaHistory() {
  return api.get<{ history: QaSettingHistory[] }>('/routines/qa/history/');
}
