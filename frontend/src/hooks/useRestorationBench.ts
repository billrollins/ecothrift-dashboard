import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkInRestorationJob,
  completeRestorationJob,
  rejectRestorationJob,
  createRestorationOutputItem,
  remapItemProduct,
  fixRestorationFinish,
  processingCheckInRestorationJob,
  reopenRestorationJob,
  createRestorationTimelineEvent,
  getRestorationPartsOrder,
  getRestorationScoreboard,
  listRestorationJobs,
  listRestorationJobTimeline,
  listRestorationParts,
  listRestorationPartsOrders,
  createRestorationPart,
  updateRestorationPart,
  deleteRestorationPart,
  createRestorationPartsOrder,
  updateRestorationPartsOrder,
  requestRestorationPartsOrder,
  withdrawRestorationPartsOrder,
  requestCancelRestorationPartsOrder,
  dropQueueRestorationPartsOrder,
  resolveCancelRestorationPartsOrder,
  cancelRestorationPartsOrder,
  approveRestorationPartsOrder,
  denyRestorationPartsOrder,
  purchaseRestorationPartsOrder,
  reviseRestorationPartsOrderEta,
  receiveRestorationPartsOrder,
  inspectRestorationPartsOrder,
  listRestorationReturns,
  markRestorationJobHandled,
  moveRestorationJobBackToQueue,
  deleteRestorationAction,
  describeRestorationAction,
  getRestorationActions,
  startRestorationAction,
  undoRestorationAction,
  patchRestorationJobWorkSession,
  patchRestorationQueueDetails,
  clearRestorationHistory,
  requestRestorationJobValuation,
  reviseRestorationTimelineEvent,
  voidRestorationTimelineEvent,
  forgetRestorationTimelineWords,
  resetRestorationQueueNote,
  clearRestorationNoteHistory,
  holdRestorationJob,
} from '../api/inventory.api';
import type {
  RestorationJobDTO,
  RestorationJobDonePayload,
  RestorationOutputCreateItemPayload,
  RestorationJobHoldPayload,
  RestorationJobProcessingCheckInPayload,
  RestorationTimelineEventType,
  RestorationPartDTO,
  RestorationPartWritePayload,
  RestorationPartsOrderDTO,
  RestorationPartsLineInspectPayload,
  RestorationPartsOrderWritePayload,
  RestorationJobQueueDetailsPayload,
  RestorationDescribeActionPayload,
  RestorationStartActionPayload,
} from '../types/inventory.types';
import type { PaginatedResponse } from '../types/common.types';
import { applyOrderToCachedList } from '../pages/restoration/parts/partsOrderCache';
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

function fetchAllRestorationJobs(
  stage: string,
  extra?: { unhandled?: boolean },
): Promise<RestorationJobDTO[]> {
  return fetchAllPages<RestorationJobDTO>((page) =>
    listRestorationJobs({ stage, page, page_size: LIST_PAGE_SIZE, ...extra }),
  );
}

export const restorationPartsQueryKey = (jobId?: number | null) =>
  ['restoration-parts', { job: jobId ?? null }] as const;

export const restorationPartsOrdersQueryKey = (filters?: {
  job?: number | null;
  status?: string;
  open?: boolean;
  needs_review?: boolean;
  cancel_requested?: boolean;
  bucket?: 'live' | 'history';
  since?: string;
}) => {
  const cleaned: {
    job?: number;
    status?: string;
    open?: boolean;
    needs_review?: boolean;
    cancel_requested?: boolean;
    bucket?: 'live' | 'history';
    since?: string;
  } = {};
  if (filters?.job != null) cleaned.job = filters.job;
  if (filters?.status) cleaned.status = filters.status;
  if (filters?.open) cleaned.open = true;
  if (filters?.needs_review) cleaned.needs_review = true;
  if (filters?.cancel_requested) cleaned.cancel_requested = true;
  if (filters?.bucket) cleaned.bucket = filters.bucket;
  if (filters?.since) cleaned.since = filters.since;
  return ['restoration-parts-orders', cleaned] as const;
};

function writeJobParts(
  queryClient: ReturnType<typeof useQueryClient>,
  jobId: number,
  updater: (prev: RestorationPartDTO[]) => RestorationPartDTO[],
) {
  queryClient.setQueryData<RestorationPartDTO[]>(restorationPartsQueryKey(jobId), (prev) =>
    updater(prev ?? []),
  );
}

function upsertOrderInCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  order: RestorationPartsOrderDTO,
) {
  for (const [key, data] of queryClient.getQueriesData<RestorationPartsOrderDTO[]>({
    queryKey: ['restoration-parts-orders'],
  })) {
    if (!Array.isArray(data)) continue;
    const filters = (Array.isArray(key) ? key[1] : undefined) as
      | { bucket?: 'live' | 'history'; job?: number }
      | undefined;
    queryClient.setQueryData(key, applyOrderToCachedList(data, order, filters));
  }
  queryClient.setQueryData<RestorationPartsOrderDTO[]>(
    restorationPartsOrdersQueryKey({ job: order.job }),
    (prev) => applyOrderToCachedList(prev ?? [], order, { job: order.job }),
  );
  queryClient.setQueryData(['restoration-parts-order', order.id], order);
}

export function invalidateNoteSurfaces(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['restoration-job-notes'] });
  queryClient.invalidateQueries({ queryKey: ['item-notes'] });
  queryClient.invalidateQueries({ queryKey: ['restoration-timeline'] });
  queryClient.invalidateQueries({ queryKey: ['restoration-actions'] });
  queryClient.invalidateQueries({ queryKey: ['tars-bench-jobs'] });
  queryClient.invalidateQueries({ queryKey: ['restoration-queue-jobs'] });
}

export function invalidateBenchJobs(queryClient: ReturnType<typeof useQueryClient>) {
  invalidateNoteSurfaces(queryClient);
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
      const results = await Promise.all([
        ...BENCH_STAGES.map((stage) => fetchAllRestorationJobs(stage)),
        fetchAllRestorationJobs('done', { unhandled: true }),
      ]);
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

/** Take back the action just opened, giving its time to the one before it. */
export function useUndoRestorationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await undoRestorationAction(id);
      return data;
    },
    onSuccess: (data) => {
      patchTarsBenchJobInCache(queryClient, data);
      queryClient.invalidateQueries({ queryKey: restorationActionsQueryKey(data.id) });
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', data.id] });
    },
  });
}

/** Drop a row from the log; its time goes to the row below it. */
export function useDeleteRestorationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, actionId }: { id: number; actionId: number }) => {
      const { data } = await deleteRestorationAction(id, actionId);
      return data;
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

function invalidatePartsQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  jobId?: number,
) {
  if (jobId != null) {
    queryClient.invalidateQueries({ queryKey: restorationPartsQueryKey(jobId) });
  } else {
    queryClient.invalidateQueries({ queryKey: ['restoration-parts'] });
  }
  queryClient.invalidateQueries({ queryKey: ['restoration-parts-orders'] });
}

function rememberPartsOrder(
  queryClient: ReturnType<typeof useQueryClient>,
  order: RestorationPartsOrderDTO,
) {
  upsertOrderInCaches(queryClient, order);
  invalidatePartsQueries(queryClient, order.job);
}

export function useRestorationParts(jobId: number | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: restorationPartsQueryKey(jobId),
    queryFn: () =>
      fetchAllPages<RestorationPartDTO>((page) =>
        listRestorationParts({
          job: jobId ?? undefined,
          page,
          page_size: LIST_PAGE_SIZE,
        }),
      ),
    enabled: options?.enabled !== false && jobId != null,
    staleTime: 15_000,
  });
}

export function useRestorationPartsOrders(
  options?: {
    job?: number | null;
    status?: string;
    open?: boolean;
    needs_review?: boolean;
    cancel_requested?: boolean;
    bucket?: 'live' | 'history';
    since?: string;
    enabled?: boolean;
    refetchInterval?: number | false;
  },
) {
  return useQuery({
    queryKey: restorationPartsOrdersQueryKey({
      job: options?.job ?? null,
      status: options?.status,
      open: options?.open,
      needs_review: options?.needs_review,
      cancel_requested: options?.cancel_requested,
      bucket: options?.bucket,
      since: options?.since,
    }),
    queryFn: () =>
      fetchAllPages<RestorationPartsOrderDTO>((page) =>
        listRestorationPartsOrders({
          job: options?.job ?? undefined,
          status: options?.status,
          open: options?.open,
          needs_review: options?.needs_review,
          cancel_requested: options?.cancel_requested,
          bucket: options?.bucket,
          since: options?.since,
          page,
          page_size: LIST_PAGE_SIZE,
        }),
      ),
    enabled: options?.enabled !== false,
    staleTime: options?.bucket === 'live' ? 0 : 15_000,
    refetchOnMount: options?.bucket === 'live' ? 'always' : true,
    refetchInterval: options?.refetchInterval,
  });
}

