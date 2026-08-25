import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import UsersPage from './UsersPage';
import { STATS_STRIP_HEIGHT } from './UsersStatsStrip';

const state = vi.hoisted(() => ({
  role: 'Admin' as 'Admin' | 'Manager',
  customerStats: null as null | Record<string, number>,
  employeeStats: null as null | Record<string, number>,
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
          {String(r.full_name || r.id)}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: state.role, full_name: 'Boss' } }),
}));

vi.mock('../../../hooks/useEmployees', () => ({
  useCustomerStats: () => ({ data: state.customerStats }),
  useEmployeeStats: () => ({ data: state.employeeStats }),
  useCustomers: () => ({ data: { count: 0, results: [] }, isLoading: false, isError: false }),
  useUsers: () => ({ data: { count: 0, results: [] }, isLoading: false, isError: false }),
  useCreateCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCustomer: () => ({ data: null, isLoading: false }),
  useCustomerRollup: () => ({ data: null }),
  useUser: () => ({ data: null, isLoading: false }),
  useUpdateCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEmployeeProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReactivateCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendCustomerSignInLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendCustomerPasswordReset: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendEmployeePasswordReset: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function wrap(initial = '/admin/users') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={[initial]}>
          <UsersPage />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

/** The strip is a fixed slot; DOM height is 0 in jsdom, so assert the style. */
function stripHeight(container: HTMLElement): string | undefined {
  const strip = container.querySelector('.MuiCard-root') as HTMLElement | null;
  return strip?.style.height || getComputedStyle(strip as Element).height;
}

describe('UsersPage', () => {
  beforeEach(() => {
    state.role = 'Admin';
    state.customerStats = null;
    state.employeeStats = null;
  });

  it('paints the stats strip before any number arrives', () => {
    wrap();
    // Five tiles, every value an em-dash while the counts are still loading.
    expect(screen.getByText('Customers', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('keeps the same strip height when the tab changes', async () => {
    const user = userEvent.setup();
    state.customerStats = {
      total: 10, active: 8, inactive: 2, verified: 4, verified_pct: 50,
      new_this_month: 3, new_last_month: 1, holds_this_month: 5, needs_reply: 2,
    };
    const { container } = wrap();
    const before = stripHeight(container);

    await user.click(screen.getByRole('tab', { name: 'Employees' }));

    expect(stripHeight(container)).toBe(before);
    expect(String(before)).toContain(String(STATS_STRIP_HEIGHT));
  });

  it('hides the Employees tab from a Manager', () => {
    state.role = 'Manager';
    wrap();
    expect(screen.getByRole('tab', { name: /Customers/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Employees' })).not.toBeInTheDocument();
  });

  it('falls back to Customers when a Manager deep-links to the Employees tab', () => {
    state.role = 'Manager';
    wrap('/admin/users?tab=employees');
    expect(screen.getByRole('tab', { name: /Customers/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens the Employees tab from the URL for an Admin', () => {
    wrap('/admin/users?tab=employees');
    expect(screen.getByRole('tab', { name: 'Employees' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
