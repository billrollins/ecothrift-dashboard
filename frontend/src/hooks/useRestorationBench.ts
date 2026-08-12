import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adjustRestorationJobTimer,
  checkInRestorationJob,
  completeRestorationJob,
  createRestorationTimelineEvent,
  getRestorationPartsRequest,
  getRestorationScoreboard,
  listRestorationJobs,
  listRestorationJobTimeline,
  listRestorationPartsRequests,
  listRestorationReturns,
  markRestorationJobHandled,
  markRestorationJobMeaningfulAction,
  moveRestorationJobBackToQueue,
  describeRestorationAction,
  getRestorationActions,
  startRestorationAction,
  patchRestorationJobWorkSession,
  patchRestorationQueueDetails,
  pauseRestorationJobTimer,
  receiveRestorationPartsRequest,
  recordRestorationPartsOrder,
  requestRestorationJobValuation,
  reviseRestorationTimelineEvent,
  startRestorationJobTimer,
  submitRestorationPartsRequest,
  upsertRestorationPartsRequestFromJob,
  voidRestorationTimelineEvent,
  holdRestorationJob,
} from '../api/inventory.api';
import type {
  RestorationJobDTO,
  RestorationJobDonePayload,
  RestorationJobHoldPayload,
  RestorationTimelineEventType,
  RestorationPartsOrderCreatePayload,
  RestorationPartsRequestDTO,
  RestorationJobQueueDetailsPayload,
  RestorationDescribeActionPayload,
  RestorationStartActionPayload,
  TarsTimerMode,
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
  queryClient.invalidateQueries({ queryKey: ['restoration-timeline'] });
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
    refetchInterval: 10_000,
  });
}

export const restorationActionsQueryKey = (jobId: number | null | undefined) =>
  ['restoration-actions', jobId] as const;

/** Everything done to one item, with where its time went. */
export function useRestorationActions(jobId: number | null | undefined) {
  return useQuery({
    queryKey: restorationActionsQueryKey(jobId),
    queryFn: async () => {
      const { data } = await getRestorationActions(jobId as number);
      return data;
    },
    enabled: jobId != null,
  });
}

/**
 * Raised when the server refuses to open new work because the current action
 * was never described. Carries the action so the bench can point at the field
 * to fill in rather than showing a bare message.
 */
export class ActionNeedsDescriptionError extends Error {
  actionId: number | null;

  constructor(message: string, actionId: number | null) {
    super(message);
    this.name = 'ActionNeedsDescriptionError';
    this.actionId = actionId;
  }
}

function asActionError(err: unknown): unknown {
  const body = (err as { response?: { data?: { code?: string; detail?: string; action_id?: number } } })
    ?.response?.data;
  if (body?.code === 'action_needs_description') {
    return new ActionNeedsDescriptionError(body.detail ?? 'Describe what you did first.', body.action_id ?? null);
  }
  return err;
}

/** Point the clock at a piece of work. */
export function useStartRestorationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: RestorationStartActionPayload }) => {
      try {
        const { data } = await startRestorationAction(id, payload);
        return data;
      } catch (err) {
        throw asActionError(err);
      }
    },
    onSuccess: (data) => {
      patchTarsBenchJobInCache(queryClient, data);
      queryClient.invalidateQueries({ queryKey: restorationActionsQueryKey(data.id) });
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', data.id] });
    },
  });
}

/** Say what an action was, or correct it. */
export function useDescribeRestorationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: RestorationDescribeActionPayload }) => {
      const { data } = await describeRestorationAction(id, payload);
      return data;
    },
    onSuccess: (data) => {
      patchTarsBenchJobInCache(queryClient, data);
      queryClient.invalidateQueries({ queryKey: restorationActionsQueryKey(data.id) });
    },
  });
}

/**
 * Fill in a queued item's scale, values, note or destination. Available to any
 * staff member for as long as the item is unfinished.
 */
export function usePatchRestorationQueueDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: number;
      payload: RestorationJobQueueDetailsPayload;
    }) => {
      const { data } = await patchRestorationQueueDetails(id, payload);
      return data;
    },
    onSuccess: (data) => {
      patchTarsBenchJobInCache(queryClient, data);
      invalidateBenchJobs(queryClient);
    },
  });
}

export const restorationScoreboardQueryKey = ['restoration-scoreboard'] as const;

