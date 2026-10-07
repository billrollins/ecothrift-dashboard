import api from './client';

export type Stage =
  | 'new'
  | 'reviewed'
  | 'contacted'
  | 'interview_scheduled'
  | 'interviewed'
  | 'offer'
  | 'hired'
  | 'not_now';

export type QuestionType = 'yes_no' | 'text' | 'long_text' | 'number' | 'choice' | 'multi' | 'date' | 'time';

export interface Question {
  key: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options?: string[];
  must_be?: 'yes' | 'no';
  flag_label?: string;
  help?: string;
  after_roles?: boolean;
}

export interface Job {
  id: number;
  slug: string;
  title: string;
  tagline: string;
  summary: string;
  duties: string[];
  success: string[];
  looking_for: string[];
  nice_to_have: string[];
  physical: string[];
  works_with: string;
  schedule: string;
  hours: string;
  employment_type: 'full_time' | 'part_time' | 'full_or_part';
  pay_min: string | null;
  pay_max: string | null;
  pay_text: string;
  questions: Question[];
  interview_questions: Question[];
  /** This role's own versions of emails (template key → subject/body); others use the universal one. */
  emails: Record<string, { subject: string; body: string }>;
  department: number | null;
  status: 'draft' | 'open' | 'paused' | 'closed';
  /** Owns hiring for this role; gets the new-application alert. */
  hiring_manager: number | null;
  /** Who sits in this role's interviews. */
  interviewers: number[];
  hiring_manager_person: Person | null;
  interviewer_people: Person[];
  sort_order: number;
  application_count: number;
  updated_at: string;
}

export interface JobChip {
  id: number;
  slug: string;
  title: string;
}

export interface Flag {
  key: string;
  label: string;
  ok: boolean | null;
}

export interface ApplicationRow {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  jobs: JobChip[];
  stage: Stage;
  stage_label: string;
  stage_changed_at: string | null;
  rating: number | null;
  red_flags: number;
  flags: Flag[];
  source: string;
  source_label: string;
  has_resume: boolean;
  /** Answer to 'Would you like to lead your area?' ('Yes', 'Maybe', …) or ''. */
  lead_interest: string;
  employee_user: number | null;
  not_now_reason: string;
  /** A practice run: emails say [Practice], its interviews never block a real time, no Create employee. */
  is_practice: boolean;
  created_at: string;
}

export interface AnswerEntry {
  key: string;
  label: string;
  type: QuestionType;
  answer: string | number | string[] | null;
  job?: string;
  must_be?: 'yes' | 'no';
  flag_label?: string;
  ok?: boolean | null;
}

export interface ApplicationEvent {
  id: number;
  kind: 'created' | 'stage' | 'note' | 'rating' | 'email' | 'employee' | 'edit' | 'interview' | 'offer';
  kind_label: string;
  from_stage: string;
  to_stage: string;
  text: string;
  data: Record<string, unknown>;
  by_name: string;
  at: string;
}

export interface ApplicationDetail extends ApplicationRow {
  answers: AnswerEntry[];
  events: ApplicationEvent[];
  resume_file: { filename: string; size: number; content_type: string } | null;
  sms_consent: boolean;
  sms_consent_at: string | null;
  not_now_note: string;
  not_now_stage: string;
  not_now_reason_label: string;
  not_now_email_status: '' | 'sent' | 'not_sent' | 'failed';
  not_now_email_subject: string;
  not_now_email_body: string;
  not_now_at: string | null;
  received_email_sent: boolean;
  employee: {
    user_id: number;
    email: string;
    employee_number: string;
    position: string;
    pay_rate: string;
    hire_date: string | null;
  } | null;
  interviews: Interview[];
  offers: Offer[];
  /** The applicant's live interview link (to copy and text), or ''. */
  booking_link: string;
  invited_at: string | null;
  onboarding: {
    id: number;
    status: 'active' | 'done' | 'cancelled';
    start_date: string;
    done: number;
    total: number;
    overdue: number;
    first_day_email_sent_at: string | null;
  } | null;
}

export interface Option {
  key: string;
  label: string;
}

export interface CountsResponse {
  counts: Record<Stage | 'open' | 'all', number>;
  stages: Option[];
  reasons: Option[];
  /** How many practice applicants exist (all stages, all roles). */
  practice: number;
}

export interface Paged<T> {
  count: number;
  results: T[];
}

