import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  createItemNote,
  getItemNotes,
  getRestorationJobNotes,
  reviseItemNote,
  voidItemNote,
} from '../api/inventory.api';
import type { ItemNoteDTO } from '../types/inventory.types';
import { invalidateNoteSurfaces } from './useRestorationBench';

export const itemNotesQueryKey = (itemId: number | null) => ['item-notes', itemId] as const;
export const jobNotesQueryKey = (jobId: number | null) => ['restoration-job-notes', jobId] as const;

function rememberNote(
  queryClient: QueryClient,
  key: readonly unknown[],
  note: ItemNoteDTO,
) {
  queryClient.setQueryData<ItemNoteDTO[]>(key, (prev) => {
    if (!prev) return [note];
    if (prev.some((row) => row.id === note.id)) {
      return prev.map((row) => (row.id === note.id ? note : row));
    }
    return [...prev, note];
  });
}

export function useItemNotes(itemId: number | null) {
  return useQuery({
    queryKey: itemNotesQueryKey(itemId),
    queryFn: async () => {
      const { data } = await getItemNotes(itemId as number);
      return data;
    },
    enabled: itemId != null,
  });
}

export function useJobNotes(jobId: number | null) {
  return useQuery({
    queryKey: jobNotesQueryKey(jobId),
    queryFn: async () => {
      const { data } = await getRestorationJobNotes(jobId as number);
      return data;
    },
    enabled: jobId != null,
  });
}

export function useAppendItemNote(itemId: number | null, jobId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      if (itemId == null) throw new Error('No item to note.');
      const { data } = await createItemNote(itemId, body);
      return data;
    },
    onSuccess: async (note) => {
      const keys: Array<ReturnType<typeof itemNotesQueryKey> | ReturnType<typeof jobNotesQueryKey>> = [];
      if (itemId != null) keys.push(itemNotesQueryKey(itemId));
      if (jobId != null) keys.push(jobNotesQueryKey(jobId));
      for (const key of keys) rememberNote(queryClient, key, note);
      invalidateNoteSurfaces(queryClient);
      await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: key })));
      for (const key of keys) rememberNote(queryClient, key, note);
    },
  });
}

export function useReviseItemNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, body }: { noteId: number; body: string }) => {
      const { data } = await reviseItemNote(noteId, body);
      return data;
    },
    onSuccess: (note) => {
      rememberNote(queryClient, itemNotesQueryKey(note.item), note);
      if (note.restoration_job_id != null) {
        rememberNote(queryClient, jobNotesQueryKey(note.restoration_job_id), note);
      }
      invalidateNoteSurfaces(queryClient);
    },
  });
}

export function useVoidItemNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, reason }: { noteId: number; reason?: string }) => {
      const { data } = await voidItemNote(noteId, reason || 'Cleared from the notes trail.');
      return data;
    },
    onSuccess: () => {
      invalidateNoteSurfaces(queryClient);
    },
  });
}
