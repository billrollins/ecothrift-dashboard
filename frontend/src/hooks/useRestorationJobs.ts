import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  combineRestorationJobs,
  createRestorationJobFromSku,
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
import { invalidateBenchJobs, restorationReturnsQueryKey } from './useRestorationBench';

export function useCreateRestorationJobFromSku() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sku: string) => {
      const { data } = await createRestorationJobFromSku(sku);
      return data;
    },
    onSuccess: () => invalidateBenchJobs(queryClient),
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
      // The queue page renders from the merged queued+sent cache — patch it in
      // place so debounced edits don't trigger a refetch that clobbers typing.
      queryClient.setQueryData<RestorationJobDTO[]>(
        ['restoration-queue-jobs'],
        (prev) => (prev ? prev.map((job) => (job.id === data.id ? data : job)) : prev),
      );
      // The bench cache stores expanded per-item rows; a surgical update is
      // fragile there, so just invalidate it.
      queryClient.invalidateQueries({ queryKey: ['tars-bench-jobs'] });
      queryClient.invalidateQueries({ queryKey: restorationReturnsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['restoration-job', data.id] });
      queryClient.invalidateQueries({ queryKey: ['restoration-jobs', 'valuation-pending'] });
      queryClient.invalidateQueries({ queryKey: ['restoration-jobs'] });
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
    onSuccess: () => {
      invalidateBenchJobs(queryClient);
      queryClient.invalidateQueries({ queryKey: restorationReturnsQueryKey });
    },
  });
}

export function useSplitRestorationJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: RestorationJobSplitPayload }) => {
      const { data } = await splitRestorationJob(id, payload);
      return data;
    },
    onSuccess: () => invalidateBenchJobs(queryClient),
  });
}

export function useCombineRestorationJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RestorationJobCombinePayload) => {
      const { data } = await combineRestorationJobs(payload);
      return data;
    },
    onSuccess: () => invalidateBenchJobs(queryClient),
  });
}
