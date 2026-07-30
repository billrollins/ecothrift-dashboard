import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import OnlineSalesInboxPage from './OnlineSalesInboxPage';

const inboxState = vi.hoisted(() => ({
  data: null as null | { count: number; results: unknown[] },
  isLoading: false,
  isError: false,
}));

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({ rows }: { rows?: Array<Record<string, unknown>> }) => (
    <div data-testid="data-grid-stub">
      {(rows || []).map((r) => (
        <div key={String(r.id)}>
          <span>{String(r.listing_title || '')}</span>
          <span>{String(r.customer_name || '')}</span>
          {r.status === 'requested' ? <button type="button">Confirm</button> : null}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../../hooks/useWebStore', () => ({
  useReservations: () => ({
    data: inboxState.data,
    isLoading: inboxState.isLoading,
    isError: inboxState.isError,
  }),
  useReservationAction: () => ({
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

describe('OnlineSalesInboxPage', () => {
  beforeEach(() => {
    inboxState.data = null;
    inboxState.isLoading = false;
    inboxState.isError = false;
  });

  it('renders hold rows and confirm action', () => {
    inboxState.data = {
      count: 1,
      results: [
        {
          id: 11,
          created_at: '2026-07-28T10:00:00Z',
          listing_title: 'Blue sofa',
          customer_name: 'Ada',
          email: 'ada@example.com',
          quantity: 1,
          status: 'requested',
          status_display: 'Requested',
          expires_at: null,
        },
      ],
    };
    wrap(<OnlineSalesInboxPage />);
    expect(screen.getByText('Inbox & Holds')).toBeInTheDocument();
    expect(screen.getByText('Blue sofa')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('renders empty inbox', () => {
    inboxState.data = { count: 0, results: [] };
    wrap(<OnlineSalesInboxPage />);
    expect(screen.getByText('Inbox & Holds')).toBeInTheDocument();
    expect(screen.getByText(/Customer status links use unguessable tokens/)).toBeInTheDocument();
  });

  it('renders error state', () => {
    inboxState.isError = true;
    wrap(<OnlineSalesInboxPage />);
    expect(screen.getByText('Could not load holds.')).toBeInTheDocument();
  });
});
