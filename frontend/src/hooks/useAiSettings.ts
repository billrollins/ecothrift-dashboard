import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveAiModel,
  createAiModel,
  discoverAiModels,
  getAiActionChoices,
  getAiActions,
  getAiModels,
  unarchiveAiModel,
  updateAiAction,
  updateAiModel,
  type AiCatalogModelWrite,
  type AiEffort,
} from '../api/aiSettings.api';

const AI_SETTINGS_KEY = ['ai-settings'] as const;
const MODELS_KEY = ['ai-settings', 'models'] as const;
const ACTIONS_KEY = ['ai-settings', 'actions'] as const;
const CHOICES_KEY = 'ai-action-choices';

export function useAiModels() {
  return useQuery({ queryKey: MODELS_KEY, queryFn: () => getAiModels().then((r) => r.data) });
}

export function useAiActions() {
  return useQuery({ queryKey: ACTIONS_KEY, queryFn: () => getAiActions().then((r) => r.data) });
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

export function useDiscoverAiModels() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: () => discoverAiModels().then((r) => r.data),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAiAction() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ purpose, data }: { purpose: string; data: { model?: number | null; effort?: AiEffort } }) =>
      updateAiAction(purpose, data).then((r) => r.data),
    onSuccess: () => invalidate(),
  });
}