export interface ListParams {
  stage?: string;
  job?: string;
  q?: string;
  flag?: '' | 'red' | 'green';
  ordering?: string;
  page_size?: number;
}

export const getApplications = (params: ListParams) =>
  api.get<Paged<ApplicationRow>>('/hiring/applications/', { params: { page_size: 200, ...params } });
export const getApplicationCounts = (params: Omit<ListParams, 'stage'>) =>
  api.get<CountsResponse>('/hiring/applications/counts/', { params });
export const getApplication = (id: number) => api.get<ApplicationDetail>(`/hiring/applications/${id}/`);
export const updateApplication = (id: number, data: Partial<{ first_name: string; last_name: string; email: string; phone: string; jobs: number[] }>) =>
  api.patch<ApplicationDetail>(`/hiring/applications/${id}/`, data);
export const addApplicant = (form: FormData) =>
  api.post<ApplicationDetail>('/hiring/applications/', form, { headers: { 'Content-Type': 'multipart/form-data' } });
export const setStage = (id: number, stage: Stage, note = '') =>
  api.post<ApplicationDetail>(`/hiring/applications/${id}/stage/`, { stage, note });
export const addNote = (id: number, text: string) =>
  api.post<ApplicationDetail>(`/hiring/applications/${id}/note/`, { text });
export const setRating = (id: number, rating: number | null) =>
  api.post<ApplicationDetail>(`/hiring/applications/${id}/rating/`, { rating });
export const getNotNowDraft = (id: number, reason: string) =>
  api.get<{ subject: string; body: string }>(`/hiring/applications/${id}/not-now-draft/`, { params: { reason } });
export const markNotNow = (
  id: number,
  data: { reason: string; note: string; send: boolean; subject: string; body: string },
) => api.post<ApplicationDetail>(`/hiring/applications/${id}/not-now/`, data);
export const createPractice = (data: { job?: number | null; first_name?: string; last_name?: string; email?: string; phone?: string }) =>
  api.post<ApplicationDetail>('/hiring/applications/practice/', data);
