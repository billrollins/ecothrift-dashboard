import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createQualityAuditForm,
  deleteQualityAuditForm,
  getQualityAuditForm,
  getQualityAuditForms,
  updateQualityAuditForm,
  type QualityAuditFormInput,
} from '../api/qualityAuditForms.api';

export function useQualityAuditForms(activeOnly?: boolean) {
  return useQuery({
    queryKey: ['qualityAuditForms', activeOnly],
    queryFn: async () => {
      const { data } = await getQualityAuditForms(activeOnly ? { active: true } : undefined);
      return data;
    },
  });
}

export function useQualityAuditForm(id: number | null) {
  return useQuery({
    queryKey: ['qualityAuditForms', 'detail', id],
    queryFn: async () => {
      if (id == null) return null;
      const { data } = await getQualityAuditForm(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCreateQualityAuditForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: QualityAuditFormInput) => {
      const { data } = await createQualityAuditForm(input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qualityAuditForms'] });
    },
  });
}

export function useUpdateQualityAuditForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<QualityAuditFormInput> }) => {
      const { data } = await updateQualityAuditForm(id, input);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['qualityAuditForms', 'detail', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['qualityAuditForms'] });
    },
  });
}

export function useDeleteQualityAuditForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await deleteQualityAuditForm(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qualityAuditForms'] });
    },
  });
}
