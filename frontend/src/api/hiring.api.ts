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
  schedule: string;
  hours: string;
  employment_type: 'full_time' | 'part_time' | 'full_or_part';
  pay_min: string | null;
  pay_max: string | null;
  pay_text: string;
  questions: Question[];
  interview_questions: Question[];
  department: number | null;
  status: 'draft' | 'open' | 'paused' | 'closed';
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
  employee_user: number | null;
  not_now_reason: string;
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
  kind: 'created' | 'stage' | 'note' | 'rating' | 'email' | 'employee' | 'edit';
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
}

export interface Option {
  key: string;
  label: string;
}

export interface CountsResponse {
  counts: Record<Stage | 'open' | 'all', number>;
  stages: Option[];
  reasons: Option[];
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
  data: { pay_rate: string; start_date: string; position: string; employment_type: string; department: number | null },
) =>
  api.post<{ user_id: number; employee_number: string; password_email_sent: boolean; application: ApplicationDetail }>(
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
  jobs: Record<string, unknown>[];
}

export interface CareersResponse {
  doc: CareersDoc;
  brief: string;
  preview_key: string;
  sms_consent_text: string;
  reasons: Option[];
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
export const draftCareersWithAi = (request: string) =>
  api.post<CheckResponse & { raw: unknown }>('/hiring/careers/ai-draft/', { request }, { timeout: 200_000 });