export const clearPractice = () => api.post<{ deleted: number }>('/hiring/applications/practice-clear/', {});
export const uploadResume = (id: number, file: File) => {
  const form = new FormData();
  form.append('resume', file);
  return api.post<ApplicationDetail>(`/hiring/applications/${id}/resume/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const getResumeBlob = (id: number) =>
  api.get<Blob>(`/hiring/applications/${id}/resume/`, { responseType: 'blob' });
export const createEmployee = (
  id: number,
  data: {
    pay_rate: string;
    start_date: string;
    position: string;
    employment_type: string;
    department: number | null;
    start_onboarding?: boolean;
    send_first_day?: boolean;
    start_time?: string;
  },
) =>
  api.post<{
    user_id: number;
    employee_number: string;
    username: string;
    onboarding: number | null;
    first_day_sent: boolean;
    application: ApplicationDetail;
  }>(
    `/hiring/applications/${id}/create-employee/`,
    data,
  );

export const getJobs = () => api.get<Job[]>('/hiring/jobs/');
export const createJob = (data: Partial<Job>) => api.post<Job>('/hiring/jobs/', data);
export const updateJob = (id: number, data: Partial<Job>) => api.patch<Job>(`/hiring/jobs/${id}/`, data);
export const deleteJob = (id: number) => api.delete(`/hiring/jobs/${id}/`);

export interface CareersDoc {
  format: string;
  public: boolean;
  page: Record<string, unknown>;
  form: { questions: Question[] };
  email: Record<string, unknown>;
  interviews?: InterviewSettings;
  /** Hiring manager and interviewers (staff emails) that new roles start with. */
  defaults?: { hiring_manager: string; interviewers: string[] };
  offer?: OfferSettings;
  onboarding?: { items: Record<string, unknown>[] };
  handbook?: { title: string; text: string; acknowledgment: string };
  jobs: Record<string, unknown>[];
}

export interface Person {
  id: number;
  email: string;
  name: string;
}

export interface StaffEntry extends Person {
  role: string;
}

/** Every key a careers file may point at (also what the AI bundle carries). */
export interface CareersIndexes {
  staff: StaffEntry[];
  departments: { id: number; slug: string; name: string }[];
  question_types: string[];
  job_statuses: string[];
  employment_types: string[];
  not_now_emails: string[];
  not_now_reasons: Option[];
  stages: Option[];
  email_placeholders: Record<string, string[]>;
  never_ask: string[];
}

export interface AiChoices {
  purpose: string;
  /** The model Settings > AI assigns to hiring (or the app default). */
  default_model: string;
  default_effort: string;
  models: { slug: string; label: string; provider: string }[];
  efforts: string[];
}

export interface CareersResponse {
  doc: CareersDoc;
  brief: string;
  preview_key: string;
  sms_consent_text: string;
  reasons: Option[];
  indexes: CareersIndexes;
  ai: AiChoices;
}

export interface CheckResponse {
  ok: boolean;
  errors: string[];
  warnings: string[];
  changes: string[];
  doc: (CareersDoc & { has_jobs?: boolean }) | null;
  model?: string;
  detail?: string;
}

export const getCareers = () => api.get<CareersResponse>('/hiring/careers/');
export const checkCareers = (doc: unknown) => api.post<CheckResponse>('/hiring/careers/check/', { doc });
export const saveCareers = (doc: unknown) => api.put<CareersResponse>('/hiring/careers/', { doc });
export const setCareersPublic = (on: boolean) => api.post<{ public: boolean }>('/hiring/careers/public/', { public: on });
/** The download for AI: instructions + indexes + the current careers file. */
export const getCareersBundle = () => api.get<Record<string, unknown>>('/hiring/careers/bundle/');
/** Whole-file AI edit (now a background run; poll with getAiJob). */
export const draftCareersWithAi = (request: string, model = '', effort = '') =>
  startAi({ kind: 'careers', request, model, effort });

// ── Interviews (Phase 2) ────────────────────────────────────────────────────

export interface ScorecardAnswer {
  key: string;
  label: string;
  rating: number | null;
  note: string;
}

export interface Scorecard {
  answers?: ScorecardAnswer[];
  overall?: '' | 'hire' | 'maybe' | 'no';
  lead_potential?: '' | 'yes' | 'maybe' | 'no';
  notes?: string;
}

export interface Interview {
  id: number;
  application: number;
  applicant_name: string;
  applicant_phone: string;
  applicant_email: string;
  practice: boolean;
  roles: string[];
  job: number | null;
  job_title: string;
  start: string;
  end: string;
  when: string;
  interviewer: number | null;
  interviewer_person: Person | null;
  place: string;
  status: 'scheduled' | 'done' | 'no_show' | 'cancelled';
  status_label: string;
  booked_by: 'applicant' | 'staff';
  scorecard: Scorecard;
  scored_by_name: string;
  scored_at: string | null;
  interview_questions: Question[];
  reminder_sent_at: string | null;
}

export interface OpenTime {
  start: string;
  end: string;
  day: string;
  date: string;
  label: string;
}

export interface InterviewSettings {
  weekdays: string[];
  start: string;
  end: string;
  length_minutes: number;
  days_ahead: number;
  min_notice_hours: number;
  link_days: number;
  place: string;
}

export interface InterviewTimeBlock {
  id: number;
  kind: 'open' | 'block';
  start: string;
  end: string;
  note: string;
}

export const inviteToInterview = (id: number, send: boolean) =>
  api.post<{ link: string; sent: boolean; application: ApplicationDetail }>(`/hiring/applications/${id}/invite/`, { send });
export const getInterviews = (params: { when?: 'today' | 'upcoming' | 'past' | ''; application?: number }) =>
  api.get<Interview[]>('/hiring/interviews/', { params });
export const getOpenTimes = (exclude?: number) =>
  api.get<{ times: OpenTime[]; settings: InterviewSettings }>('/hiring/interviews/open-times/', {
    params: exclude ? { exclude } : {},
  });
export const bookInterviewForApplicant = (application: number, start: string, interviewer?: number | null) =>
  api.post<Interview>('/hiring/interviews/', { application, start, interviewer: interviewer ?? undefined });
export const rescheduleInterview = (id: number, start: string) =>
  api.post<Interview>(`/hiring/interviews/${id}/reschedule/`, { start });
export const setInterviewInterviewer = (id: number, interviewer: number | null) =>
  api.post<Interview>(`/hiring/interviews/${id}/interviewer/`, { interviewer });
export const cancelInterviewStaff = (id: number, notify = true) =>
  api.post<Interview>(`/hiring/interviews/${id}/cancel/`, { notify });
export const markNoShow = (id: number) => api.post<Interview>(`/hiring/interviews/${id}/no-show/`, {});
export const saveScorecard = (id: number, scorecard: Scorecard & { done?: boolean }) =>
  api.post<Interview>(`/hiring/interviews/${id}/scorecard/`, scorecard);
export const getInterviewTimes = () => api.get<InterviewTimeBlock[]>('/hiring/interview-times/');
export const addInterviewTime = (data: { kind: 'open' | 'block'; start: string; end: string; note: string }) =>
  api.post<InterviewTimeBlock>('/hiring/interview-times/', data);
export const deleteInterviewTime = (id: number) => api.delete(`/hiring/interview-times/${id}/`);

// ── AI help (background runs; Heroku stops a request at 30 seconds) ─────────

export type AiAction = 'polish' | 'shorter' | 'fuller' | 'warmer' | 'voice' | 'custom';

export const AI_ACTIONS: { key: AiAction; label: string }[] = [
  { key: 'polish', label: 'Polish' },
  { key: 'shorter', label: 'Shorter' },
  { key: 'fuller', label: 'Fuller' },
  { key: 'warmer', label: 'Warmer' },
  { key: 'voice', label: 'In my voice' },
];

export interface AiJob<R = Record<string, unknown>> {
  id: string;
  kind: 'job' | 'email' | 'careers';
  status: 'running' | 'done' | 'failed';
  result: R;
  error: string;
  model: string;
}

export const startAi = (payload: Record<string, unknown>) =>
  api.post<{ id: string; status: string }>('/hiring/ai/', payload);
export const getAiJob = <R = Record<string, unknown>>(id: string) => api.get<AiJob<R>>(`/hiring/ai/${id}/`);

/** Start an AI run and wait for it (polling every 2 s, up to 5 minutes). Throws with the reason on failure. */
export async function runAi<R = Record<string, unknown>>(
  payload: Record<string, unknown>,
  onTick?: (seconds: number) => void,
): Promise<AiJob<R>> {
  const { data } = await startAi(payload);
  const started = Date.now();
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const seconds = Math.round((Date.now() - started) / 1000);
    onTick?.(seconds);
    const { data: job } = await getAiJob<R>(data.id);
    if (job.status === 'done') return job;
    if (job.status === 'failed') throw new Error(job.error || 'The AI run failed. Try again.');
    if (seconds > 300) throw new Error('The AI is taking too long. Try again, or pick a faster model.');
  }
}

/** Every email Eco-Thrift sends about hiring, in the order an applicant meets them. */
export const EMAIL_TEMPLATES: { key: string; label: string; group: string; to: string; when: string }[] = [
  { key: 'received', group: 'Applying', label: 'Auto-reply', to: 'Applicant', when: 'Right after they apply.' },
  { key: 'alert', group: 'Applying', label: 'New application alert', to: 'You (notify) and the hiring manager', when: 'Right after someone applies.' },
  { key: 'interview_invite', group: 'Interviews', label: 'Interview link', to: 'Applicant', when: 'When you press Email interview link.' },
  { key: 'interview_booked', group: 'Interviews', label: 'Interview booked', to: 'Applicant (with calendar file)', when: 'When they or you book a time.' },
  { key: 'interview_changed', group: 'Interviews', label: 'Interview moved', to: 'Applicant (with calendar file)', when: 'When the time changes.' },
  { key: 'interview_cancelled', group: 'Interviews', label: 'Interview cancelled', to: 'Applicant', when: 'When it is cancelled.' },
  { key: 'interview_reminder', group: 'Interviews', label: 'Reminder', to: 'Applicant', when: 'The day before.' },
  { key: 'interview_notice', group: 'Interviews', label: 'Staff notice', to: 'Interviewer and hiring manager (with calendar file)', when: 'When an interview is booked, moved, cancelled or reassigned.' },
  { key: 'offer_letter', group: 'Offers', label: 'Offer letter', to: 'Applicant (they sign it)', when: 'Filled in and frozen when you press Make offer.' },
  { key: 'offer_sent', group: 'Offers', label: 'Offer email', to: 'Applicant', when: 'With the link to read and sign the offer.' },
  { key: 'offer_signed', group: 'Offers', label: 'Offer signed (welcome)', to: 'New hire (signed PDF attached)', when: 'Right after they sign.' },
  { key: 'offer_notice', group: 'Offers', label: 'Offer signed / declined notice', to: 'You (notify) and the hiring manager', when: 'When an offer is signed or declined.' },
  { key: 'first_day', group: 'Onboarding', label: 'First-day email', to: 'New hire', when: 'When you press Start onboarding (or send it again).' },
  { key: 'not_now.default', group: 'Not now', label: 'Not moving forward', to: 'Applicant', when: 'Only when you press Send in Not now.' },
  { key: 'not_now.withdrew', group: 'Not now', label: 'Withdrew', to: 'Applicant', when: 'Only when you press Send in Not now.' },
  { key: 'not_now.position_closed', group: 'Not now', label: 'Position filled', to: 'Applicant', when: 'Only when you press Send in Not now.' },
  { key: 'not_now.no_show', group: 'Not now', label: 'No-show', to: 'Applicant', when: 'Only when you press Send in Not now.' },
];

// ── Offers (Phase 3) ────────────────────────────────────────────────────────

export interface Offer {
  id: number;
  application: number;
  job: number | null;
  status: 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | 'withdrawn';
  status_label: string;
  position: string;
  pay_rate: string;
  employment_type: 'part_time' | 'full_time' | 'seasonal';
  start_date: string;
  start_time: string | null;
  schedule: string;
  supervisor: number | null;
  supervisor_person: Person | null;
  respond_by: string;
  note: string;
  letter_subject: string;
  letter_text: string;
  acknowledgments: string[];
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  decline_reason: string;
  withdrawn_at: string | null;
  signer_name: string;
  /** The applicant's link while the offer is open, else ''. */
  link: string;
  has_pdf: boolean;
  created_at: string;
}

export interface OfferTerms {
  job?: number | null;
  position?: string;
  pay_rate: string;
  start_date: string;
  start_time?: string;
  schedule?: string;
  employment_type?: string;
  supervisor?: number | null;
  respond_by?: string;
  note?: string;
}

export const previewOffer = (applicationId: number, terms: OfferTerms) =>
  api.post<{ subject: string; letter: string; acknowledgments: string[]; consent: string }>(
    `/hiring/applications/${applicationId}/offer-preview/`,
    terms,
  );
export const makeOffer = (applicationId: number, terms: OfferTerms, send: boolean) =>
  api.post<{ offer: Offer; link: string; sent: boolean; application: ApplicationDetail }>(
    `/hiring/applications/${applicationId}/offer/`,
    { ...terms, send },
  );
export const resendOffer = (id: number) => api.post<{ sent: boolean; offer: Offer }>(`/hiring/offers/${id}/resend/`, {});
export const withdrawOffer = (id: number) => api.post<Offer>(`/hiring/offers/${id}/withdraw/`, {});
export const getOfferPdf = (id: number) => api.get<Blob>(`/hiring/offers/${id}/pdf/`, { responseType: 'blob' });

/** The offer letter's own settings in the careers file. */
export interface OfferSettings {
  respond_days: number;
  signer_name: string;
  signer_title: string;
  acknowledgments: string[];
  consent: string;
}

// ── Onboarding (Phase 4) ────────────────────────────────────────────────────

export type OnboardingOwner = 'new_hire' | 'manager' | 'owner';
export type OnboardingKind = 'tick' | 'count' | 'i9' | 'handbook' | 'auto';

export interface OnboardingTask {
  id: number;
  key: string;
  label: string;
  help: string;
  owner: OnboardingOwner;
  owner_label: string;
  due: string;
  due_label: string;
  due_date: string;
  kind: OnboardingKind;
  auto: string;
  status: 'open' | 'done' | 'skipped';
  done_at: string | null;
  /** Who ticked it, or "Dash" when Dash saw it done. */
  done_by: string;
  note: string;
  data: { count?: number; size?: string };
  overdue: boolean;
}

export interface OnboardingRow {
  id: number;
  user: { id: number; name: string; email: string; username: string; has_password: boolean; last_login: string | null };
  application: number | null;
  position: string;
  start_date: string;
  start_time: string | null;
  manager: Person | null;
  status: 'active' | 'done' | 'cancelled';
  status_label: string;
  first_day_email_sent_at: string | null;
  created_at: string;
  completed_at: string | null;
  done: number;
  total: number;
  overdue: number;
  next_due: string | null;
}

export interface OnboardingDetail extends OnboardingRow {
  tasks: OnboardingTask[];
  i9: { done: boolean; section2_done_at: string | null; keep_until: string | null; can_open: boolean };
  handbook: { signature: number; version: number; signed_at: string; has_pdf: boolean } | null;
}

export interface I9Detail {
  id: number;
  hire_date: string;
  documents_seen: string;
  section2_done_at: string | null;
  section2_by: string;
  keep_until: string;
  files: { id: number; kind: 'form' | 'document'; kind_label: string; label: string; filename: string; content_type: string; size: number; uploaded_at: string }[];
}

export interface HandbookState {
  draft: { title: string; text: string; acknowledgment: string };
  confirm_marks: number;
  draft_changed: boolean;
  versions: { version: number; title: string; published_at: string; signatures: number }[];
}

export interface MyOnboarding {
  onboarding: OnboardingDetail | null;
  emergency_contact: { name: string; phone: string };
  handbook: {
    version: number;
    title: string;
    text: string;
    acknowledgment: string;
    consent: string;
    signed: { id: number; signed_at: string; signer_name: string } | null;
  } | null;
  place: string;
}

export const getOnboardings = (status: 'active' | 'done' | 'cancelled' | 'all' = 'active') =>
  api.get<OnboardingRow[]>('/hiring/onboarding/', { params: { status } });
export const getOnboarding = (id: number) => api.get<OnboardingDetail>(`/hiring/onboarding/${id}/`);
export const getOnboardingPeople = () => api.get<StaffEntry[]>('/hiring/onboarding/people/');
export const startOnboarding = (data: {
  user?: number;
  application?: number;
  start_date?: string;
  start_time?: string;
  manager?: number | null;
  position?: string;
  send_email: boolean;
}) => api.post<{ onboarding: OnboardingDetail; sent: boolean }>('/hiring/onboarding/', data);
export const setOnboardingTask = (
  id: number,
  taskId: number,
  data: { status: 'open' | 'done' | 'skipped'; data?: { count: number; size: string }; note?: string },
) => api.post<OnboardingDetail>(`/hiring/onboarding/${id}/tasks/${taskId}/`, data);
export const sendFirstDayEmail = (id: number) =>
  api.post<{ sent: boolean; onboarding: OnboardingDetail }>(`/hiring/onboarding/${id}/first-day-email/`, {});
export const cancelOnboarding = (id: number) => api.post<OnboardingDetail>(`/hiring/onboarding/${id}/cancel/`, {});
export const getOnboardingPasswordLink = (id: number) =>
  api.post<{ link: string; expires_at: string; username: string | null }>(`/hiring/onboarding/${id}/set-password-link/`, {});

export const getI9 = (id: number) => api.get<I9Detail>(`/hiring/onboarding/${id}/i9/`);
export const uploadI9File = (id: number, file: File, kind: 'form' | 'document', label: string) => {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  form.append('label', label);
  return api.post<I9Detail>(`/hiring/onboarding/${id}/i9/files/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const deleteI9File = (id: number, fileId: number) => api.delete<I9Detail>(`/hiring/onboarding/${id}/i9/files/${fileId}/`);
export const getI9FileBlob = (id: number, fileId: number) =>
  api.get<Blob>(`/hiring/onboarding/${id}/i9/files/${fileId}/`, { responseType: 'blob' });
export const finishI9Section2 = (id: number, documents_seen: string) =>
  api.post<I9Detail>(`/hiring/onboarding/${id}/i9/section2/`, { documents_seen });

export const getHandbook = () => api.get<HandbookState>('/hiring/handbook/');
export const publishHandbook = () => api.post<HandbookState & { version: number }>('/hiring/handbook/publish/', {});
export const getHandbookPdf = (signatureId: number) =>
  api.get<Blob>(`/hiring/handbook/signatures/${signatureId}/pdf/`, { responseType: 'blob' });

export const getMyOnboarding = () => api.get<MyOnboarding>('/hiring/me/onboarding/');
export const tickMyTask = (taskId: number, status: 'open' | 'done') =>
  api.post<MyOnboarding>(`/hiring/me/onboarding/tasks/${taskId}/`, { status });
export const saveMyEmergencyContact = (name: string, phone: string) =>
  api.post<MyOnboarding>('/hiring/me/emergency-contact/', { name, phone });
export const signMyHandbook = (body: { name: string; signature: string; acknowledged: boolean; consent: boolean }) =>
  api.post<MyOnboarding>('/hiring/me/handbook/sign/', body);
