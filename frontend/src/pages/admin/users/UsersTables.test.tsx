import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import EmployeesPanel from './EmployeesPanel';

const state = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  customers: [] as Array<Record<string, unknown>>,
  saveProfile: vi.fn(),
  saveUser: vi.fn(),
  saveCustomer: vi.fn(),
  viewer: { id: 1, is_superuser: false, view_as: null } as Record<string, unknown>,
  startViewAs: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: state.viewer, startViewAs: state.startViewAs }),
}));

vi.mock('../../../api/hr.api', () => ({
  getDepartments: async () => ({
    data: [
      { id: 4, name: 'Retail', is_active: true },
      { id: 7, name: 'Processing', is_active: true },
    ],
  }),
  mergeCurrentDepartment: (list: unknown[], current?: { id?: number; name?: string }) => {
    if (!current?.id) return list;
    return list.some((row) => (row as { id: number }).id === current.id)
      ? list
      : [...list, { id: current.id, name: current.name || `Department ${current.id}` }];
  },
  mergeCurrentDepartments: (list: unknown[], currents: Array<{ id?: number; name?: string }>) => {
    let next = list;
    for (const current of currents) {
      if (!current?.id || next.some((row) => (row as { id: number }).id === current.id)) continue;
      next = [...next, { id: current.id, name: current.name || `Department ${current.id}` }];
    }
    return next;
  },
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

describe('EmployeesPanel directory', () => {
  beforeEach(() => {
    state.users = [EMPLOYEE];
    state.viewer = { id: 1, is_superuser: false, view_as: null };
    state.startViewAs.mockReset().mockResolvedValue(undefined);
    state.saveProfile.mockReset().mockResolvedValue({});
    state.saveUser.mockReset().mockResolvedValue({});
  });

  it('orders identity, number, then the facts you edit, then status', () => {
    wrap(<EmployeesPanel onSelect={() => {}} />);
    expect(screen.getByTestId('headers').textContent).toBe(
      'Employee|#|Dept|Job|Level|Role|Type|Phone|Tenure|Access',
    );
  });

  it('gives the owner a View as button on each person, never on another owner', async () => {
    state.viewer = { id: 1, is_superuser: true, view_as: null };
    state.users = [EMPLOYEE, { ...EMPLOYEE, id: 12, full_name: 'Other Owner', is_superuser: true }];
    const user = userEvent.setup();
    wrap(<EmployeesPanel onSelect={() => {}} />);
    expect(screen.queryByTestId('people-view-as-12')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('people-view-as-11'));
    expect(state.startViewAs).toHaveBeenCalledWith(11);
  });

  it('shows no View as to anyone but the owner', () => {
    wrap(<EmployeesPanel onSelect={() => {}} />);
    expect(screen.queryByTestId('people-view-as-11')).not.toBeInTheDocument();
  });

  it('shows the red over-hours chip on the row and saves the level on the row', async () => {
    state.users = [{
      ...EMPLOYEE,
      hours_flag: {
        hours: '43.2', limit: '40', link: '/admin/time-payroll?employee=11',
        text: 'Over their hours: 43.2 of 40. Forgot to clock out? Fix the time entry.',
      },
    }];
    const user = userEvent.setup();
    wrap(<MemoryRouter><EmployeesPanel onSelect={() => {}} /></MemoryRouter>);
    expect(screen.getByTestId('over-hours-chip')).toHaveTextContent('Over hours 43.2/40');
    const level = await screen.findByLabelText('Level for Ana Reyes');
    await user.selectOptions(level, 'senior');
    expect(state.saveProfile).toHaveBeenCalledWith({ userId: 11, data: { level: 'senior' } });
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
