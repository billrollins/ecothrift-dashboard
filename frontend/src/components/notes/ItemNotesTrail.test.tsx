import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { ItemNoteDTO } from '../../types/inventory.types';
import { ItemNotesTrail, NOTES_TRAIL_HEIGHT } from './ItemNotesTrail';

function note(partial: Partial<ItemNoteDTO>): ItemNoteDTO {
  return {
    id: 1,
    item: 9,
    item_sku: 'ET-1',
    body: 'check the cable',
    surface: 'queue',
    source_key: 'queue',
    restoration_job_id: 4,
    check_in: 2,
    author: 1,
    author_name: 'Ashley',
    occurred_at: '2026-08-21T12:00:00Z',
    status: 'active',
    supersedes: null,
    voided_at: null,
    voided_by: null,
    void_reason: '',
    created_at: '2026-08-21T12:00:00Z',
    ...partial,
  };
}

function renderTrail(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ItemNotesTrail', () => {
  it('renders when/who and keeps a fixed height', () => {
    const { container } = renderTrail(
      <ItemNotesTrail
        notes={[
          note({ id: 1, body: 'check the cable', surface: 'queue' }),
          note({ id: 2, body: 'old', surface: 'queue', status: 'revised' }),
          note({ id: 3, body: 'voided line', surface: 'manual', status: 'voided' }),
        ]}
      />,
    );
    expect(screen.getByText('check the cable')).toBeInTheDocument();
    expect(screen.getAllByText(/Ashley/).length).toBeGreaterThan(0);
    expect(screen.queryByText('old')).not.toBeInTheDocument();
    expect(screen.queryByText('voided line')).not.toBeInTheDocument();
    const trail = container.firstElementChild as HTMLElement;
    expect(trail).toHaveStyle({ height: `${NOTES_TRAIL_HEIGHT}px` });
  });

  it('reserves the empty slot', () => {
    const { container } = renderTrail(<ItemNotesTrail notes={[]} />);
    expect(screen.getByText('No notes yet.')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveStyle({ height: `${NOTES_TRAIL_HEIGHT}px` });
  });

  it('sits in a parent well without a second box', () => {
    const { container } = renderTrail(<ItemNotesTrail notes={[]} embedded compact />);
    expect(screen.getByText('Nothing earlier.')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveStyle({ height: '88px' });
    expect(getComputedStyle(container.firstElementChild as Element).borderStyle).toBe('none');
  });

  it('reserves the trash slot and only shows the icon when can_delete', () => {
    renderTrail(
      <ItemNotesTrail
        notes={[
          note({ id: 1, body: 'mine', can_delete: true }),
          note({ id: 2, body: 'locked', can_delete: false }),
        ]}
      />,
    );
    expect(screen.getAllByTestId('note-trash-slot')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Remove this note' })).toHaveLength(1);
  });

  it('opens an editor when a note can be edited', async () => {
    const user = userEvent.setup();
    renderTrail(
      <ItemNotesTrail notes={[note({ id: 1, body: 'mine', surface: 'manual', can_edit: true })]} />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit this note' }));
    expect(screen.getByLabelText('Edit note')).toHaveValue('mine');
  });
});
