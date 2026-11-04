import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptDashFix,
  answerDashFix,
  addDashFixNote,
  createDashFix,
  declineDashFix,
  deleteDashFix,
  finishDashFix,
  getDashFixCount,
  getDashFixes,
  markDashFixesSeen,
  reorderDashFixes,
  setDashFixPrivate,
  startDashFix,
} from '../api/dashFixes.api';
import type { DashFixReport } from '../types/dashFixes.types';

export const dashFixesKey = ['dashFixes'] as const;
export const dashFixCountKey = ['dashFixes', 'count'] as const;

/** Refetched every 15 seconds so badges move while a coding session works. */
export const DASH_FIXES_REFRESH_MS = 15_000;

export function useDashFixes(enabled = true) {
  return useQuery({
    queryKey: dashFixesKey,
    queryFn: async () => (await getDashFixes()).data,
    enabled,
    refetchInterval: DASH_FIXES_REFRESH_MS,
  });
}

/** The bell number: owner = items waiting to be accepted; everyone else = own items that changed. */
export function useDashFixCount(enabled = true): number {
  const query = useQuery({
    queryKey: dashFixCountKey,
    queryFn: async () => (await getDashFixCount()).data.count,
    enabled,
    refetchInterval: 60_000,
  });
  return enabled ? (query.data ?? 0) : 0;
}

function useRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: dashFixesKey });
}

export function useReportDashFix() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (payload: DashFixReport) => (await createDashFix(payload)).data,
    onSuccess: refresh,
  });
}

export function useAddDashFixNote() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: string }) => (await addDashFixNote(id, body)).data,
    onSuccess: refresh,
  });
}

export function useMarkDashFixesSeen() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => (await markDashFixesSeen()).data,
    onSuccess: () => client.invalidateQueries({ queryKey: dashFixCountKey }),
  });
}

export type DashFixOwnerAction =
  | { kind: 'accept'; id: number }
  | { kind: 'decline'; id: number; reason: string }
  | { kind: 'working'; id: number }
  | { kind: 'done'; id: number; version: string }
  | { kind: 'private'; id: number; value: boolean }
  | { kind: 'answer'; id: number; answer: string }
  | { kind: 'delete'; id: number };

export function useDashFixOwnerAction() {
  const client = useQueryClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (action: DashFixOwnerAction) => {
      switch (action.kind) {
        case 'accept': return (await acceptDashFix(action.id)).data;
        case 'decline': return (await declineDashFix(action.id, action.reason)).data;
        case 'working': return (await startDashFix(action.id)).data;
        case 'done': return (await finishDashFix(action.id, action.version)).data;
        case 'private': return (await setDashFixPrivate(action.id, action.value)).data;
        case 'answer': return (await answerDashFix(action.id, action.answer)).data;
        case 'delete': await deleteDashFix(action.id); return null;
      }
    },
    onSuccess: () => {
      refresh();
      client.invalidateQueries({ queryKey: dashFixCountKey });
    },
  });
}

export function useReorderDashFixes() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (ids: number[]) => (await reorderDashFixes(ids)).data,
    onSuccess: refresh,
  });
}