/** What restoration earned: value added and rate by day, week and month. */
export function useRestorationScoreboard() {
  return useQuery({
    queryKey: restorationScoreboardQueryKey,
    queryFn: async () => {
      const { data } = await getRestorationScoreboard();
      return data;
    },
    refetchInterval: 60_000,
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

/**
 * Start or re-aim the clock. Pass a mode to say what the seconds are for;
 * omitting it leaves the current aim alone.
 */
export function useStartRestorationJobTimer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: number | { id: number; mode?: TarsTimerMode; grade?: string },
    ) => {
      const id = typeof input === 'number' ? input : input.id;
      const aim = typeof input === 'number' ? undefined : { mode: input.mode, grade: input.grade };
      const { data } = await startRestorationJobTimer(id, aim);
      return data;
    },
    onSuccess: (data) => {
      patchTarsBenchJobInCache(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', data.id] });
    },
  });
}

export function usePauseRestorationJobTimer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: number | { id: number; reason?: string }) => {
      const id = typeof input === 'number' ? input : input.id;
      const reason = typeof input === 'number' ? 'manual' : input.reason;
      const { data } = await pauseRestorationJobTimer(id, reason);
      return data;
    },
    onSuccess: (data) => {
      patchTarsBenchJobInCache(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', data.id] });
    },
  });
}

export function useAdjustRestorationJobTimer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      activeSeconds,
      reason,
    }: {
      id: number;
      activeSeconds: number;
      reason?: string;
    }) => {
      const { data } = await adjustRestorationJobTimer(id, activeSeconds, reason);
      return data;
    },
    onSuccess: (data) => {
      patchTarsBenchJobInCache(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', data.id] });
    },
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
      // Finishing a job is the only thing that moves the scoreboard.
      queryClient.invalidateQueries({ queryKey: restorationScoreboardQueryKey });
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
    onSuccess: (data) => {
      patchTarsBenchJobInCache(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', data.id] });
    },
  });
}

export function useMarkRestorationJobMeaningfulAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, label }: { id: number; label: string }) => {
      const { data } = await markRestorationJobMeaningfulAction(id, label);
      return data;
    },
    onSuccess: (data) => patchTarsBenchJobInCache(queryClient, data),
  });
}

export function useRestorationJobTimeline(jobId: number | null) {
  return useQuery({
    queryKey: ['restoration-timeline', jobId] as const,
    queryFn: async () => {
      if (jobId == null) return [];
      const { data } = await listRestorationJobTimeline(jobId);
      return data;
    },
    enabled: jobId != null,
    refetchInterval: 5_000,
  });
}

export function useCreateRestorationTimelineEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      eventType,
      entityId,
      payload,
    }: {
      jobId: number;
      eventType: RestorationTimelineEventType;
      entityId: string;
      payload: Record<string, unknown>;
    }) => {
      const { data } = await createRestorationTimelineEvent(jobId, {
        event_type: eventType,
        entity_id: entityId,
        payload,
      });
      return data;
    },
    onSuccess: (_data, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', jobId] });
      invalidateBenchJobs(queryClient);
    },
  });
}

export function useReviseRestorationTimelineEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      eventId,
      payload,
    }: {
      jobId: number;
      eventId: number;
      payload: Record<string, unknown>;
    }) => {
      const { data } = await reviseRestorationTimelineEvent(jobId, eventId, payload);
      return data;
    },
    onSuccess: (_data, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', jobId] });
      invalidateBenchJobs(queryClient);
    },
  });
}

export function useVoidRestorationTimelineEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      eventId,
      reason,
    }: {
      jobId: number;
      eventId: number;
      reason: string;
    }) => {
      const { data } = await voidRestorationTimelineEvent(jobId, eventId, reason);
      return data;
    },
    onSuccess: (_data, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', jobId] });
      invalidateBenchJobs(queryClient);
    },
  });
}

export function useRequestRestorationJobValuation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      grades,
      notes,
    }: {
      id: number;
      grades?: string[];
      notes?: string;
    }) => {
      const { data } = await requestRestorationJobValuation(id, { grades, notes });
      return data;
    },
    onSuccess: (data) => {
      patchTarsBenchJobInCache(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['restoration-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['restoration-job', data.id] });
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', data.id] });
    },
  });
}

export function useValuationPendingJobs(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['restoration-jobs', 'valuation-pending'],
    queryFn: async () => {
      const rows = await fetchAllPages((page) =>
        listRestorationJobs({ valuation_pending: true, page, page_size: LIST_PAGE_SIZE }),
      );
      return rows;
    },
    enabled: options?.enabled ?? true,
    refetchInterval: 15_000,
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
      invalidateBenchJobs(queryClient);
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
      invalidateBenchJobs(queryClient);
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
      invalidateBenchJobs(queryClient);
    },
  });
}
