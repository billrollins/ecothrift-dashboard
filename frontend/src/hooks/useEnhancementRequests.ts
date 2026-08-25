import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addEnhancementRequestNote,
  createEnhancementRequest,
  getEnhancementRequests,
  triageEnhancementRequest,
  updateEnhancementRequest,
} from '../api/enhancementRequests.api';
import type {
  EnhancementRequestTriagePayload,
  EnhancementRequestWritePayload,
} from '../types/enhancementRequests.types';

export const enhancementRequestsQueryKey = ['enhancementRequests'] as const;

export function useEnhancementRequests(enabled = true) {
  return useQuery({
    queryKey: enhancementRequestsQueryKey,
    queryFn: async () => {
      const { data } = await getEnhancementRequests();
      return data;
    },
    enabled,
  });
}

function invalidateRequests(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: enhancementRequestsQueryKey });
}

export function useCreateEnhancementRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: EnhancementRequestWritePayload) => {
      const { data } = await createEnhancementRequest(payload);
      return data;
    },
    onSuccess: () => invalidateRequests(queryClient),
  });
}

export function useUpdateEnhancementRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: EnhancementRequestWritePayload }) => {
      const { data } = await updateEnhancementRequest(id, payload);
      return data;
    },
    onSuccess: () => invalidateRequests(queryClient),
  });
}

export function useAddEnhancementRequestNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: string }) => {
      const { data } = await addEnhancementRequestNote(id, body);
      return data;
    },
    onSuccess: () => invalidateRequests(queryClient),
  });
}

export function useTriageEnhancementRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: EnhancementRequestTriagePayload }) => {
      const { data } = await triageEnhancementRequest(id, payload);
      return data;
    },
    onSuccess: () => invalidateRequests(queryClient),
  });
}
