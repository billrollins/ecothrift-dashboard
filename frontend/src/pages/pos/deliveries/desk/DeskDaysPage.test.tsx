import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeskDaysPage from './DeskDaysPage';

vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({
    hasRole: (role: string) => role === 'Manager' || role === 'Admin',
    user: { role: 'Manager' },
  }),
}));

vi.mock('../../../../hooks/useDelivery', () => ({
  useDeliveryDayMutations: () => ({
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    archive: { mutateAsync: vi.fn(), isPending: false },
  }),
  useDeliveryDays: () => ({
    data: {
      count: 1,
      results: [
        {
          id: 9,
          date: '2026-07-28',
          time_start: '09:00:00',
          time_end: '15:00:00',
          assigned_to: 'Jose',
          primary_driver_name: 'Jose',
          display_state: 'planned',
          delivery_count: 2,
          items_booked: 3,
          run: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/pos/deliveries/desk/days?bucket=future']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DeskDaysPage', () => {
  it('renders day rows and bucket filters', () => {
    wrap(<DeskDaysPage />);
    expect(screen.getByText('2026-07-28')).toBeInTheDocument();
    expect(screen.getByText('Jose')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Future' })).toBeInTheDocument();
  });
});
