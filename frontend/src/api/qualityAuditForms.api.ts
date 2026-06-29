import type {
  QualityAuditForm,
  QualityAuditFormSummary,
  QaFormDefinition,
} from '../types/qualityAudit.types';
import api from './client';

export function getQualityAuditForms(params?: {
  active?: boolean;
}): Promise<{ data: QualityAuditFormSummary[] }> {
  return api.get<QualityAuditFormSummary[]>('/pos/quality-audit-forms/', { params });
}

export function getQualityAuditForm(id: number): Promise<{ data: QualityAuditForm }> {
  return api.get<QualityAuditForm>(`/pos/quality-audit-forms/${id}/`);
}

export interface QualityAuditFormInput {
  slug: string;
  title: string;
  intro?: string;
  icon?: string;
  definition: QaFormDefinition;
  is_active?: boolean;
  feeds_dashboard?: boolean;
}

export function createQualityAuditForm(
  data: QualityAuditFormInput,
): Promise<{ data: QualityAuditForm }> {
  return api.post<QualityAuditForm>('/pos/quality-audit-forms/', data);
}

export function updateQualityAuditForm(
  id: number,
  data: Partial<QualityAuditFormInput>,
): Promise<{ data: QualityAuditForm }> {
  return api.patch<QualityAuditForm>(`/pos/quality-audit-forms/${id}/`, data);
}

export function deleteQualityAuditForm(id: number): Promise<{ data: void }> {
  return api.delete(`/pos/quality-audit-forms/${id}/`);
}
