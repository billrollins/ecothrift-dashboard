import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import OnlineSalesCustomersPage from './OnlineSalesCustomersPage';

const customersState = vi.hoisted(() => ({
  list: null as null | { count: number; results: unknown[] },
  needsReply: 0,
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
        <button type="button" key={String(r.id)} onClick={() => onRowClick?.({ row: r })}>
          {String(r.full_name || r.guest_name || r.id)}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../../hooks/useEmployees', () => ({
  useCustomers: () => ({
    data: customersState.list,
    isLoading: !customersState.list,
    isError: false,
  }),
  useCreateCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCustomer: () => ({ data: null, isLoading: false }),
  useUpdateCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReactivateCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendCustomerSignInLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../hooks/useWebStore', () => ({
  useNeedsReplyCount: () => customersState.needsReply,
  useReservations: () => ({ data: { results: [] }, isLoading: false }),
  useConversations: () => ({
    data: { count: 0, results: [] },
    isLoading: false,
    isFetching: false,
    isError: false,
    isPlaceholderData: false,
  }),
  useConversation: () => ({ data: null, isLoading: false }),
  useConversationActions: () => ({
    reply: { mutateAsync: vi.fn(), isPending: false },
    assign: { mutateAsync: vi.fn(), isPending: false },
    resolve: { mutateAsync: vi.fn(), isPending: false },
    reopen: { mutateAsync: vi.fn(), isPending: false },
    archive: { mutateAsync: vi.fn(), isPending: false },
    unarchive: { mutateAsync: vi.fn(), isPending: false },
  }),
  useReservationDetail: () => ({ data: null, isLoading: false, isError: false }),
  useReservationAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddReservationNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (opts: { queryKey?: unknown[] }) => {
      const key = JSON.stringify(opts.queryKey || []);
      if (key.includes('customers')) {
        return {
          data: customersState.list,
          isLoading: !customersState.list,
          isError: false,
          isFetching: false,
          isPlaceholderData: false,
        };
      }
      if (key.includes('mailboxTemplates')) {
        return { data: [], isLoading: false, isError: false };
      }
      return { data: undefined, isLoading: false, isError: false };
    },
    useQueryClient: () => ({
      prefetchQuery: vi.fn(),
      invalidateQueries: vi.fn(),
    }),
  };
});

function wrap(initial = '/online-sales/customers') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={[initial]}>
          <OnlineSalesCustomersPage />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('OnlineSalesCustomersPage', () => {
  beforeEach(() => {
    customersState.list = {
      count: 1,
      results: [
        {
          id: 9,
          full_name: 'Ada Lovelace',
          email: 'ada@example.com',
          phone: '3305550100',
          customer_number: 'CUS-009',
          customer_since: '2026-01-01',
          notes: '',
          is_active: true,
          email_verified: true,
          first_name: 'Ada',
          last_name: 'Lovelace',
        },
      ],
    };
    customersState.needsReply = 3;
  });

  it('shows Directory and Messages with unread badge', () => {
    wrap();
    expect(screen.getByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Directory' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Messages 3/ })).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('opens the Messages tab from the URL', async () => {
    const user = userEvent.setup();
    wrap('/online-sales/customers?tab=messages');
    expect(screen.getByRole('tab', { name: /Messages/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Directory' }));
    expect(screen.getByRole('tab', { name: 'Directory' })).toHaveAttribute('aria-selected', 'true');
  });
});
