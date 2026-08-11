import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRestorationGradeScale,
  listRestorationGradeScales,
  suggestRestorationGradeScale,
} from '../api/inventory.api';
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

  // Memoized so consumers can safely use the record in effect dependency lists
  // without re-running on every render. No hardcoded fallback: the four seeded
  // scales come from the database, so an empty result means something is wrong
  // and should look wrong rather than quietly rendering plausible defaults.
  const scalesRecord = useMemo(
    () => (query.data?.length ? gradeScalesToRecord(query.data) : {}),
    [query.data],
  );

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
