import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as signageApi from '../api/signage.api';
import type { Sign, SignPayload } from '../types/signage.types';

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

// ── #122: drafts, votes, versions ────────────────────────────────────────────

/** Every voting write answers with the fresh sign; put it straight into the list so the badges move at once. */
function useSignWrite<V>(fn: (vars: V) => Promise<{ data: Sign }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => fn(vars).then((r) => r.data),
    onSuccess: (sign) => {
      queryClient.setQueryData<Sign[]>(signsQueryKey, (old) => old?.map((s) => (s.id === sign.id ? sign : s)));
      void queryClient.invalidateQueries({ queryKey: signsQueryKey });
    },
  });
}

export const useVoteNeeded = () =>
  useSignWrite(({ id, needed }: { id: number; needed: boolean }) => signageApi.voteNeeded(id, needed));
export const useRankVersion = () =>
  useSignWrite(({ id, version }: { id: number; version: number }) => signageApi.rankVersion(id, version));
export const useClearRanks = () => useSignWrite((id: number) => signageApi.clearRanks(id));
export const useAddSignNote = () =>
  useSignWrite(({ id, text }: { id: number; text: string }) => signageApi.addSignNote(id, text));
export const useDeleteSignNote = () =>
  useSignWrite(({ id, noteId }: { id: number; noteId: number }) => signageApi.deleteSignNote(id, noteId));
export const useAddSignVersion = () =>
  useSignWrite(({ id, pdf, png, label }: { id: number; pdf: File; png: File | null; label: string }) =>
    signageApi.addSignVersion(id, pdf, png, label));
export const useDeleteSignVersion = () =>
  useSignWrite(({ id, versionId }: { id: number; versionId: number }) => signageApi.deleteSignVersion(id, versionId));
export const useApproveSign = () =>
  useSignWrite(({ id, version }: { id: number; version: number }) => signageApi.approveSign(id, version));

/** A version's PNG as a blob URL (the API needs the sign-in, so a plain img src cannot fetch it). */
export function useSignPreview(signId: number | null | undefined, versionId: number | null | undefined) {
  const query = useQuery({
    queryKey: ['signage-preview', signId, versionId],
    queryFn: () => signageApi.getSignVersionFile(signId as number, versionId as number, 'preview'),
    enabled: Boolean(signId && versionId),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) {
      setUrl(null);
      return undefined;
    }
    const next = URL.createObjectURL(query.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [query.data]);
  return { url, isLoading: query.isLoading, isError: query.isError };
}