export function useRestorationPartsOrderDetail(id: number | null) {
  return useQuery({
    queryKey: ['restoration-parts-order', id] as const,
    queryFn: async () => {
      if (id == null) return null;
      const { data } = await getRestorationPartsOrder(id);
      return data;
    },
    enabled: id != null,
  });
}

export function useCheckInRestorationJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, itemId }: { id: number; itemId?: number }) => {
      const { data } = await checkInRestorationJob(id, itemId);
      return data;
    },
    onSuccess: () => invalidateBenchJobs(queryClient),
  });
}

export function useMoveRestorationJobBackToQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note, reason }: { id: number; note?: string; reason?: string }) => {
      const { data } = await moveRestorationJobBackToQueue(id, note ?? '', reason ?? '');
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

export function useCompleteRestorationJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: RestorationJobDonePayload }) => {
      const { data } = await completeRestorationJob(id, payload);
      return data;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['tars-bench-jobs'] });
      const previous = queryClient.getQueryData<RestorationJobDTO[]>(['tars-bench-jobs']);
      queryClient.setQueryData<RestorationJobDTO[]>(['tars-bench-jobs'], (prev) =>
        prev?.map((row) =>
          row.id === id
            ? { ...row, stage: 'done', bench_owner_id: null, bench_owner_name: null }
            : row,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['tars-bench-jobs'], context.previous);
    },
    onSuccess: (job) => {
      patchTarsBenchJobInCache(queryClient, job);
      queryClient.invalidateQueries({ queryKey: restorationReturnsQueryKey });
      queryClient.invalidateQueries({ queryKey: restorationScoreboardQueryKey });
    },
  });
}

export function useRejectRestorationJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const { data } = await rejectRestorationJob(id, { reason });
      return data;
    },
    onSuccess: () => {
      invalidateBenchJobs(queryClient);
      queryClient.invalidateQueries({ queryKey: restorationReturnsQueryKey });
      queryClient.invalidateQueries({ queryKey: restorationScoreboardQueryKey });
    },
  });
}

export function useCreateRestorationOutputItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: number;
      payload: RestorationOutputCreateItemPayload;
    }) => {
      const { data } = await createRestorationOutputItem(id, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: restorationReturnsQueryKey });
    },
  });
}

export function useRemapRestorationItemProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      payload,
    }: {
      itemId: number;
      payload: Record<string, unknown>;
    }) => {
      const { data } = await remapItemProduct(itemId, payload);
      return data;
    },
    onSuccess: () => {
      invalidateBenchJobs(queryClient);
      queryClient.invalidateQueries({ queryKey: restorationReturnsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useReopenRestorationJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      const { data } = await reopenRestorationJob(id, { note });
      return data;
    },
    onSuccess: () => {
      invalidateBenchJobs(queryClient);
      queryClient.invalidateQueries({ queryKey: restorationReturnsQueryKey });
      queryClient.invalidateQueries({ queryKey: restorationScoreboardQueryKey });
    },
  });
}

export function useFixRestorationFinish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: RestorationJobDonePayload }) => {
      const { data } = await fixRestorationFinish(id, payload);
      return data;
    },
    onSuccess: () => {
      invalidateBenchJobs(queryClient);
      queryClient.invalidateQueries({ queryKey: restorationReturnsQueryKey });
      queryClient.invalidateQueries({ queryKey: restorationScoreboardQueryKey });
    },
  });
}

export function useProcessingCheckInRestorationJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: number;
      payload: RestorationJobProcessingCheckInPayload;
    }) => {
      const { data } = await processingCheckInRestorationJob(id, payload);
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
    onSuccess: (data) => {
      patchTarsBenchJobInCache(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', data.id] });
    },
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

export function useForgetRestorationTimelineWords() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, eventId }: { jobId: number; eventId: number }) => {
      const { data } = await forgetRestorationTimelineWords(jobId, eventId);
      return data;
    },
    onSuccess: (_data, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', jobId] });
      invalidateBenchJobs(queryClient);
    },
  });
}

export function useResetRestorationQueueNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, eventId }: { jobId: number; eventId: number }) => {
      const { data } = await resetRestorationQueueNote(jobId, eventId);
      return data;
    },
    onSuccess: (_data, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', jobId] });
      invalidateBenchJobs(queryClient);
    },
  });
}

export function useClearRestorationNoteHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: number) => {
      const { data } = await clearRestorationNoteHistory(jobId);
      return data;
    },
    onSuccess: (_data, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', jobId] });
    },
  });
}

