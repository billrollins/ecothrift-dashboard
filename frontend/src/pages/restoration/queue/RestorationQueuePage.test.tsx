import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { expandRestorationJobsForTars } from '../tars/tarsJobAdapter';
import RestorationQueuePage from './RestorationQueuePage';

const navigate = vi.fn();
const createFromSku = vi.fn();
const jobsState = vi.hoisted(() => ({ jobs: [] as RestorationJobDTO[] }));
const lookupState = vi.hoisted(() => ({
  result: { found: 'none' as const } as
    | { found: 'none' }
    | { found: 'item'; item: { id: number; sku: string; name: string; location: string; status: string; condition: string } }
    | { found: 'job'; job: RestorationJobDTO },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1 }, isLoading: false }),
}));

vi.mock('../../../hooks/useGradeScales', () => ({
  useGradeScales: () => ({ scales: {} }),
}));

vi.mock('../../../hooks/useRestorationJobs', () => ({
  useCreateRestorationJobFromSku: () => ({ mutate: createFromSku, isPending: false }),
}));

vi.mock('../../../hooks/useRestorationBench', () => ({
  useTarsBenchJobs: () => ({ data: jobsState.jobs, isLoading: false }),
  useRestorationScoreboard: () => ({ data: undefined }),
  useMoveRestorationJobBackToQueue: () => ({ mutate: vi.fn(), isPending: false }),
  useHoldRestorationJob: () => ({ mutate: vi.fn(), isPending: false }),
  useCompleteRestorationJob: () => ({ mutate: vi.fn(), isPending: false }),
  useReopenRestorationJob: () => ({ mutate: vi.fn(), isPending: false }),
  useFixRestorationFinish: () => ({ mutate: vi.fn(), isPending: false }),
  useProcessingCheckInRestorationJob: () => ({ mutate: vi.fn(), isPending: false, mutateAsync: vi.fn() }),
  useCreateRestorationOutputItem: () => ({ mutate: vi.fn(), isPending: false, mutateAsync: vi.fn() }),
  useRemapRestorationItemProduct: () => ({ mutate: vi.fn(), isPending: false, mutateAsync: vi.fn() }),
  usePatchRestorationQueueDetails: () => ({ mutate: vi.fn() }),
  useRestorationActions: () => ({ data: { results: [], current_action_id: null } }),
  useRestorationJobTimeline: () => ({ data: [] }),
  useForgetRestorationTimelineWords: () => ({ mutate: vi.fn(), isPending: false }),
  useResetRestorationQueueNote: () => ({ mutate: vi.fn(), isPending: false }),
  useRestorationPartsOrders: () => ({ data: [], isLoading: false }),
}));

vi.mock('../../../api/inventory.api', async () => {
  const actual = await vi.importActual<typeof import('../../../api/inventory.api')>(
    '../../../api/inventory.api',
  );
  return {
    ...actual,
    lookupRestorationScan: vi.fn(async () => ({ data: lookupState.result })),
  };
});

function queuedJob(): RestorationJobDTO {
  return {
    id: 11,
    stage: 'queued',
    sku: 'ET-11',
    name: 'Lamp',
    items: [{ id: 1, sku: 'ET-11', status: 'in_stock', condition: '', location: '' }],
    grade_values: {},
    scale: 'Functional',
    queue_note: '',
    intended_destination: '',
  } as RestorationJobDTO;
}

