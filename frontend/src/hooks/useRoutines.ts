import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  coverRoutineRun,
  createRoutine,
  createRoutineSubmission,
  createSection,
  deleteRoutine,
  deleteSection,
  getAdminRoutines,
  getMyRoutineRuns,
  getRetailGrades,
  getRoutine,
  getRoutineAssignees,
  getRoutineRun,
  getRoutines,
  getSections,
  hardDeleteRoutine,
  patchRoutineSubmission,
  reorderSections,
  restoreRoutine,
  submitRoutineSubmission,
  updateRoutine,
  updateSection,
  type AnyRoutineResponses,
  type MyRoutines,
  type Routine,
  type RoutineSubmission,
  type Section,
} from '../api/routines.api';

function unwrapList<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results;
}

export function useMyRoutineRuns() {
  return useQuery({
    queryKey: ['routines', 'mine'],
    queryFn: async () => (await getMyRoutineRuns()).data,
    refetchInterval: 30_000,
  });
}

export function useRoutineRun(id: number | null) {
  return useQuery({
    queryKey: ['routines', 'run', id],
    queryFn: async () => (await getRoutineRun(id as number)).data,
    enabled: id != null,
  });
}

export function useRoutines() {
  return useQuery({
    queryKey: ['routines', 'catalog'],
    queryFn: async () => unwrapList((await getRoutines()).data),
  });
}

export function useRoutine(id: number | null) {
  return useQuery({
    queryKey: ['routines', 'catalog', id],
    queryFn: async () => (await getRoutine(id as number)).data,
    enabled: id != null,
  });
}

export function useRoutineAssignees() {
  return useQuery({
    queryKey: ['routines', 'assignees'],
    queryFn: async () => (await getRoutineAssignees()).data,
  });
}

export function useAdminRoutines() {
  return useQuery({
    queryKey: ['routines', 'admin'],
    queryFn: async () => (await getAdminRoutines()).data,
    refetchInterval: 60_000,
  });
}

export function useRestoreRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await restoreRoutine(id)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useHardDeleteRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await hardDeleteRoutine(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useDeleteRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await deleteRoutine(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useSaveRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: number; data: Partial<Routine> }) => {
      const { data } = input.id
        ? await updateRoutine(input.id, input.data)
        : await createRoutine(input.data);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useSections(params?: { department?: number; includeRetired?: boolean }) {
  return useQuery({
    queryKey: ['routines', 'sections', params?.department ?? null, Boolean(params?.includeRetired)],
    queryFn: async () => (await getSections(params)).data,
  });
}

export function useSaveSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: number; data: Partial<Section> }) => {
      const { data } = input.id
        ? await updateSection(input.id, input.data)
        : await createSection(input.data);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useDeleteSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await deleteSection(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useReorderSections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => (await reorderSections(ids)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useRetailGrades(week: string | null) {
  return useQuery({
    queryKey: ['routines', 'grades', week],
    queryFn: async () => (await getRetailGrades(week ?? undefined)).data,
  });
}

/** Take an absent owner's open run. Grades and My Routines both change. */
export function useCoverRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await coverRoutineRun(id)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useStartRoutineSubmission() {
  return useMutation({
    mutationFn: async (input: { routine: number; run?: number }) => {
      const { data } = await createRoutineSubmission(input);
      return data;
    },
    retry: false,
  });
}

export function useSaveRoutineDraft() {
  return useMutation({
    mutationFn: async (input: { id: number; responses: AnyRoutineResponses }) => {
      const { data } = await patchRoutineSubmission(input.id, input.responses);
      return data;
    },
  });
}

function takeSubmittedRunOffTheBoard(old: MyRoutines | undefined, submission: RoutineSubmission): MyRoutines | undefined {
  if (!old) return old;
  const runId = submission.run;
  const closed = runId == null ? undefined : old.open.find((row) => row.id === runId);
  return {
    ...old,
    open: runId == null ? old.open : old.open.filter((row) => row.id !== runId),
    done: closed
      ? [{
          ...closed,
          status: 'done',
          is_overdue: false,
          completed_at: submission.submitted_at,
          completed_by: submission.submitted_by,
        }, ...old.done]
      : old.done,
  };
}

export function useSubmitRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: number; responses: AnyRoutineResponses }) => {
      const { data } = await submitRoutineSubmission(input.id, input.responses);
      return data;
    },
    onSuccess: async (submission) => {
      queryClient.setQueryData(['routines', 'mine'], (old: MyRoutines | undefined) => (
        takeSubmittedRunOffTheBoard(old, submission)
      ));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['routines'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'metrics'] }),
      ]);
    },
  });
}