export function useClearRestorationHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: number) => {
      const { data } = await clearRestorationHistory(jobId);
      return data;
    },
    onSuccess: (_data, jobId) => {
      queryClient.invalidateQueries({ queryKey: restorationActionsQueryKey(jobId) });
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

export function useCreateRestorationPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RestorationPartWritePayload) => {
      const { data } = await createRestorationPart(payload);
      return data;
    },
    onMutate: async (payload) => {
      const jobId = payload.job;
      if (jobId == null) return {};
      await queryClient.cancelQueries({ queryKey: restorationPartsQueryKey(jobId) });
      const previous = queryClient.getQueryData<RestorationPartDTO[]>(restorationPartsQueryKey(jobId));
      const now = new Date().toISOString();
      const tempId = -(Date.now() * 100 + Math.floor(Math.random() * 100));
      const optimistic: RestorationPartDTO = {
        id: tempId,
        job: jobId,
        part_number: payload.part_number ?? '',
        description: payload.description ?? '',
        url: payload.url ?? '',
        qty: payload.qty ?? 1,
        unit_price: String(payload.unit_price ?? 0),
        category: payload.category ?? 'parts',
        line_total: '0.00',
        created_at: now,
        updated_at: now,
      };
      writeJobParts(queryClient, jobId, (prev) => [...prev, optimistic]);
      return { previous, jobId, tempId };
    },
    onError: (_err, _payload, context) => {
      if (context?.jobId != null && context.previous) {
        queryClient.setQueryData(restorationPartsQueryKey(context.jobId), context.previous);
      }
    },
    onSuccess: (part, _payload, context) => {
      writeJobParts(queryClient, part.job, (prev) => {
        const withoutTemp = prev.filter((row) => row.id !== context?.tempId && row.id !== part.id);
        return [...withoutTemp, part];
      });
    },
  });
}

export function useUpdateRestorationPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: RestorationPartWritePayload }) => {
      const { data } = await updateRestorationPart(id, payload);
      return data;
    },
    onMutate: async ({ id, payload }) => {
      const matches = queryClient.getQueriesData<RestorationPartDTO[]>({ queryKey: ['restoration-parts'] });
      const snapshots: Array<[readonly unknown[], RestorationPartDTO[] | undefined]> = [];
      for (const [key, rows] of matches) {
        if (!Array.isArray(rows) || !rows.some((row) => row.id === id)) continue;
        snapshots.push([key, rows]);
        queryClient.setQueryData<RestorationPartDTO[]>(key, (prev) =>
          prev?.map((row) =>
            row.id === id
              ? {
                  ...row,
                  ...payload,
                  unit_price:
                    payload.unit_price != null ? String(payload.unit_price) : row.unit_price,
                }
              : row,
          ),
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      context?.snapshots?.forEach(([key, rows]) => queryClient.setQueryData(key, rows));
    },
    onSuccess: (part) => {
      writeJobParts(queryClient, part.job, (prev) =>
        prev.map((row) => (row.id === part.id ? part : row)),
      );
    },
  });
}

export function useDeleteRestorationPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, jobId }: { id: number; jobId: number }) => {
      await deleteRestorationPart(id);
      return { id, jobId };
    },
    onMutate: async ({ id, jobId }) => {
      await queryClient.cancelQueries({ queryKey: restorationPartsQueryKey(jobId) });
      const previous = queryClient.getQueryData<RestorationPartDTO[]>(restorationPartsQueryKey(jobId));
      writeJobParts(queryClient, jobId, (prev) => prev.filter((row) => row.id !== id));
      return { previous, jobId };
    },
    onError: (_err, _vars, context) => {
      if (context?.jobId != null && context.previous) {
        queryClient.setQueryData(restorationPartsQueryKey(context.jobId), context.previous);
      }
    },
  });
}

export function useCreateRestorationPartsOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RestorationPartsOrderWritePayload) => {
      const { data } = await createRestorationPartsOrder(payload);
      return data;
    },
    onSuccess: (order) => rememberPartsOrder(queryClient, order),
  });
}

export function useUpdateRestorationPartsOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: RestorationPartsOrderWritePayload }) => {
      const { data } = await updateRestorationPartsOrder(id, payload);
      return data;
    },
    onSuccess: (order) => rememberPartsOrder(queryClient, order),
  });
}

function usePartsOrderAction(
  fn: (id: number, extra?: never) => Promise<{ data: RestorationPartsOrderDTO }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await fn(id);
      return data;
    },
    onSuccess: (order) => rememberPartsOrder(queryClient, order),
  });
}

