import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import OnlineSalesListingsPage from './OnlineSalesListingsPage';

const listingsState = vi.hoisted(() => ({
  data: null as null | { count: number; results: unknown[] },
  isLoading: false,
  isError: false,
}));

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({ rows }: { rows?: Array<Record<string, unknown>> }) => (
    <div data-testid="data-grid-stub">
      {(rows || []).map((r) => (
        <div key={String(r.id)}>{String(r.title || r.id)}</div>
      ))}
    </div>
  ),
}));

vi.mock('../../hooks/useWebStore', () => ({
  useWebListings: () => ({
    data: listingsState.data,
    isLoading: listingsState.isLoading,
    isError: listingsState.isError,
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

describe('OnlineSalesListingsPage', () => {
  beforeEach(() => {
    listingsState.data = null;
    listingsState.isLoading = false;
    listingsState.isError = false;
  });

  it('renders listing rows', () => {
    listingsState.data = {
      count: 1,
      results: [
        {
          id: 3,
          title: 'Oak dresser',
          sku: 'OD-1',
          status: 'published',
          status_display: 'Published',
          price: '120.00',
          available: 1,
          on_hand: 1,
          image_count: 2,
          updated_at: '2026-07-28T12:00:00Z',
        },
      ],
    };
    wrap(<OnlineSalesListingsPage />);
    expect(screen.getByText('Listings')).toBeInTheDocument();
    expect(screen.getByText('Oak dresser')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New listing/i })).toBeInTheDocument();
  });

  it('renders empty catalog', () => {
    listingsState.data = { count: 0, results: [] };
    wrap(<OnlineSalesListingsPage />);
    expect(screen.getByText('Listings')).toBeInTheDocument();
    expect(screen.getByText(/Click a row to open Listing Studio/)).toBeInTheDocument();
  });

  it('renders error state', () => {
    listingsState.isError = true;
    wrap(<OnlineSalesListingsPage />);
    expect(screen.getByText('Could not load listings.')).toBeInTheDocument();
  });
});
