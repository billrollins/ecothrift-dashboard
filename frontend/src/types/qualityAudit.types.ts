export type QualityAuditStatus = 'draft' | 'submitted';
export type QualityCheckResult = 'pass' | 'fail' | 'na' | '';

export type QaControlKind =
  | 'yesno'
  | 'thumbs'
  | 'rating'
  | 'emoji'
  | 'severity'
  | 'slider'
  | 'chips'
  | 'counter'
  | 'zone'
  | 'photo'
  | 'confidence'
  | 'toggle'
  | 'priority'
  | 'comment'
  | 'grade';

export type QaSeverity = 'none' | 'minor' | 'major' | 'critical';
export type QaConfidence = 'high' | 'med' | 'low';
export type QaPriority = 'low' | 'med' | 'high' | 'urgent';

export interface QualityAuditCheck {
  id: string;
  label: string;
  control: QaControlKind;
  hint?: string;
  options?: string[];
  result: QualityCheckResult;
  notes: string;
  rating?: number | null;
  severity?: QaSeverity | null;
  tags?: string[];
  count?: number | null;
  zone?: string | null;
  photo?: string | null;
  confidence?: QaConfidence | null;
  priority?: QaPriority | null;
  comment?: string;
  letter?: string;
  score?: number | null;
  /** Set by the client when the auditor interacts with chips (and similar). */
  touched?: boolean;
}

export interface QualityAuditSection {
  id: string;
  title: string;
  intro?: string;
  icon?: string;
  checks: QualityAuditCheck[];
}

export interface QualityAuditResponses {
  template_version: number;
  sections: QualityAuditSection[];
}

export interface QualityAudit {
  id: number;
  form: number | null;
  form_slug: string | null;
  form_title: string | null;
  audit_type: string;
  status: QualityAuditStatus;
  conducted_by: number | null;
  conducted_by_name: string | null;
  started_at: string;
  updated_at: string;
  submitted_at: string | null;
  responses: QualityAuditResponses;
  overall_grade: string;
  summary_notes: string;
}

export interface QualityAuditListParams {
  status?: QualityAuditStatus;
  form?: string;
  audit_type?: string;
  limit?: number;
}

// ── Form definition (super-admin editable) ────────────────────────────────────

export interface QaFormDefinitionCheck {
  id: string;
  label: string;
  control: QaControlKind;
  hint?: string;
  options?: string[];
}

export interface QaFormDefinitionSection {
  id: string;
  title: string;
  intro?: string;
  icon?: string;
  checks: QaFormDefinitionCheck[];
}

export interface QaFormDefinition {
  template_version: number;
  sections: QaFormDefinitionSection[];
}

export interface QualityAuditFormSummary {
  id: number;
  slug: string;
  title: string;
  intro: string;
  icon: string;
  is_system: boolean;
  feeds_dashboard: boolean;
  is_active: boolean;
  section_count: number;
  check_count: number;
  updated_at: string;
}

export interface QualityAuditForm {
  id: number;
  slug: string;
  title: string;
  intro: string;
  icon: string;
  definition: QaFormDefinition;
  is_system: boolean;
  feeds_dashboard: boolean;
  is_active: boolean;
  created_by: number | null;
  created_by_name: string | null;
  updated_by: number | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

// ── Control catalog metadata (mirrors apps/pos/quality_audit_controls.py) ─────

export interface QaControlMeta {
  value: QaControlKind;
  label: string;
  needsOptions: boolean;
}

export const QA_CONTROL_CATALOG: QaControlMeta[] = [
  { value: 'yesno', label: 'Yes / No / N-A', needsOptions: false },
  { value: 'thumbs', label: 'Thumbs up / down', needsOptions: false },
  { value: 'rating', label: '5-star rating', needsOptions: false },
  { value: 'emoji', label: 'Emoji satisfaction', needsOptions: false },
  { value: 'severity', label: 'Severity', needsOptions: false },
  { value: 'slider', label: 'Condition slider 0-100', needsOptions: false },
  { value: 'chips', label: 'Multi-select issue chips', needsOptions: true },
  { value: 'counter', label: 'Numeric counter', needsOptions: false },
  { value: 'zone', label: 'Single-select zone', needsOptions: true },
  { value: 'photo', label: 'Photo capture (mock)', needsOptions: false },
  { value: 'confidence', label: 'Confidence', needsOptions: false },
  { value: 'toggle', label: 'Compliant toggle', needsOptions: false },
  { value: 'priority', label: 'Priority', needsOptions: false },
  { value: 'comment', label: 'Comment / notes', needsOptions: false },
  { value: 'grade', label: 'Letter grade A-F', needsOptions: false },
];

export const QA_CONTROL_LABELS: Record<QaControlKind, string> = QA_CONTROL_CATALOG.reduce(
  (acc, meta) => ({ ...acc, [meta.value]: meta.label }),
  {} as Record<QaControlKind, string>,
);
