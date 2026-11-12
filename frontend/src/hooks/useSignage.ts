import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as signageApi from '../api/signage.api';
import type { SignPayload } from '../types/signage.types';

export const signsQueryKey = ['signage-signs'] as const;

export function useSigns() {
  return useQuery({
    queryKey: signsQueryKey,
    queryFn: () => signageApi.getSigns().then((r) => r.data),
  });
}

/** Sign writes can rename or drop pins, so the store map refreshes too. */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: signsQueryKey });
  queryClient.invalidateQueries({ queryKey: ['store-map'] });
}

export function useCreateSign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SignPayload) => signageApi.createSign(payload).then((r) => r.data),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateSign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & SignPayload) => signageApi.updateSign(id, payload).then((r) => r.data),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteSign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => signageApi.deleteSign(id),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUploadSignPdf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => signageApi.uploadSignPdf(id, file).then((r) => r.data),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useRemoveSignPdf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => signageApi.removeSignPdf(id).then((r) => r.data),
    onSuccess: () => invalidate(queryClient),
  });
}
