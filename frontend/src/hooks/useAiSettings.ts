import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptAiModelPrice,
  archiveAiModel,
  createAiModel,
  dismissAiModelPrice,
  dismissAiSuggestion,
  getAiActionChoices,
  getAiActions,
  getAiModels,
  getAiRefresh,
  getAiTierReview,
  getAiTiers,
  runAiRefresh,
  startAiTierReview,
  unarchiveAiModel,
  updateAiAction,
  updateAiModel,
  updateAiTier,
  type AiActionWrite,
  type AiCatalogModelWrite,
  type AiEffort,
  type AiTierKey,
} from '../api/aiSettings.api';

const AI_SETTINGS_KEY = ['ai-settings'] as const;
const MODELS_KEY = ['ai-settings', 'models'] as const;
const TIERS_KEY = ['ai-settings', 'tiers'] as const;
const ACTIONS_KEY = ['ai-settings', 'actions'] as const;
const REFRESH_KEY = ['ai-settings', 'refresh'] as const;
const REVIEW_KEY = ['ai-settings', 'review'] as const;
const CHOICES_KEY = 'ai-action-choices';

export function useAiModels() {
  return useQuery({ queryKey: MODELS_KEY, queryFn: () => getAiModels().then((r) => r.data) });
}

export function useAiTiers() {
  return useQuery({ queryKey: TIERS_KEY, queryFn: () => getAiTiers().then((r) => r.data) });
}

export function useAiActions() {
  return useQuery({ queryKey: ACTIONS_KEY, queryFn: () => getAiActions().then((r) => r.data) });
}

export function useAiRefreshSummary() {
  return useQuery({ queryKey: REFRESH_KEY, queryFn: () => getAiRefresh().then((r) => r.data) });
}

/** The AI tier review's state; polls every 3 s while it runs, then reloads the actions once. */
export function useAiTierReview() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: REVIEW_KEY,
    queryFn: () => getAiTierReview().then((r) => r.data),
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 3000 : false),
  });
  const status = query.data?.status;
  useEffect(() => {
    if (status === 'done' || status === 'failed') {
      void queryClient.invalidateQueries({ queryKey: ACTIONS_KEY });
    }
  }, [status, queryClient]);
  return query;
}

export function useAiActionChoices(purpose: string, enabled: boolean) {
  return useQuery({
    queryKey: [CHOICES_KEY, purpose],
    queryFn: () => getAiActionChoices(purpose).then((r) => r.data),
    enabled,
    staleTime: 0,
  });
}

function useInvalidateAi() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: AI_SETTINGS_KEY }),
      queryClient.invalidateQueries({ queryKey: [CHOICES_KEY] }),
    ]);
}

export function useCreateAiModel() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: (data: AiCatalogModelWrite) => createAiModel(data).then((r) => r.data),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAiModel() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<AiCatalogModelWrite> }) =>
      updateAiModel(id, data).then((r) => r.data),
    onSuccess: () => invalidate(),
  });
}

export function useArchiveAiModel() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: (id: number) => archiveAiModel(id).then((r) => r.data),
    onSuccess: () => invalidate(),
  });
}

export function useUnarchiveAiModel() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: (id: number) => unarchiveAiModel(id).then((r) => r.data),
    onSuccess: () => invalidate(),
  });
}

export function useAiModelPriceFlag() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ id, accept }: { id: number; accept: boolean }) =>
      (accept ? acceptAiModelPrice(id) : dismissAiModelPrice(id)).then((r) => r.data),
    onSuccess: () => invalidate(),
  });
}

export function useRunAiRefresh() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: () => runAiRefresh().then((r) => r.data),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAiTier() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ key, data }: { key: AiTierKey; data: { model?: number | null; effort?: AiEffort } }) =>
      updateAiTier(key, data).then((r) => r.data),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAiAction() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ purpose, data }: { purpose: string; data: AiActionWrite }) =>
      updateAiAction(purpose, data).then((r) => r.data),
    onSuccess: () => invalidate(),
  });
}

export function useDismissAiSuggestion() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: (purpose: string) => dismissAiSuggestion(purpose).then((r) => r.data),
    onSuccess: () => invalidate(),
  });
}

export function useStartAiTierReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startAiTierReview().then((r) => r.data),
    onSuccess: (data) => queryClient.setQueryData(REVIEW_KEY, data),
  });
}
