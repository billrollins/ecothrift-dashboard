import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import OnlineSalesHoldsPage from './OnlineSalesHoldsPage';

const holdsState = vi.hoisted(() => ({
  data: null as null | { count: number; results: unknown[] },
  isLoading: false,
  isError: false,
  sales: null as null | unknown[],
  salesLoading: false,
  salesError: false,
  conversations: null as null | { count: number; results: unknown[] },
  detail: null as null | unknown,
  detailLoading: false,
  detailError: false,
  actionMutate: vi.fn(),
  noteMutate: vi.fn(),
  lastReservationParams: null as null | Record<string, unknown>,
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
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../../hooks/useWebStore', () => ({
  useReservations: (params?: Record<string, unknown>) => {
    holdsState.lastReservationParams = params || null;
    return {
      data: holdsState.data,
      isLoading: holdsState.isLoading,
      isError: holdsState.isError,
    };
  },
  useSalesLog: () => ({
    data: holdsState.sales,
    isLoading: holdsState.salesLoading,
    isError: holdsState.salesError,
  }),
  useReservationAction: () => ({
    mutateAsync: holdsState.actionMutate,
    isPending: false,
  }),
  useAddReservationNote: () => ({
    mutateAsync: holdsState.noteMutate,
    isPending: false,
  }),
  useReservationDetail: () => ({
    data: holdsState.detail,
    isLoading: holdsState.detailLoading,
    isError: holdsState.detailError,
  }),
  useConversations: () => ({
    data: holdsState.conversations,
    isLoading: false,
    isError: false,
  }),
  useNeedsReplyCount: () => holdsState.conversations?.count ?? 0,
  useConversation: () => ({
    data: null,
    isLoading: false,
  }),
  useConversationActions: () => ({
    reply: { mutateAsync: vi.fn(), isPending: false },
    assign: { mutateAsync: vi.fn(), isPending: false },
    resolve: { mutateAsync: vi.fn(), isPending: false },
    reopen: { mutateAsync: vi.fn(), isPending: false },
    archive: { mutateAsync: vi.fn(), isPending: false },
    unarchive: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

function wrap(ui: React.ReactNode, initial = '/online-sales/holds') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={[initial]}>{ui}</MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('OnlineSalesHoldsPage', () => {
  beforeEach(() => {
    holdsState.data = null;
    holdsState.isLoading = false;
    holdsState.isError = false;
    holdsState.sales = [];
    holdsState.salesLoading = false;
    holdsState.salesError = false;
    holdsState.conversations = { count: 0, results: [] };
    holdsState.detail = null;
    holdsState.detailLoading = false;
    holdsState.detailError = false;
    holdsState.actionMutate = vi.fn().mockResolvedValue({});
    holdsState.noteMutate = vi.fn().mockResolvedValue({});
    holdsState.lastReservationParams = null;
  });

  it('asks the server for live holds only, so finished ones cannot fill page one', () => {
    wrap(<OnlineSalesHoldsPage />);
    expect(holdsState.lastReservationParams?.status__in).toBe(
      'pending_verification,requested,confirmed,ready_for_pickup',
    );
  });

  it('drops the active-only scope while searching, so old codes are findable', async () => {
    const user = userEvent.setup();
    wrap(<OnlineSalesHoldsPage />);
    await user.type(
      screen.getByPlaceholderText(/Search code, name, phone, email/i),
      'ada',
    );
    // Search is debounced, so the query only widens once typing settles.
    await waitFor(() => {
      expect(holdsState.lastReservationParams?.search).toBe('ada');
    });
    expect(holdsState.lastReservationParams?.status__in).toBeUndefined();
  });

  it('hides archived holds on Released until the toggle is flipped', async () => {
    const user = userEvent.setup();
    wrap(<OnlineSalesHoldsPage />, '/online-sales/holds?tab=released');
    expect(holdsState.lastReservationParams?.archived).toBe('0');
    await user.click(screen.getByLabelText('Archived'));
    expect(holdsState.lastReservationParams?.archived).toBe('1');
  });

  it('redirects the old Messages tab to the inbox', async () => {
    wrap(
      <Routes>
        <Route path="/online-sales/holds" element={<OnlineSalesHoldsPage />} />
        <Route path="/online-sales/messages" element={<div>Messages home</div>} />
      </Routes>,
      '/online-sales/holds?tab=messages',
    );
    expect(await screen.findByText('Messages home')).toBeInTheDocument();
  });

  it('exposes a Released tab scoped to cancelled / declined / expired holds', async () => {
    const user = userEvent.setup();
    wrap(<OnlineSalesHoldsPage />);
    expect(screen.getByRole('tab', { name: 'Released' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Released' }));
    expect(holdsState.lastReservationParams?.status__in).toBe('cancelled,declined,expired');
    expect(screen.getByText(/Holds archive themselves 30 days after release/i)).toBeInTheDocument();
  });

  it('renders Needs action tab with hold rows (no per-row Confirm button)', () => {
    holdsState.data = {
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
    wrap(<OnlineSalesHoldsPage />);
    expect(screen.getByText('Holds')).toBeInTheDocument();
    expect(screen.getByText('Blue sofa')).toBeInTheDocument();
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
  });

  it('opens drawer on row click with pull action', async () => {
    const user = userEvent.setup();
    holdsState.data = {
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
          release_reason: '',
          customer_note: '',
          unit_price_snapshot: '10.00',
          line_total: '10.00',
          contribution: '10.00',
          pos_cart: null,
        },
      ],
    };
    holdsState.detail = {
      reservation: {
        id: 11,
        listing_title: 'Blue sofa',
        item_sku: 'SKU-1',
        quantity: 1,
        status: 'requested',
        status_display: 'Requested',
        customer_name: 'Ada',
        email: 'ada@example.com',
        phone: '',
        customer_note: '',
        release_reason: '',
        unit_price_snapshot: '10.00',
        line_total: '10.00',
        contribution: '10.00',
        pos_cart: null,
      },
      events: [],
      thread: null,
    };
    wrap(<OnlineSalesHoldsPage />);
    await user.click(screen.getByText('Blue sofa'));
    expect(await screen.findByRole('button', { name: 'Pull item' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark ready' })).toBeInTheDocument();
  });

  it('shows Completed tab from query param with totals', async () => {
    holdsState.sales = [
      {
        id: 22,
        completed_at: '2026-07-28T16:00:00Z',
        listing_title: 'Vintage lamp',
        customer_name: 'Bill',
        quantity: 1,
        line_total: '40.00',
        contribution: '30.00',
        pos_cart: null,
      },
    ];
    wrap(<OnlineSalesHoldsPage />, '/online-sales/holds?tab=completed');
    expect(screen.getByText('Vintage lamp')).toBeInTheDocument();
    expect(screen.getByText('$40.00')).toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();
  });
});
