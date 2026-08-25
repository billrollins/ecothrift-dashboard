import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { describe, expect, it, vi } from 'vitest';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { TarsDoneDialog } from './TarsDoneDialog';

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

vi.mock('../../../hooks/useItemNotes', () => ({
  useJobNotes: () => ({ data: [], isLoading: false }),
  useItemNotes: () => ({ data: [], isLoading: false }),
  useAppendItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReviseItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidItemNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../hooks/useRestorationBench', () => ({
  useForgetRestorationTimelineWords: () => ({ mutate: vi.fn(), isPending: false }),
  useResetRestorationQueueNote: () => ({ mutate: vi.fn(), isPending: false }),
  useRestorationActions: () => ({
    data: {
      current_action_id: 1,
      results: [
        {
          id: 1,
          category: 'inspect',
          description: 'looked it over',
          seconds: 0,
          started_at: '2026-08-21T14:00:00Z',
          ended_at: null,
          created_by: 1,
          created_by_name: 'Rollins, Bill',
        },
        {
          id: 2,
          category: 'repair',
          description: 'swapped the board',
          seconds: 0,
          started_at: '2026-08-21T14:10:00Z',
          ended_at: '2026-08-21T14:40:00Z',
          created_by: 1,
          created_by_name: 'Rollins, Bill',
        },
      ],
    },
  }),
  useRestorationJobTimeline: () => ({ data: [], isLoading: false }),
}));

function job(): RestorationJobDTO {
  return {
    id: 15,
    stage: 'bench',
    quantity: 1,
    scale: 'Functional',
    grade_values: { Working: 40, Repairable: 18, 'Parts-only': 5 },
    product_id: 1,
    purchase_order_id: 1,
    sku: 'ITM0190776',
    name: 'Hair dryer',
    brand: 'Conair',
    model: '',
    category: 'Small appliances',
    product_number: '',
    upc: '',
    processing_handoff: null,
    source: null,
    condition: 'good',
    retail: '49.99',
    price: '19.99',
    purchase_order_number: 'PO-1',
    return_disposition_type: '',
    return_reason: '',
    return_scale: '',
    return_grade: '',
    return_notes: '',
    item_check_in_id: 1,
    items: [{ id: 9, sku: 'ITM0190776', status: 'intake', condition: 'good', location: 'restoration' }],
    created_at: '2026-08-21T00:00:00Z',
    updated_at: '2026-08-21T00:00:00Z',
    sent_at: null,
    returned_at: null,
    bench_started_at: '2026-08-21T00:00:00Z',
    pending_reason: '',
    pending_notes: '',
    pending_storage_location: '',
    pending_started_at: null,
    intended_destination: 'shelf',
    queue_note: '',
    bench_disposition: '',
    current_action: 1,
    starting_grade: 'Parts-only',
    final_grade: '',
    disposition_notes: '',
    spent_parts_cost: null,
    value_added: null,
    dispositioned_at: null,
    processing_handled_at: null,
    action_count: 2,
    needs_setup: false,
  };
}

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <TarsDoneDialog
          open
          job={job()}
          evaluation={null}
          partsCost={{ parts: 4, supplies: 1, ffe: 0 }}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('TarsDoneDialog', () => {
  it('shows Dispatch, Notes, and Actions tabs with the four stat cards', () => {
    renderDialog();
    expect(screen.getByRole('tab', { name: 'Dispatch' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getAllByText('Item').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ITM0190776').length).toBeGreaterThan(0);
    expect(screen.getByText('Grade')).toBeInTheDocument();
    expect(screen.getByText('Value added')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByText('Additionals')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('adds an additional line without shifting the main SKU', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByLabelText('Item')).toBeInTheDocument();
    expect(screen.getAllByText('ITM0190776').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Dispatched to').length).toBeGreaterThan(1);
  });

  it('lets the user open Notes and Actions without leaving the dispatch table in the document', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'Notes' }));
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Actions' }));
    expect(screen.getByRole('tab', { name: 'Actions' })).toHaveAttribute('aria-selected', 'true');
  });
});