function occupyingBenchJob(): RestorationJobDTO {
  return {
    id: 4,
    stage: 'bench',
    sku: 'ET-4',
    name: 'Radio',
    bench_owner_id: 1,
    bench_started_at: '2026-08-19T12:00:00Z',
    items: [{ id: 4, sku: 'ET-4', status: 'in_stock', condition: '', location: '' }],
    grade_values: {},
    scale: 'Functional',
    queue_note: '',
    intended_destination: '',
  } as RestorationJobDTO;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/restoration/overview']}>
          <RestorationQueuePage />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('RestorationQueuePage scan', () => {
  beforeEach(() => {
    navigate.mockReset();
    createFromSku.mockReset();
    jobsState.jobs = [queuedJob()];
    lookupState.result = { found: 'none' };
  });

  it('puts a queued item on an empty bench and opens the bench', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Scan SKU'), 'ET-11{Enter}');
    expect(navigate).toHaveBeenCalledWith('/restoration/bench?job=11&pickup=1');
  });

  it('finds a queued item when the bench already has work', async () => {
    const user = userEvent.setup();
    jobsState.jobs = [queuedJob(), occupyingBenchJob()];
    renderPage();
    await user.type(screen.getByLabelText('Scan SKU'), 'ET-11{Enter}');
    expect(navigate).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Close history' })).toBeInTheDocument();
    expect(screen.getByText('ET-11 · Lamp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inspect' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Non-actions' })).toBeInTheDocument();
  });

  it('closes history and focuses scan when the click is outside the drawer', async () => {
    const user = userEvent.setup();
    jobsState.jobs = [queuedJob(), occupyingBenchJob()];
    renderPage();
    await user.type(screen.getByLabelText('Scan SKU'), 'ET-11{Enter}');
    expect(await screen.findByRole('button', { name: 'Close history' })).toBeInTheDocument();

    await user.click(screen.getByText('Overview'));

    expect(screen.queryByRole('button', { name: 'Close history' })).toBeNull();
    expect(screen.getByLabelText('Scan SKU')).toHaveFocus();
  });

  it('offers to add a catalog item and does not create on cancel', async () => {
    const user = userEvent.setup();
    jobsState.jobs = [];
    lookupState.result = {
      found: 'item',
      item: {
        id: 9,
        sku: 'SHELF-1',
        name: 'Radio',
        location: 'A3',
        status: 'in_stock',
        condition: '',
      },
    };
    renderPage();
    await user.type(screen.getByLabelText('Scan SKU'), 'SHELF-1{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add to queue?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(createFromSku).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('RestorationQueuePage tabs', () => {
  function multiItemJob(): RestorationJobDTO {
    return {
      ...queuedJob(),
      id: 20,
      name: 'Wind Spinner',
      quantity: 3,
      items: [21, 22, 23].map((id) => ({ id, sku: `ET-${id}`, status: 'in_stock', condition: '', location: '' })),
    } as RestorationJobDTO;
  }

  function doneJob(): RestorationJobDTO {
    return { ...queuedJob(), id: 30, stage: 'done', name: 'Air Fryer', sku: 'ET-30', items: [] } as RestorationJobDTO;
  }

  function rowNames(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('[data-restoration-job]')).map(
      (row) => row.getAttribute('data-restoration-job') ?? '',
    );
  }

  beforeEach(() => {
    navigate.mockReset();
    // The page gets one row per item for a multi-item job, all with the same job id.
    jobsState.jobs = expandRestorationJobsForTars([queuedJob(), multiItemJob(), doneJob()]);
  });

  it('shows only the chosen tab\'s rows, even after fast switches', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    expect(rowNames(container).sort()).toEqual(['11', '20', '20', '20']);

    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole('tab', { name: /Done/ }));
      expect(rowNames(container)).toEqual(['30']);
      await user.click(screen.getByRole('tab', { name: /Holding/ }));
      expect(rowNames(container)).toEqual([]);
      await user.click(screen.getByRole('tab', { name: /Queue/ }));
      expect(rowNames(container).sort()).toEqual(['11', '20', '20', '20']);
    }
  });

  it('keeps every row\'s destination picker live after switching back', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: /Done/ }));
    await user.click(screen.getByRole('tab', { name: /Queue/ }));

    const pickers = screen.getAllByRole('button', { name: 'Destination for Wind Spinner' });
    expect(pickers).toHaveLength(3);
    await user.pointer({ keys: '[MouseLeft>]', target: pickers[2] });
    expect(pickers[2]).toHaveAttribute('aria-expanded', 'true');
  });
});
