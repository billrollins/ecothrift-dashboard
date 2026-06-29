import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  combineRestorationJobs,
  createRestorationJobFromSku,
  listRestorationJobs,
  patchRestorationJob,
  returnRestorationJobToProcessing,
  splitRestorationJob,
} from '../api/inventory.api';
import type {
  RestorationJobDTO,
  RestorationJobCombinePayload,
  RestorationJobPatchPayload,
  RestorationJobReturnPayload,
  RestorationJobSplitPayload,
} from '../types/inventory.types';

export const restorationJobsQueryKey = (stage = 'queued') =>
  ['restoration-jobs', { stage }] as const;

export function useRestorationJobs(options?: { stage?: string; enabled?: boolean }) {
  const stage = options?.stage ?? 'queued';

  return useQuery({
    queryKey: restorationJobsQueryKey(stage),
    queryFn: async () => {
      const { data } = await listRestorationJobs({ stage, page_size: 200 });
      return data.results;
    },
    enabled: options?.enabled !== false,
  });
}

function invalidateQueuedJobs(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['restoration-jobs'] });
  queryClient.invalidateQueries({ queryKey: ['restoration-queue-jobs'] });
}

export function useCreateRestorationJobFromSku() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sku: string) => {
      const { data } = await createRestorationJobFromSku(sku);
      return data;
    },
    onSuccess: () => invalidateQueuedJobs(queryClient),
  });
}

export function usePatchRestorationJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: RestorationJobPatchPayload }) => {
      const { data } = await patchRestorationJob(id, payload);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<RestorationJobDTO[]>(
        restorationJobsQueryKey('queued'),
        (prev) => (prev ? prev.map((job) => (job.id === data.id ? data : job)) : prev),
      );
    },
  });
}

export function useReturnRestorationJobToProcessing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: RestorationJobReturnPayload }) => {
      const { data } = await returnRestorationJobToProcessing(id, payload);
      return data;
    },
    onSuccess: () => invalidateQueuedJobs(queryClient),
  });
}

export function useSplitRestorationJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: RestorationJobSplitPayload }) => {
      const { data } = await splitRestorationJob(id, payload);
      return data;
    },
    onSuccess: () => invalidateQueuedJobs(queryClient),
  });
}

export function useCombineRestorationJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RestorationJobCombinePayload) => {
      const { data } = await combineRestorationJobs(payload);
      return data;
    },
    onSuccess: () => invalidateQueuedJobs(queryClient),
  });
}
