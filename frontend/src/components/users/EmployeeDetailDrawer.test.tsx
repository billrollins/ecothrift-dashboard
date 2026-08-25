import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import EmployeeDetailDrawer from './EmployeeDetailDrawer';

const state = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
}));

vi.mock('../../api/hr.api', () => ({ getDepartments: vi.fn(async () => ({ data: [] })) }));
vi.mock('../../api/core.api', () => ({
  getLocations: vi.fn(async () => ({ data: { results: [] } })),
}));

vi.mock('../../hooks/useEmployees', () => ({
  useUser: () => ({ data: state.user, isLoading: false }),
  useUpdateUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEmployeeProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendEmployeePasswordReset: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const BARE_USER = {
  id: 7,
  email: 'newhire@example.com',
  first_name: 'New',
  last_name: 'Hire',
  full_name: 'New Hire',
  phone: '',
  role: 'Employee',
  is_active: true,
  has_password: false,
  last_login: null,
  date_joined: '2026-08-01T12:00:00Z',
  employee: null,
};

const FULL_USER = {
  ...BARE_USER,
  has_password: true,
  last_login: '2026-08-20T12:00:00Z',
  employee: {
    id: 3,
    employee_number: 'EMP-003',
    department: null,
    department_name: 'Retail',
    position: 'Sales associate',
    employment_type: 'full_time',
    pay_rate: '16.50',
    hire_date: '2024-02-01',
    termination_date: null,
    termination_type: '',
    termination_type_display: '',
    termination_notes: '',
    work_location: null,
    work_location_name: null,
    emergency_name: 'Kin Person',
    emergency_phone: '3305550100',
    notes: 'Reliable.',
    created_at: '2024-02-01T12:00:00Z',
  },
};

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter>
          <EmployeeDetailDrawer userId={7} open onClose={() => {}} />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

function sectionTitles(): string[] {
  return Array.from(document.querySelectorAll('.MuiTypography-caption'))
    .map((el) => el.textContent || '')
    .filter((t) =>
      ['Access', 'Profile', 'Employment', 'Emergency contact', 'Departure', 'Notes'].includes(t),
    );
}

describe('EmployeeDetailDrawer', () => {
  beforeEach(() => {
    state.user = FULL_USER;
  });

  it('shows every section for a full record', () => {
    wrap();
    expect(sectionTitles()).toEqual([
      'Access',
      'Profile',
      'Employment',
      'Emergency contact',
      'Departure',
      'Notes',
    ]);
  });

  it('keeps the same sections for a record with nothing filled in', () => {
    state.user = BARE_USER;
    wrap();
    expect(sectionTitles()).toEqual([
      'Access',
      'Profile',
      'Employment',
      'Emergency contact',
      'Departure',
      'Notes',
    ]);
  });

  it('says so plainly when the account cannot sign in', () => {
    state.user = BARE_USER;
    wrap();
    expect(screen.getByText('No password set')).toBeInTheDocument();
    // A blank last_login means no record, not a claim that they never signed in.
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send reset link/ })).toBeEnabled();
  });

  it('offers Reactivate instead of Deactivate once someone is off', () => {
    state.user = { ...FULL_USER, is_active: false };
    wrap();
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
  });
});
