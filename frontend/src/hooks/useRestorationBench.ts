import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adjustRestorationJobTimer,
  checkInRestorationJob,
  completeRestorationJob,
  getRestorationPartsRequest,
  listRestorationJobs,
  listRestorationPartsRequests,
  moveRestorationJobBackToQueue,
  patchRestorationJobWorkSession,
  pauseRestorationJobTimer,
  recordRestorationPartsOrder,
  startRestorationJobTimer,
  submitRestorationPartsRequest,
  upsertRestorationPartsRequestFromJob,
  holdRestorationJob,
} from '../api/inventory.api';
import type {
  RestorationJobDTO,
  RestorationJobDonePayload,
  RestorationJobHoldPayload,
  RestorationPartsOrderCreatePayload,
} from '../types/inventory.types';
import { expandRestorationJobsForTars } from '../pages/restoration/tars/tarsJobAdapter';
import { restorationJobsQueryKey } from './useRestorationJobs';

const BENCH_STAGES = ['queued', 'sent', 'bench', 'pending'] as const;

export const restorationPartsRequestsQueryKey = (status?: string) =>
  ['restoration-parts-requests', { status }] as const;

function invalidateBenchJobs(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['restoration-jobs'] });
  queryClient.invalidateQueries({ queryKey: ['tars-bench-jobs'] });
  queryClient.invalidateQueries({ queryKey: ['restoration-queue-jobs'] });
}

function patchTarsBenchJobInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  updated: RestorationJobDTO,
) {
  queryClient.setQueryData<RestorationJobDTO[]>(['tars-bench-jobs'], (prev) => {
    if (!prev) return prev;
    return prev.map((row) => {
      if (row.id === updated.id) {
        return {
          ...row,
          ...updated,
          quantity: row.quantity,
          sku: row.sku,
          items: row.items,
        };
      }
      if (updated.timer_is_running && row.timer_is_running) {
        return {
          ...row,
          timer_is_running: false,
          timer_started_at: null,
          timer_started_by_id: null,
        };
      }
      return row;
    });
  });
}

export function useRestorationQueueJobs() {
  return useQuery({
    queryKey: ['restoration-queue-jobs'] as const,
    queryFn: async () => {
      const results = await Promise.all(
        (['queued', 'sent'] as const).map(async (stage) => {
          const { data } = await listRestorationJobs({ stage, page_size: 200 });
          return data.results;
        }),
      );
      const byId = new Map<number, RestorationJobDTO>();
      for (const job of results.flat()) byId.set(job.id, job);
      return Array.from(byId.values()).sort((a, b) => {
        const aTs = a.sent_at ?? a.created_at;
        const bTs = b.sent_at ?? b.created_at;
        return aTs.localeCompare(bTs);
      });
    },
  });
}

export function useTarsBenchJobs() {
  return useQuery({
    queryKey: ['tars-bench-jobs'] as const,
    queryFn: async () => {
      const results = await Promise.all(
        BENCH_STAGES.map(async (stage) => {
          const { data } = await listRestorationJobs({ stage, page_size: 200 });
          return data.results;
        }),
      );
      const merged = results.flat();
      const byId = new Map<number, RestorationJobDTO>();
      for (const job of merged) byId.set(job.id, job);
      return expandRestorationJobsForTars(Array.from(byId.values()));
    },
  });
}

export function useRestorationPartsRequests(options?: { status?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: restorationPartsRequestsQueryKey(options?.status),
    queryFn: async () => {
      const { data } = await listRestorationPartsRequests({
        status: options?.status,
        page_size: 200,
      });
      return data.results;
    },
    enabled: options?.enabled !== false,
  });
}

export function useRestorationPartsRequestDetail(id: number | null) {
  return useQuery({
    queryKey: ['restoration-parts-request', id] as const,
    queryFn: async () => {
      if (id == null) return null;
      const { data } = await getRestorationPartsRequest(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCheckInRestorationJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, itemId, startTimer = true }: { id: number; itemId?: number; startTimer?: boolean }) => {
      const { data } = await checkInRestorationJob(id, itemId, startTimer);
      return data;
    },
    onSuccess: () => invalidateBenchJobs(queryClient),
  });
}

export function useMoveRestorationJobBackToQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await moveRestorationJobBackToQueue(id);
      return data;
    },
    onSuccess: () => invalidateBenchJobs(queryClient),
  });
}

export function useHoldRestorationJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: RestorationJobHoldPayload }) => {
      const { data } = await holdRestorationJob(id, payload);
      return data;
    },
    onSuccess: () => invalidateBenchJobs(queryClient),
  });
}

export function useStartRestorationJobTimer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await startRestorationJobTimer(id);
      return data;
    },
    onSuccess: (data) => patchTarsBenchJobInCache(queryClient, data),
  });
}

export function usePauseRestorationJobTimer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await pauseRestorationJobTimer(id);
      return data;
    },
    onSuccess: (data) => patchTarsBenchJobInCache(queryClient, data),
  });
}

export function useAdjustRestorationJobTimer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, activeSeconds }: { id: number; activeSeconds: number }) => {
      const { data } = await adjustRestorationJobTimer(id, activeSeconds);
      return data;
    },
    onSuccess: (data) => patchTarsBenchJobInCache(queryClient, data),
  });
}

export function useCompleteRestorationJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: RestorationJobDonePayload }) => {
      const { data } = await completeRestorationJob(id, payload);
      return data;
    },
    onSuccess: () => invalidateBenchJobs(queryClient),
  });
}

export function usePatchRestorationJobWorkSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      workSession,
    }: {
      id: number;
      workSession: Record<string, unknown>;
    }) => {
      const { data } = await patchRestorationJobWorkSession(id, workSession);
      return data;
    },
    onSuccess: (data) => patchTarsBenchJobInCache(queryClient, data),
  });
}

export function useUpsertRestorationPartsRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      evalSnapshot,
      submit,
    }: {
      jobId: number;
      evalSnapshot?: Record<string, unknown>;
      submit?: boolean;
    }) => {
      const { data } = await upsertRestorationPartsRequestFromJob(
        jobId,
        { eval_snapshot: evalSnapshot },
        submit,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restoration-parts-requests'] });
    },
  });
}

export function useSubmitRestorationPartsRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await submitRestorationPartsRequest(id);
      return data;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['restoration-parts-requests'] });
      queryClient.invalidateQueries({ queryKey: ['restoration-parts-request', id] });
    },
  });
}

export function useRecordRestorationPartsOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      payload,
    }: {
      requestId: number;
      payload: RestorationPartsOrderCreatePayload;
    }) => {
      const { data } = await recordRestorationPartsOrder(requestId, payload);
      return data;
    },
    onSuccess: (_data, { requestId }) => {
      queryClient.invalidateQueries({ queryKey: ['restoration-parts-requests'] });
      queryClient.invalidateQueries({ queryKey: ['restoration-parts-request', requestId] });
    },
  });
}

export function usePatchRestorationJobGrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      selectedGrade,
      workSession,
    }: {
      id: number;
      selectedGrade: string;
      workSession: Record<string, unknown>;
    }) => {
      const { data } = await patchRestorationJobWorkSession(id, {
        ...workSession,
        selectedGrade,
      });
      return data;
    },
    onSuccess: () => invalidateBenchJobs(queryClient),
  });
}

export { restorationJobsQueryKey };
