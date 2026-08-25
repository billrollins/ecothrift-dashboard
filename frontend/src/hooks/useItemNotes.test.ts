import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ItemNoteDTO } from '../types/inventory.types';
import { jobNotesQueryKey, useAppendItemNote, useJobNotes } from './useItemNotes';

const created: ItemNoteDTO = {
  id: 12,
  item: 9,
  item_sku: 'ITM0190776',
  body: 'hinge is loose',
  surface: 'manual',
  source_key: 'manual',
  restoration_job_id: 16,
  check_in: 2,
  author: 1,
  author_name: 'Rollins, Bill',
  occurred_at: '2026-08-24T15:48:00Z',
  status: 'active',
  supersedes: null,
  voided_at: null,
  voided_by: null,
  void_reason: '',
  created_at: '2026-08-24T15:48:00Z',
};

vi.mock('../api/inventory.api', () => ({
  createItemNote: vi.fn(async () => ({ data: created })),
  getItemNotes: vi.fn(async () => ({ data: [] })),
  getRestorationJobNotes: vi.fn(async () => ({ data: [] })),
}));

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe('useAppendItemNote', () => {
  it('puts the new note on the job trail so Recent notes can render it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(jobNotesQueryKey(16), []);

    const { result } = renderHook(
      () => {
        const notes = useJobNotes(16);
        const save = useAppendItemNote(9, 16);
        return { notes, save };
      },
      { wrapper: wrapper(client) },
    );

    await result.current.save.mutateAsync('hinge is loose');

    await waitFor(() => {
      expect(result.current.notes.data?.some((row) => row.body === 'hinge is loose')).toBe(true);
    });
  });
});
