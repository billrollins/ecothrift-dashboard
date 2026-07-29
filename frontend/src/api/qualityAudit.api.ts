import type {
  QualityAudit,
  QualityAuditListParams,
  QualityAuditResponses,
} from '../types/qualityAudit.types';
import api from './client';

export function getQualityAudits(
  params?: QualityAuditListParams,
): Promise<{ data: QualityAudit[] }> {
  return api.get<QualityAudit[]>('/pos/quality-audits/', { params });
}

export function getQualityAudit(id: number): Promise<{ data: QualityAudit }> {
  return api.get<QualityAudit>(`/pos/quality-audits/${id}/`);
}

export function createQualityAudit(formSlug: string): Promise<{ data: QualityAudit }> {
  return api.post<QualityAudit>('/pos/quality-audits/', { form: formSlug });
}

export function updateQualityAudit(
  id: number,
  data: { responses?: QualityAuditResponses; summary_notes?: string },
): Promise<{ data: QualityAudit }> {
  return api.patch<QualityAudit>(`/pos/quality-audits/${id}/`, data);
}

export function submitQualityAudit(
  id: number,
  data: { responses?: QualityAuditResponses; summary_notes?: string },
): Promise<{ data: QualityAudit }> {
  return api.post<QualityAudit>(`/pos/quality-audits/${id}/submit/`, data);
}

export function deleteQualityAudit(id: number): Promise<void> {
  return api.delete(`/pos/quality-audits/${id}/`).then(() => undefined);
}
