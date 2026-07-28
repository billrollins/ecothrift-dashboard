import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeskTotalDeliveriesPage from './DeskTotalDeliveriesPage';

vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({
    hasRole: (role: string) => role === 'Manager' || role === 'Admin',
    user: { role: 'Manager' },
  }),
}));

vi.mock('../../../../hooks/useDelivery', () => ({
  useDeliveriesSearch: () => ({
    data: { count: 0, results: [] },
    isLoading: false,
  }),
  useDeliveryMutations: () => ({
    archive: { mutateAsync: vi.fn() },
    restore: { mutateAsync: vi.fn() },
    create: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('../../../../hooks/usePOS', () => ({
  useDeliveryAvailabilities: () => ({ data: [] }),
}));

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: () => <div data-testid="data-grid-stub" />,
}));

vi.mock('../../../../components/pos/delivery/AddDeliveryDialog', () => ({
  AddDeliveryDialog: ({ open }: { open: boolean }) =>
    open ? <div>Add dialog open</div> : null,
}));

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DeskTotalDeliveriesPage', () => {
  it('shows Add delivery for managers', () => {
    wrap(<DeskTotalDeliveriesPage />);
    expect(screen.getByRole('button', { name: /Add delivery/i })).toBeInTheDocument();
    expect(screen.getByTestId('data-grid-stub')).toBeInTheDocument();
  });
});
