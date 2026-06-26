import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRestorationGradeScale,
  listRestorationGradeScales,
  suggestRestorationGradeScale,
} from '../api/inventory.api';
import { TARS_GRADE_SCALES } from '../pages/restoration/tars/tarsConstants';
import type {
  RestorationGradeScaleCreatePayload,
  RestorationGradeScaleDTO,
  RestorationGradeScaleSuggestParams,
} from '../types/inventory.types';

export const gradeScalesQueryKey = ['restoration-grade-scales'] as const;

export function gradeScalesToRecord(scales: RestorationGradeScaleDTO[]): Record<string, string[]> {
  return Object.fromEntries(scales.map((row) => [row.name, row.grades]));
}

export function useGradeScales() {
  const query = useQuery({
    queryKey: gradeScalesQueryKey,
    queryFn: async () => {
      const { data } = await listRestorationGradeScales();
      return data;
    },
    staleTime: 60_000,
  });

  const scalesRecord = query.data?.length
    ? gradeScalesToRecord(query.data)
    : TARS_GRADE_SCALES;

  return {
    ...query,
    scales: scalesRecord,
    scaleList: query.data ?? [],
  };
}

export function useSuggestedGradeScale(
  params: RestorationGradeScaleSuggestParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['restoration-grade-scale-suggest', params] as const,
    queryFn: async () => {
      const { data } = await suggestRestorationGradeScale(params);
      return data;
    },
    enabled: options?.enabled !== false,
    staleTime: 30_000,
  });
}

export function useCreateRestorationGradeScale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RestorationGradeScaleCreatePayload) => {
      const { data } = await createRestorationGradeScale(payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gradeScalesQueryKey });
      queryClient.invalidateQueries({ queryKey: ['restoration-grade-scale-suggest'] });
    },
  });
}
