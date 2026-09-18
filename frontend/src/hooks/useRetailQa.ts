import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignQaBoard,
  createQaCallIn,
  createQaExclude,
  createQaLeftEarly,
  ackQaNudge,
  createQaNudge,
  createQaOverride,
  getPendingQaNudges,
  getQaCrossChecks,
  getQaHistory,
  getQaMine,
  getQaPeople,
  getQaPerson,
  getQaRoutines,
  getQaSpots,
  getQaToday,
  getQaTrends,
  getQaWeek,
  previewQaWeek,
  reviewQaFlag,
  undoQaCallIn,
} from '../api/routines.api';
import {
  createRosterAssignment,
  createRosterShift,
  deleteRosterAssignment,
  deleteRosterShift,
  getRosterAssignments,
  getRosterShifts,
  updateRosterAssignment,
  updateRosterShift,
  type RosterAssignment,
  type RosterShift,
} from '../api/hr.api';

function invalidateQa(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['routines', 'qa'] });
}

export function useQaWeek(week: string) {
  return useQuery({
    queryKey: ['routines', 'qa', 'week', week],
    queryFn: async () => (await getQaWeek(week)).data,
  });
}

export function useQaToday(date: string) {
  return useQuery({
    queryKey: ['routines', 'qa', 'today', date],
    queryFn: async () => (await getQaToday(date)).data,
    refetchInterval: 30_000,
  });
}

export function useAssignQaBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: assignQaBoard,
    onSuccess: () => invalidateQa(queryClient),
  });
}

export function useQaCallIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createQaCallIn,
    onSuccess: () => invalidateQa(queryClient),
  });
}

export function useUndoQaCallIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: undoQaCallIn,
    onSuccess: () => invalidateQa(queryClient),
  });
}

export function useQaLeftEarly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createQaLeftEarly,
    onSuccess: () => invalidateQa(queryClient),
  });
}

export function useQaExclude() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createQaExclude,
    onSuccess: () => invalidateQa(queryClient),
  });
}

export function useQaOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createQaOverride,
    onSuccess: () => invalidateQa(queryClient),
  });
}

export function usePendingQaNudges(enabled = true) {
  return useQuery({
    queryKey: ['routines', 'qa', 'nudges', 'pending'],
    queryFn: async () => (await getPendingQaNudges()).data,
    refetchInterval: 15_000,
    enabled,
  });
}

export function useAckQaNudge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind, device }: { id: number; kind: 'heard' | 'not_me'; device: string }) =>
      ackQaNudge(id, { kind, device }),
    onSuccess: () => invalidateQa(queryClient),
  });
}

export function useQaNudge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createQaNudge,
    onSuccess: () => invalidateQa(queryClient),
  });
}

export function useQaSpots(params: { week?: string; section?: number; person?: number; enabled?: boolean }) {
  return useQuery({
    queryKey: ['routines', 'qa', 'spots', params],
    queryFn: async () => (await getQaSpots(params)).data,
    enabled: params.enabled !== false && Boolean(params.week || params.section || params.person),
  });
}

export function useQaCrossChecks(week?: string) {
  return useQuery({
    queryKey: ['routines', 'qa', 'cross', week],
    queryFn: async () => (await getQaCrossChecks(week)).data,
  });
}

export function useReviewQaFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: string; note: string }) =>
      reviewQaFlag(id, { status, note }),
    onSuccess: () => invalidateQa(queryClient),
  });
}

export function useQaRoutines(params: {
  date?: string;
  week?: string;
  type?: string;
  person?: number;
  status?: string;
}) {
  return useQuery({
    queryKey: ['routines', 'qa', 'routines', params],
    queryFn: async () => (await getQaRoutines(params)).data,
  });
}

export function useQaPeople(week?: string, enabled = true) {
  return useQuery({
    queryKey: ['routines', 'qa', 'people', week],
    queryFn: async () => (await getQaPeople(week)).data,
    enabled,
  });
}

export function useQaPerson(id: number | null) {
  return useQuery({
    queryKey: ['routines', 'qa', 'person', id],
    queryFn: async () => (await getQaPerson(id as number)).data,
    enabled: id != null,
  });
}

export function useQaTrends() {
  return useQuery({
    queryKey: ['routines', 'qa', 'trends'],
    queryFn: async () => (await getQaTrends()).data,
  });
}

export function useQaMine(week?: string) {
  return useQuery({
    queryKey: ['routines', 'qa', 'mine', week],
    queryFn: async () => (await getQaMine(week)).data,
  });
}

export function useQaPreview() {
  return useMutation({
    mutationFn: (values: Record<string, unknown>) => previewQaWeek(values).then((row) => row.data),
  });
}

export function useQaHistory() {
  return useQuery({
    queryKey: ['routines', 'qa', 'history'],
    queryFn: async () => (await getQaHistory()).data,
  });
}

export function useRosterShifts() {
  return useQuery({
    queryKey: ['hr', 'roster-shifts'],
    queryFn: async () => (await getRosterShifts()).data,
  });
}

export function useRosterAssignments() {
  return useQuery({
    queryKey: ['hr', 'roster-assignments'],
    queryFn: async () => (await getRosterAssignments()).data,
  });
}

export function useSaveRosterShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: number; data: Partial<RosterShift> }) => (
      input.id
        ? (await updateRosterShift(input.id, input.data)).data
        : (await createRosterShift(input.data)).data
    ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr', 'roster-shifts'] });
      void queryClient.invalidateQueries({ queryKey: ['hr', 'roster-assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['hr', 'clockTiles'] });
      void queryClient.invalidateQueries({ queryKey: ['routines', 'qa'] });
    },
  });
}

export function useDeleteRosterShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRosterShift,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr', 'roster-shifts'] });
      void queryClient.invalidateQueries({ queryKey: ['hr', 'roster-assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['hr', 'clockTiles'] });
    },
  });
}

export function useSaveRosterAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: number; data: Partial<RosterAssignment> }) => (
      input.id
        ? (await updateRosterAssignment(input.id, input.data)).data
        : (await createRosterAssignment({
            employee: Number(input.data.employee),
            shift: Number(input.data.shift),
            weekdays: input.data.weekdays,
          })).data
    ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr', 'roster-assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['routines', 'qa'] });
    },
  });
}

export function useDeleteRosterAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRosterAssignment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr', 'roster-assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['routines', 'qa'] });
    },
  });
}
