import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import OnlineSalesWorkQueuePage from './OnlineSalesWorkQueuePage';

const queueState = vi.hoisted(() => ({
  data: null as null | { items: unknown[]; draft_listings: unknown[] },
  isLoading: false,
  isError: false,
}));

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({ rows }: { rows?: Array<Record<string, unknown>> }) => (
    <div data-testid="data-grid-stub">
      {(rows || []).map((r) => (
        <div key={String(r.id)}>{String(r.title || r.sku || r.id)}</div>
      ))}
    </div>
  ),
}));

vi.mock('../../hooks/useWebStore', () => ({
  useWorkQueue: () => ({
    data: queueState.data,
    isLoading: queueState.isLoading,
    isError: queueState.isError,
  }),
  useCreateWebListing: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('OnlineSalesWorkQueuePage', () => {
  beforeEach(() => {
    queueState.data = null;
    queueState.isLoading = false;
    queueState.isError = false;
  });

  it('renders items and drafts', () => {
    queueState.data = {
      items: [{ id: 1, sku: 'SKU-1', title: 'Lamp', status: 'available', price: '25.00' }],
      draft_listings: [{ id: 9, title: 'Draft chair', sku: 'SKU-9', status: 'draft' }],
    };
    wrap(<OnlineSalesWorkQueuePage />);
    expect(screen.getByText('Work queue')).toBeInTheDocument();
    expect(screen.getByText(/Items at online_sales \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Lamp')).toBeInTheDocument();
    expect(screen.getByText('Draft chair')).toBeInTheDocument();
  });

  it('renders empty queues', () => {
    queueState.data = { items: [], draft_listings: [] };
    wrap(<OnlineSalesWorkQueuePage />);
    expect(screen.getByText(/Items at online_sales \(0\)/)).toBeInTheDocument();
    expect(screen.getByText(/Draft \/ ready listings \(0\)/)).toBeInTheDocument();
  });

  it('renders error state', () => {
    queueState.isError = true;
    wrap(<OnlineSalesWorkQueuePage />);
    expect(screen.getByText('Could not load the work queue.')).toBeInTheDocument();
  });
});
