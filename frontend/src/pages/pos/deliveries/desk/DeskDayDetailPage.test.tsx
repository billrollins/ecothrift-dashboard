import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import DeskDayDetailPage from './DeskDayDetailPage';

vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({
    hasRole: (role: string) => role === 'Manager' || role === 'Admin',
    user: { role: 'Manager' },
  }),
}));

vi.mock('../../../../hooks/useDelivery', () => ({
  useDeliveryDay: () => ({
    data: {
      id: 46,
      date: '2026-07-28',
      time_start: '09:00:00',
      time_end: '15:00:00',
      crew_size: 2,
      assigned_to: 'Jose',
      notes: '',
      is_active: true,
      is_bookable: true,
      planning_disposition: 'planned',
      display_state: 'planned',
      location_id: 1,
      primary_driver_id: 1,
      primary_driver_name: 'Jose',
      delivery_count: 1,
      items_booked: 1,
      completed_count: 0,
      cancelled_count: 0,
      is_test: false,
      test_dataset_key: null,
      run: null,
      assignments: [],
      jobs: [
        {
          id: 77,
          customer_name: 'Ada Lovelace',
          phone: '402-555-0177',
          address: '77 Binary Blvd',
          delivery_address: '77 Binary Blvd',
          items_delivered: 'Washer',
          item_count: 1,
          status: 'scheduled',
          scheduled_date: '2026-07-28',
          is_apt: false,
          unit: '',
          notes: '',
          items: [],
        },
      ],
      items: [],
    },
    isLoading: false,
    isError: false,
  }),
  useDeliveryMutations: () => ({
    update: { mutateAsync: vi.fn() },
    create: { mutateAsync: vi.fn(), isPending: false },
    addItem: { mutateAsync: vi.fn() },
    removeItem: { mutateAsync: vi.fn() },
  }),
  useDeliveryDayMutations: () => ({
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    archive: { mutateAsync: vi.fn(), isPending: false },
  }),
  useDeliveryDayHistory: () => ({ data: [], isLoading: false }),
  useDeliveryHistory: () => ({ data: [], isLoading: false }),
}));

vi.mock('../../../../hooks/useFieldDeliveryRun', () => ({
  useFieldDeliveryRun: () => ({ data: null }),
}));

vi.mock('../../../../hooks/usePOS', () => ({
  useDeliveryAvailabilities: () => ({
    data: [
      {
        id: 46,
        date: '2026-07-28',
        time_start: '09:00:00',
        time_end: '15:00:00',
        crew_size: 2,
        assigned_to: 'Jose',
        notes: '',
        is_active: true,
        delivery_count: 1,
        items_booked: 1,
      },
    ],
  }),
}));

vi.mock('./DeskDayLiveMonitor', () => ({
  DeskDayLiveMonitor: () => <div>Live monitor stub</div>,
}));

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/pos/deliveries/desk/days/46']}>
          <Routes>
            <Route path="/pos/deliveries/desk/days/:dayId" element={<DeskDayDetailPage />} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('DeskDayDetailPage', () => {
  it('shows planning rows, Add delivery, and opens adjust modal', async () => {
    wrap();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add delivery/i })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ada Lovelace'));
    expect(await screen.findByRole('button', { name: /Cancel delivery/i })).toBeInTheDocument();
  }, 15_000);
});
