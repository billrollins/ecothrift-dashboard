import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { NOTES_BADGE_COMPACT_HEIGHT, NOTES_BADGE_COMPACT_WIDTH } from '../../../components/notes/NotesBadge';
import { TarsBenchConsole } from './TarsBenchConsole';

vi.mock('../../../hooks/useItemNotes', () => ({
  useJobNotes: () => ({
    data: [
      {
        id: 1,
        item: 9,
        item_sku: 'ITM0190776',
        body: 'keep the wheels',
        surface: 'queue',
        source_key: 'queue',
        restoration_job_id: 16,
        check_in: 2,
        author: 1,
        author_name: 'Rollins, Bill',
        occurred_at: '2026-08-21T19:59:00Z',
        status: 'active',
        supersedes: null,
        voided_at: null,
        voided_by: null,
        void_reason: '',
        created_at: '2026-08-21T19:59:00Z',
      },
    ],
    isLoading: false,
  }),
  useAppendItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReviseItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function job(): RestorationJobDTO {
  return {
    id: 16,
    sku: 'ITM0190776',
    name: 'Office chair',
    brand: 'HON',
    category: 'Office',
    upc: '012345678905',
    retail: '89.00',
    scale: 'Functional',
    grade_values: { Working: 40 },
    items: [{ id: 9, sku: 'ITM0190776', status: 'intake', condition: 'good', location: 'restoration' }],
    assigned_to_name: 'Rollins, Bill',
    stage: 'bench',
  } as unknown as RestorationJobDTO;
}

function renderConsole() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TarsBenchConsole
        job={job()}
        plan={{ startingGrade: 'Working', currentGrade: 'Working', estimates: {} }}
        scaleGrades={['Working']}
        notices={[]}
        onPlanChange={vi.fn()}
        onOpenNotices={vi.fn()}
        onHold={vi.fn()}
        onSendBack={vi.fn()}
        onReject={vi.fn()}
        onDone={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('TarsBenchConsole', () => {
  it('shows last note, add note, and a compact badge that opens the trail', async () => {
    const user = userEvent.setup();
    renderConsole();

    expect(screen.getByText('Recent notes')).toBeInTheDocument();
    expect(screen.getByText(/^Rollins, Bill · /)).toBeInTheDocument();
    expect(screen.getByText('keep the wheels')).toBeInTheDocument();
    expect(screen.getByLabelText('Add note')).toBeInTheDocument();

    const badge = screen.getByRole('button', { name: 'Notes (1)' });
    expect(badge).toHaveStyle({
      width: `${NOTES_BADGE_COMPACT_WIDTH}px`,
      height: `${NOTES_BADGE_COMPACT_HEIGHT}px`,
    });

    await user.click(badge);
    expect(screen.getByText('Notes · ITM0190776')).toBeInTheDocument();
  });

  it('keeps item, notes, stacked grades, and calculated money without a Command label', () => {
    renderConsole();
    expect(screen.queryByText('Command')).not.toBeInTheDocument();
    expect(screen.getByText('Office chair')).toBeInTheDocument();
    expect(screen.getByLabelText('Original')).toBeInTheDocument();
    expect(screen.getByLabelText('Current')).toBeInTheDocument();
    expect(screen.getByLabelText(/Value added/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Value left/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Queue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notices (0)' })).toBeInTheDocument();
    expect(screen.getByText('HON')).toBeInTheDocument();
    expect(screen.getByText('Brand')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.queryByText('UPC')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to Queue' })).not.toBeInTheDocument();
  });
});
