import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignDocument,
  completeDocumentRecipient,
  createDocument,
  getDocument,
  getDocumentRecipient,
  getDocuments,
  getMyDocumentRecipients,
  replaceDocumentFields,
  updateDocument,
  uploadDocumentPdf,
  viewDocumentRecipient,
  type DocumentField,
  type StaffDocument,
} from '../api/documents.api';

function unwrapList<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results;
}

export function useStaffDocuments() {
  return useQuery({
    queryKey: ['documents', 'catalog'],
    queryFn: async () => unwrapList((await getDocuments()).data),
  });
}

export function useStaffDocument(id: number | null) {
  return useQuery({
    queryKey: ['documents', 'catalog', id],
    queryFn: async () => (await getDocument(id as number)).data,
    enabled: id != null,
  });
}

export function useMyDocumentRecipients() {
  return useQuery({
    queryKey: ['documents', 'mine'],
    queryFn: async () => (await getMyDocumentRecipients()).data,
    refetchInterval: 30_000,
  });
}

export function useDocumentRecipient(id: number | null) {
  return useQuery({
    queryKey: ['documents', 'recipient', id],
    queryFn: async () => (await getDocumentRecipient(id as number)).data,
    enabled: id != null,
  });
}

export function useSaveDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: number; data: Partial<StaffDocument> }) => {
      const { data } = input.id
        ? await updateDocument(input.id, input.data)
        : await createDocument(input.data);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useUploadDocumentPdf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: number; file: File }) => {
      const { data } = await uploadDocumentPdf(input.id, input.file);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useReplaceDocumentFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: number; fields: DocumentField[] }) => {
      const { data } = await replaceDocumentFields(input.id, input.fields);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useAssignDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Parameters<typeof assignDocument>) => {
      const { data } = await assignDocument(...input);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useViewDocumentRecipient() {
  return useMutation({
    mutationFn: async (id: number) => (await viewDocumentRecipient(id)).data,
  });
}

export function useCompleteDocumentRecipient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: number;
      values: Array<{ field: number; value_text?: string; value_file?: string }>;
    }) => (await completeDocumentRecipient(input.id, input.values)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}
