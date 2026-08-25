import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { RestorationActionDTO, RestorationTimelineEventDTO } from '../../../types/inventory.types';
import { mergeBenchHistory } from '../tars/tarsBenchHistory';
import { JobHistoryList } from './JobHistoryList';

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

vi.mock('../../../hooks/useRestorationBench', () => ({
  useForgetRestorationTimelineWords: () => ({ mutate: vi.fn(), isPending: false }),
  useResetRestorationQueueNote: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../../hooks/useItemNotes', () => ({
  useJobNotes: () => ({ data: [], isLoading: false }),
  useReviseItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function action(overrides: Partial<RestorationActionDTO>): RestorationActionDTO {
  return {
    id: 1,
    grade: 'Working',
    category: 'inspect',
    description: 'opened it up',
    seconds: 120,
    started_at: '2026-08-14T14:00:00Z',
    ended_at: '2026-08-14T14:02:00Z',
    created_by: 1,
    created_by_name: 'Mike',
    is_described: true,
    ...overrides,
  };
}

function event(overrides: Partial<RestorationTimelineEventDTO>): RestorationTimelineEventDTO {
  return {
    id: 10,
    job_id: 1,
    occurred_at: '2026-08-14T15:00:00Z',
    actor_id: 1,
    actor_name: 'Mike',
    status: 'active',
    supersedes_id: null,
    voided_at: null,
    voided_by_id: null,
    voided_by_name: '',
    void_reason: '',
    correlation_id: 'c',
    schema_version: 1,
    event_type: 'note.queue_changed',
    payload: { previous: '', next: 'check the cable' },
    entity_id: 'queue-note:1',
    ...overrides,
  };
}

function renderList(props: Partial<ComponentProps<typeof JobHistoryList>> & {
  rows: ComponentProps<typeof JobHistoryList>['rows'];
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <JobHistoryList empty="Nothing recorded yet." {...props} />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('JobHistoryList', () => {
  it('shows trash on a deletable comment', () => {
    const actions = [action({ id: 1 })];
    const rows = mergeBenchHistory(
      actions,
      [event({ id: 1, event_type: 'note.queue_changed', payload: { previous: '', next: 'check the cable' } })],
      1,
    );
    renderList({
      rows,
      merged: rows,
      actions,
      jobId: 4,
      currentUserId: 1,
    });
    expect(screen.getAllByTestId('history-trash-slot')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Reset the current note' })).toHaveLength(1);
  });

  it('reserves the trash slot when a later sitting by someone else locks the note', () => {
    const lockedActions = [action({ id: 2, created_by: 2, started_at: '2026-08-14T16:00:00Z' })];
    const locked = mergeBenchHistory(lockedActions, [event({ id: 1 })], null);
    renderList({
      rows: locked,
      merged: locked,
      actions: lockedActions,
      jobId: 4,
      currentUserId: 1,
    });
    expect(screen.getAllByTestId('history-trash-slot')).toHaveLength(locked.length);
    expect(screen.queryByLabelText('Reset the current note')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Clear this note history line')).not.toBeInTheDocument();
  });

  it('shows comment trash on a finished job', () => {
    const actions = [action({ id: 1 })];
    const rows = mergeBenchHistory(
      actions,
      [event({ id: 1, event_type: 'note.added', payload: { body: 'leave this', item_note_id: 9 } })],
      1,
    );
    renderList({
      rows,
      merged: rows,
      actions,
      jobId: 4,
      currentUserId: 1,
      closed: true,
    });
    expect(screen.getAllByTestId('history-trash-slot')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Clear this note history line' })).toHaveLength(1);
  });
});