export function useRequestRestorationPartsOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      target_grade,
    }: {
      id: number;
      jobId: number;
      target_grade?: string;
    }) => {
      const { data } = await requestRestorationPartsOrder(
        id,
        target_grade ? { target_grade } : undefined,
      );
      return data;
    },
    onMutate: async ({ id, jobId, target_grade }) => {
      await queryClient.cancelQueries({ queryKey: restorationPartsOrdersQueryKey({ job: jobId }) });
      const previous = queryClient.getQueryData<RestorationPartsOrderDTO[]>(
        restorationPartsOrdersQueryKey({ job: jobId }),
      );
      const now = new Date().toISOString();
      queryClient.setQueryData<RestorationPartsOrderDTO[]>(
        restorationPartsOrdersQueryKey({ job: jobId }),
        (prev) =>
          prev?.map((row) =>
            row.id === id
              ? {
                  ...row,
                  status: 'requested',
                  target_grade: target_grade || row.target_grade,
                  requested_at: now,
                }
              : row,
          ),
      );
      return { previous, jobId };
    },
    onError: (_err, _vars, context) => {
      if (context?.jobId != null && context.previous) {
        queryClient.setQueryData(restorationPartsOrdersQueryKey({ job: context.jobId }), context.previous);
      }
    },
    onSuccess: (order) => {
      rememberPartsOrder(queryClient, order);
      queryClient.invalidateQueries({ queryKey: ['restoration-timeline', order.job] });
    },
  });
}

export function useWithdrawRestorationPartsOrder() {
  return usePartsOrderAction(withdrawRestorationPartsOrder);
}

export function useDropQueueRestorationPartsOrder() {
  return usePartsOrderAction(dropQueueRestorationPartsOrder);
}

export function useRequestCancelRestorationPartsOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      replacement_id,
      reason,
    }: {
      id: number;
      replacement_id?: number | null;
      reason?: string;
    }) => {
      const { data } = await requestCancelRestorationPartsOrder(id, { replacement_id, reason });
      return data;
    },
    onSuccess: (order) => rememberPartsOrder(queryClient, order),
  });
}

export function useResolveCancelRestorationPartsOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      confirmed,
      refunded,
    }: {
      id: number;
      confirmed: boolean;
      refunded?: boolean;
    }) => {
      const { data } = await resolveCancelRestorationPartsOrder(id, { confirmed, refunded });
      return data;
    },
    onSuccess: (order) => rememberPartsOrder(queryClient, order),
  });
}

export function useCancelRestorationPartsOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (arg: number | { id: number; refunded?: boolean }) => {
      const id = typeof arg === 'number' ? arg : arg.id;
      const refunded = typeof arg === 'object' ? arg.refunded : undefined;
      const { data } = await cancelRestorationPartsOrder(id, refunded ? { refunded: true } : {});
      return data;
    },
    onSuccess: (order) => rememberPartsOrder(queryClient, order),
  });
}

export function useApproveRestorationPartsOrder() {
  return usePartsOrderAction(approveRestorationPartsOrder);
}

export function useReceiveRestorationPartsOrder() {
  return usePartsOrderAction(receiveRestorationPartsOrder);
}

export function useDenyRestorationPartsOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const { data } = await denyRestorationPartsOrder(id, reason);
      return data;
    },
    onSuccess: (order) => rememberPartsOrder(queryClient, order),
  });
}

export function usePurchaseRestorationPartsOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      est_shipping_days,
      expected_delivery_on,
    }: {
      id: number;
      est_shipping_days?: number;
      expected_delivery_on?: string;
    }) => {
      const { data } = await purchaseRestorationPartsOrder(id, {
        est_shipping_days,
        expected_delivery_on,
      });
      return data;
    },
    onSuccess: (order) => rememberPartsOrder(queryClient, order),
  });
}

export function useReviseRestorationPartsOrderEta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      est_shipping_days,
      expected_delivery_on,
    }: {
      id: number;
      est_shipping_days?: number;
      expected_delivery_on?: string;
    }) => {
      const { data } = await reviseRestorationPartsOrderEta(id, {
        est_shipping_days,
        expected_delivery_on,
      });
      return data;
    },
    onSuccess: (order) => rememberPartsOrder(queryClient, order),
  });
}

export function useInspectRestorationPartsOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, lines }: { id: number; lines: RestorationPartsLineInspectPayload[] }) => {
      const { data } = await inspectRestorationPartsOrder(id, lines);
      return data;
    },
    onSuccess: (order) => rememberPartsOrder(queryClient, order),
  });
}
