import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import EmployeesPanel from './EmployeesPanel';
import CustomersPanel from './CustomersPanel';

const state = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  customers: [] as Array<Record<string, unknown>>,
  saveProfile: vi.fn(),
  saveUser: vi.fn(),
  saveCustomer: vi.fn(),
}));

vi.mock('../../../api/hr.api', () => ({
  getDepartments: async () => ({
    data: [
      { id: 4, name: 'Retail', is_active: true },
      { id: 7, name: 'Processing', is_active: true },
    ],
  }),
}));

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({
    rows,
    columns,
  }: {
    rows?: Array<Record<string, unknown>>;
    columns?: Array<{
      field: string;
      headerName?: string;
      renderCell?: (params: { row: Record<string, unknown> }) => unknown;
    }>;
  }) => (
    <div>
      <div data-testid="headers">{(columns || []).map((c) => c.headerName).join('|')}</div>
      {(rows || []).map((row) => (
        <div key={String(row.id)}>
          {(columns || []).map((col) => (
            <div key={col.field}>{col.renderCell?.({ row }) as never}</div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../../../hooks/useEmployees', () => ({
  useUsers: () => ({ data: { count: state.users.length, results: state.users }, isLoading: false, isError: false }),
  useCustomers: () => ({
    data: { count: state.customers.length, results: state.customers },
    isLoading: false,
    isError: false,
  }),
  useCreateUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateUser: () => ({ mutateAsync: state.saveUser, isPending: false }),
  useUpdateEmployeeProfile: () => ({ mutateAsync: state.saveProfile, isPending: false }),
  useUpdateCustomer: () => ({ mutateAsync: state.saveCustomer, isPending: false }),
}));

vi.mock('../../../hooks/useIsMobileLayout', () => ({
  useIsMobileLayout: () => false,
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>{node}</SnackbarProvider>
    </QueryClientProvider>,
  );
}

const EMPLOYEE = {
  id: 11,
  email: 'ana@example.com',
  first_name: 'Ana',
  last_name: 'Reyes',
  full_name: 'Ana Reyes',
  phone: '4025550100',
  role: 'Employee',
  is_active: true,
  has_password: true,
  last_login: null,
  employee: {
    id: 3,
    employee_number: 'EMP-003',
    department: 4,
    department_name: 'Retail',
    position: 'Cashier',
    employment_type: 'full_time',
    hire_date: '2024-02-01',
    termination_date: null,
  },
};

const CUSTOMER = {
  id: 22,
  email: 'pat@example.com',
  first_name: 'Pat',
  last_name: 'Lee',
  full_name: 'Pat Lee',
  phone: '4025550199',
  customer_number: 'CUS-022',
  customer_since: '2025-01-01',
  notes: 'Prefers text',
  is_active: true,
  email_verified: true,
  holds_count: 1,
  last_hold_at: '2026-08-01T12:00:00Z',
};

describe('EmployeesPanel directory', () => {
  beforeEach(() => {
    state.users = [EMPLOYEE];
    state.saveProfile.mockReset().mockResolvedValue({});
    state.saveUser.mockReset().mockResolvedValue({});
  });

  it('orders identity, number, then the facts you edit, then status', () => {
    wrap(<EmployeesPanel onSelect={() => {}} />);
    expect(screen.getByTestId('headers').textContent).toBe(
      'Employee|#|Dept|Job|Role|Type|Phone|Tenure|Access',
    );
  });

  it('saves department and job on the row', async () => {
    const user = userEvent.setup();
    wrap(<EmployeesPanel onSelect={() => {}} />);

    const dept = await screen.findByLabelText('Department for Ana Reyes');
    await waitFor(() => expect(dept.querySelector('option[value="7"]')).toBeTruthy());
    await user.selectOptions(dept, '7');

    expect(state.saveProfile).toHaveBeenCalledWith({
      userId: 11,
      data: { department: 7 },
    });

    const job = screen.getByLabelText('Job for Ana Reyes');
    await user.clear(job);
    await user.type(job, 'Lead cashier');
    job.blur();

    expect(state.saveProfile).toHaveBeenCalledWith({
      userId: 11,
      data: { position: 'Lead cashier' },
    });
  });
});

describe('CustomersPanel directory', () => {
  beforeEach(() => {
    state.customers = [CUSTOMER];
    state.saveCustomer.mockReset().mockResolvedValue({});
  });

  it('orders identity, number, contact, notes, then work and status', () => {
    wrap(<CustomersPanel onSelect={() => {}} />);
    expect(screen.getByTestId('headers').textContent).toBe(
      'Customer|#|Phone|Notes|Holds|Account|Since',
    );
  });

  it('saves phone and notes on the row', async () => {
    const user = userEvent.setup();
    wrap(<CustomersPanel onSelect={() => {}} />);

    const phone = screen.getByLabelText('Phone for Pat Lee');
    await user.clear(phone);
    await user.type(phone, '4025550111');
    phone.blur();

    expect(state.saveCustomer).toHaveBeenCalledWith({
      id: 22,
      data: { phone: '4025550111' },
    });

    const notes = screen.getByLabelText('Notes for Pat Lee');
    await user.clear(notes);
    await user.type(notes, 'Ask for Pat at the register');
    notes.blur();

    expect(state.saveCustomer).toHaveBeenCalledWith({
      id: 22,
      data: { notes: 'Ask for Pat at the register' },
    });
  });
});
