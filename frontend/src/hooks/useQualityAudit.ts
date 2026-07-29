import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createQualityAudit,
  deleteQualityAudit,
  getQualityAudit,
  getQualityAudits,
  submitQualityAudit,
  updateQualityAudit,
} from '../api/qualityAudit.api';
import type {
  QualityAuditListParams,
  QualityAuditResponses,
} from '../types/qualityAudit.types';

export function useQualityAudits(
  params?: QualityAuditListParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['qualityAudits', params],
    queryFn: async () => {
      const { data } = await getQualityAudits(params);
      return data;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useQualityAudit(id: number | null) {
  return useQuery({
    queryKey: ['qualityAudits', id],
    queryFn: async () => {
      if (id == null) return null;
      const { data } = await getQualityAudit(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreateQualityAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formSlug: string) => {
      const { data } = await createQualityAudit(formSlug);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qualityAudits'] });
    },
  });
}

export function useUpdateQualityAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      responses,
      summary_notes,
    }: {
      id: number;
      responses?: QualityAuditResponses;
      summary_notes?: string;
    }) => {
      const { data } = await updateQualityAudit(id, { responses, summary_notes });
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['qualityAudits', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['qualityAudits'] });
    },
  });
}

export function useSubmitQualityAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      responses,
      summary_notes,
    }: {
      id: number;
      responses?: QualityAuditResponses;
      summary_notes?: string;
    }) => {
      const { data } = await submitQualityAudit(id, { responses, summary_notes });
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['qualityAudits', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['qualityAudits'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteQualityAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await deleteQualityAudit(id);
      return id;
    },
    onSuccess: (id) => {
      queryClient.removeQueries({ queryKey: ['qualityAudits', id] });
      queryClient.invalidateQueries({ queryKey: ['qualityAudits'] });
    },
  });
}
