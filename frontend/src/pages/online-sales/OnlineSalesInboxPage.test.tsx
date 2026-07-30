import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import OnlineSalesInboxPage from './OnlineSalesInboxPage';

const inboxState = vi.hoisted(() => ({
  data: null as null | { count: number; results: unknown[] },
  isLoading: false,
  isError: false,
  conversations: null as null | { count: number; results: unknown[] },
  convLoading: false,
  convError: false,
  selected: null as null | Record<string, unknown>,
}));

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({
    rows,
    onRowClick,
  }: {
    rows?: Array<Record<string, unknown>>;
    onRowClick?: (params: { row: Record<string, unknown> }) => void;
  }) => (
    <div data-testid="data-grid-stub">
      {(rows || []).map((r) => (
        <button
          type="button"
          key={String(r.id)}
          onClick={() => onRowClick?.({ row: r })}
        >
          <span>{String(r.listing_title || r.guest_name || r.id)}</span>
          <span>{String(r.customer_name || '')}</span>
          {r.status === 'requested' ? <span>Confirm</span> : null}
        </button>
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
  useConversations: () => ({
    data: inboxState.conversations,
    isLoading: inboxState.convLoading,
    isError: inboxState.convError,
  }),
  useConversation: () => ({
    data: inboxState.selected,
    isLoading: false,
  }),
  useConversationActions: () => ({
    reply: { mutateAsync: vi.fn(), isPending: false },
    assign: { mutateAsync: vi.fn(), isPending: false },
    resolve: { mutateAsync: vi.fn(), isPending: false },
    reopen: { mutateAsync: vi.fn(), isPending: false },
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
    inboxState.conversations = { count: 0, results: [] };
    inboxState.convLoading = false;
    inboxState.convError = false;
    inboxState.selected = null;
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
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('renders empty inbox', () => {
    inboxState.data = { count: 0, results: [] };
    wrap(<OnlineSalesInboxPage />);
    expect(screen.getByText('Inbox & Holds')).toBeInTheDocument();
    expect(screen.getByText(/Customer status links use unguessable tokens/)).toBeInTheDocument();
  });

  it('renders holds error state', () => {
    inboxState.isError = true;
    wrap(<OnlineSalesInboxPage />);
    expect(screen.getByText('Could not load holds.')).toBeInTheDocument();
  });

  it('switches to Messages tab and shows conversation list', async () => {
    inboxState.data = { count: 0, results: [] };
    inboxState.conversations = {
      count: 1,
      results: [
        {
          id: 3,
          guest_name: 'Ada',
          listing_title: 'Lamp',
          state: 'needs_reply',
          staff_unread: 1,
          reservation_id: 9,
          last_message_at: '2026-07-28T12:00:00Z',
        },
      ],
    };
    const user = userEvent.setup();
    wrap(<OnlineSalesInboxPage />);
    await user.click(screen.getByRole('tab', { name: 'Messages' }));
    expect(screen.getByText('Needs reply')).toBeInTheDocument();
    expect(screen.getByText('Lamp')).toBeInTheDocument();
    expect(screen.getByText(/Select a conversation/)).toBeInTheDocument();
  });
});
