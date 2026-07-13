import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adjustRestorationJobTimer,
  checkInRestorationJob,
  completeRestorationJob,
  getRestorationPartsRequest,
  listRestorationJobs,
  listRestorationPartsRequests,
  listRestorationReturns,
  markRestorationJobHandled,
  moveRestorationJobBackToQueue,
  patchRestorationJobWorkSession,
  pauseRestorationJobTimer,
  receiveRestorationPartsRequest,
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
  RestorationPartsRequestDTO,
} from '../types/inventory.types';
import type { PaginatedResponse } from '../types/common.types';
import { expandRestorationJobsForTars } from '../pages/restoration/tars/tarsJobAdapter';

const BENCH_STAGES = ['queued', 'sent', 'bench', 'pending'] as const;

const LIST_PAGE_SIZE = 200;
const MAX_LIST_PAGES = 10;

/** Follow `next` links so large lists aren't silently truncated at one page. */
async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ data: PaginatedResponse<T> }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const { data } = await fetchPage(page);
    rows.push(...data.results);
    if (!data.next) break;
  }
  return rows;
}

function fetchAllRestorationJobs(stage: string): Promise<RestorationJobDTO[]> {
  return fetchAllPages<RestorationJobDTO>((page) =>
    listRestorationJobs({ stage, page, page_size: LIST_PAGE_SIZE }),
  );
}

export const restorationPartsRequestsQueryKey = (status?: string) =>
  ['restoration-parts-requests', { status }] as const;

export function invalidateBenchJobs(queryClient: ReturnType<typeof useQueryClient>) {
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
        (['queued', 'sent'] as const).map((stage) => fetchAllRestorationJobs(stage)),
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
        BENCH_STAGES.map((stage) => fetchAllRestorationJobs(stage)),
      );
      const merged = results.flat();
      const byId = new Map<number, RestorationJobDTO>();
      for (const job of merged) byId.set(job.id, job);
      return expandRestorationJobsForTars(Array.from(byId.values()));
    },
  });
}

export const restorationReturnsQueryKey = ['restoration-returns'] as const;
export const restorationsFromDeskQueryKey = restorationReturnsQueryKey;

export function useRestorationReturns() {
  return useQuery({
    queryKey: restorationReturnsQueryKey,
    queryFn: async () => {
      const { data } = await listRestorationReturns();
      return data;
    },
  });
}

/** Processing Restorations FROM desk (worked + untouched). */
export function useRestorationsFromDesk() {
  return useRestorationReturns();
}

export function useMarkRestorationJobHandled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await markRestorationJobHandled(id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: restorationReturnsQueryKey });
      invalidateBenchJobs(queryClient);
    },
  });
}

export function useRestorationPartsRequests(options?: { status?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: restorationPartsRequestsQueryKey(options?.status),
    queryFn: () =>
      fetchAllPages<RestorationPartsRequestDTO>((page) =>
        listRestorationPartsRequests({
          status: options?.status,
          page,
          page_size: LIST_PAGE_SIZE,
        }),
      ),
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
    onSuccess: () => {
      invalidateBenchJobs(queryClient);
      queryClient.invalidateQueries({ queryKey: restorationReturnsQueryKey });
    },
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
      grade,
      evalSnapshot,
      submit,
    }: {
      jobId: number;
      grade?: string;
      evalSnapshot?: Record<string, unknown>;
      submit?: boolean;
    }) => {
      const { data } = await upsertRestorationPartsRequestFromJob(
        jobId,
        { grade, eval_snapshot: evalSnapshot },
        submit,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restoration-parts-requests'] });
      invalidateBenchJobs(queryClient);
    },
  });
}

export function useReceiveRestorationPartsRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await receiveRestorationPartsRequest(id);
      return data;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['restoration-parts-requests'] });
      queryClient.invalidateQueries({ queryKey: ['restoration-parts-request', id] });
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
