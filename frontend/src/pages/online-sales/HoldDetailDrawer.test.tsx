import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import HoldDetailDrawer from './HoldDetailDrawer';

const drawerState = vi.hoisted(() => ({
  detail: null as null | unknown,
  isLoading: false,
  isError: false,
  actionMutate: vi.fn(),
  noteMutate: vi.fn(),
}));

vi.mock('../../hooks/useWebStore', () => ({
  useReservationDetail: () => ({
    data: drawerState.detail,
    isLoading: drawerState.isLoading,
    isError: drawerState.isError,
  }),
  useReservationAction: () => ({
    mutateAsync: drawerState.actionMutate,
    isPending: false,
  }),
  useAddReservationNote: () => ({
    mutateAsync: drawerState.noteMutate,
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

const baseReservation = {
  id: 5,
  listing_title: 'Oak table',
  item_sku: 'OT-1',
  pickup_code: 'K7M4Q',
  quantity: 1,
  status: 'requested',
  status_display: 'Requested',
  customer_name: 'Casey',
  email: 'casey@example.com',
  phone: '402-555-0100',
  customer_note: '',
  release_reason: '',
  unit_price_snapshot: '50.00',
  line_total: '50.00',
  contribution: '40.00',
  pos_cart: null,
};

describe('HoldDetailDrawer', () => {
  beforeEach(() => {
    drawerState.detail = {
      reservation: { ...baseReservation },
      events: [
        {
          id: 1,
          kind: 'requested',
          kind_display: 'Requested',
          actor_name: null,
          note: '',
          created_at: '2026-07-28T10:00:00Z',
        },
      ],
      thread: null,
    };
    drawerState.isLoading = false;
    drawerState.isError = false;
    drawerState.actionMutate = vi.fn().mockResolvedValue({});
    drawerState.noteMutate = vi.fn().mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it('groups Prepare actions for a requested hold', () => {
    wrap(<HoldDetailDrawer reservationId={5} open onClose={() => {}} />);
    expect(screen.getByText('Oak table')).toBeInTheDocument();
    expect(screen.getByText('Prepare')).toBeInTheDocument();
    expect(screen.getByText('At pickup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pull item' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark ready' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'No-show' })).not.toBeInTheDocument();
  });

  it('hides Pull and Decline once the hold is being pulled', () => {
    drawerState.detail = {
      reservation: { ...baseReservation, status: 'confirmed', status_display: 'Confirmed' },
      events: [],
      thread: null,
    };
    wrap(<HoldDetailDrawer reservationId={5} open onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Pull item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark ready' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Extend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No-show' })).toBeInTheDocument();
  });

  it('hides Prepare entirely once the hold is ready', () => {
    drawerState.detail = {
      reservation: {
        ...baseReservation,
        status: 'ready_for_pickup',
        status_display: 'Ready for pickup',
      },
      events: [],
      thread: null,
    };
    wrap(<HoldDetailDrawer reservationId={5} open onClose={() => {}} />);
    expect(screen.queryByText('Prepare')).not.toBeInTheDocument();
    expect(screen.getByText('At pickup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pull item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark ready' })).not.toBeInTheDocument();
  });

  it('lists every timeline event with who and when', () => {
    drawerState.detail = {
      reservation: { ...baseReservation, status: 'ready_for_pickup' },
      events: [
        {
          id: 1,
          kind: 'requested',
          kind_display: 'Requested',
          actor_name: null,
          note: '',
          created_at: '2026-07-28T10:00:00Z',
        },
        {
          id: 2,
          kind: 'verified',
          kind_display: 'Email verified',
          actor_name: null,
          note: '',
          created_at: '2026-07-28T10:05:00Z',
        },
        {
          id: 3,
          kind: 'confirmed',
          kind_display: 'Confirmed',
          actor_name: 'Ada Manager',
          note: '',
          created_at: '2026-07-28T11:00:00Z',
        },
        {
          id: 4,
          kind: 'staged',
          kind_display: 'Staged',
          actor_name: 'Bo Staff',
          note: '',
          created_at: '2026-07-28T12:00:00Z',
        },
      ],
      thread: null,
    };
    wrap(<HoldDetailDrawer reservationId={5} open onClose={() => {}} />);
    expect(screen.getByText('Hold requested')).toBeInTheDocument();
    expect(screen.getByText('Email verified')).toBeInTheDocument();
    expect(screen.getByText('Pulled for hold')).toBeInTheDocument();
    expect(screen.getByText('Marked ready')).toBeInTheDocument();
    expect(screen.getAllByText('Customer').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Ada Manager')).toBeInTheDocument();
    expect(screen.getByText('Bo Staff')).toBeInTheDocument();
  });

  it('blocks empty decline reason', async () => {
    const user = userEvent.setup();
    wrap(<HoldDetailDrawer reservationId={5} open onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(screen.getByText(/reason is required/i)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    expect(drawerState.actionMutate).not.toHaveBeenCalled();
  });

  it('posts decline with reason', async () => {
    const user = userEvent.setup();
    wrap(<HoldDetailDrawer reservationId={5} open onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Reason'), 'Sold on floor');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(drawerState.actionMutate).toHaveBeenCalledWith({
      id: 5,
      action: 'decline',
      reason: 'Sold on floor',
    });
  }, 15_000);

  it('posts staff note', async () => {
    const user = userEvent.setup();
    wrap(<HoldDetailDrawer reservationId={5} open onClose={() => {}} />);
    await user.type(screen.getByPlaceholderText('Internal note…'), 'Called twice');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(drawerState.noteMutate).toHaveBeenCalledWith({
      id: 5,
      note: 'Called twice',
    });
  }, 15_000);

  it('hides action bar for completed holds', () => {
    drawerState.detail = {
      reservation: { ...baseReservation, status: 'completed', status_display: 'Completed' },
      events: [],
      thread: null,
    };
    wrap(<HoldDetailDrawer reservationId={5} open onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Pull item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reopen hold' })).not.toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    expect(screen.getByText('Money')).toBeInTheDocument();
  });

  it('offers Reopen on a cancelled hold and nothing else', () => {
    drawerState.detail = {
      reservation: {
        ...baseReservation,
        status: 'cancelled',
        status_display: 'Cancelled',
        release_reason: 'Item needs cleaning',
      },
      events: [],
      thread: null,
    };
    wrap(<HoldDetailDrawer reservationId={5} open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Reopen hold' })).toBeInTheDocument();
    expect(screen.getByText(/Item needs cleaning/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pull item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark ready' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
  });

  it('requires an internal note to reopen and posts it', async () => {
    const user = userEvent.setup();
    drawerState.detail = {
      reservation: { ...baseReservation, status: 'expired', status_display: 'Expired' },
      events: [],
      thread: null,
    };
    wrap(<HoldDetailDrawer reservationId={5} open onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Reopen hold' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/never shown to the customer/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Internal note'), 'Customer called back');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(drawerState.actionMutate).toHaveBeenCalledWith({
      id: 5,
      action: 'reopen',
      reason: 'Customer called back',
    });
  }, 15_000);

  it('surfaces the server reason when reopen is refused', async () => {
    const user = userEvent.setup();
    drawerState.detail = {
      reservation: { ...baseReservation, status: 'cancelled', status_display: 'Cancelled' },
      events: [],
      thread: null,
    };
    drawerState.actionMutate = vi.fn().mockRejectedValue({
      response: { data: { detail: 'Only 0 available for “Oak table” - this hold needs 1.' } },
    });
    wrap(<HoldDetailDrawer reservationId={5} open onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Reopen hold' }));
    await user.type(screen.getByLabelText('Internal note'), 'Try it');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText(/Only 0 available/)).toBeInTheDocument();
  });
});
