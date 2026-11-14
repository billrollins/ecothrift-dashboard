import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import { StaffWindow } from './StaffWindow';
import { uploadStaffPhoto } from '../../api/accounts.api';

const state = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
  viewer: { id: 1, is_superuser: false, view_as: null } as Record<string, unknown>,
  startViewAs: vi.fn(),
  setMyPhoto: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: state.viewer, startViewAs: state.startViewAs, setMyPhoto: state.setMyPhoto }),
}));

vi.mock('../../api/hr.api', () => ({
  getDepartments: vi.fn(async () => ({ data: [] })),
  getTimeEntries: vi.fn(async () => ({ data: { results: [], count: 0 } })),
  mergeCurrentDepartment: (list: unknown[]) => list,
  mergeCurrentDepartments: (list: unknown[]) => list,
}));
vi.mock('../../api/accounts.api', () => ({
  unlockSignIn: vi.fn(async () => ({ data: { detail: 'Unlocked', was_locked: true } })),
  sendStaffPasswordReset: vi.fn(),
  getSetPasswordLink: vi.fn(),
  clearRegisterPin: vi.fn(),
  uploadStaffPhoto: vi.fn(async () => ({ data: { photo_url: 'https://files.example/new.jpg' } })),
  removeStaffPhoto: vi.fn(async () => ({ data: { photo_url: null } })),
}));
vi.mock('../../api/texting.api', () => ({
  getTextingStatus: vi.fn(async () => ({ data: { staff_texts_live: true, waiting_on: [], unread: 0 } })),
  textSetPasswordLink: vi.fn(),
}));
vi.mock('../../api/schedule.api', () => ({
  getScheduleWeek: vi.fn(async () => ({ data: { people: [], shifts: [], call_ins: [] } })),
}));

vi.mock('../../hooks/useEmployees', () => ({
  useUser: () => ({ data: state.user, isLoading: false, isError: false }),
  useUpdateUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEmployeeProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
  phone: '5175551234',
  last_login: '2026-08-20T12:00:00Z',
  employee: {
    id: 3,
    employee_number: 'EMP-003',
    department: null,
    department_name: 'Retail',
    position: 'Sales associate',
    employment_type: 'full_time',
    pay_rate: '16.50',
    on_payroll: true,
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
          <StaffWindow userId={7} />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('StaffWindow', () => {
  beforeEach(() => {
    state.user = FULL_USER;
    state.viewer = { id: 1, is_superuser: false, view_as: null };
  });

  it('puts who they are in the header: name, EMP number, role, job', () => {
    wrap();
    expect(screen.getByRole('heading', { name: 'New Hire' })).toBeInTheDocument();
    expect(screen.getByText('EMP-003')).toBeInTheDocument();
    expect(screen.getByText('Employee')).toBeInTheDocument();
    expect(screen.getByText(/Sales associate · Retail/)).toBeInTheDocument();
    expect(screen.queryByText('Not on payroll')).not.toBeInTheDocument();
    expect(screen.queryByText('Locked out')).not.toBeInTheDocument();
  });

  it('shows the state chips: not on payroll, locked out, no password, inactive', () => {
    state.user = {
      ...FULL_USER, has_password: false, locked_out: true, is_active: false,
      employee: { ...FULL_USER.employee, on_payroll: false },
    };
    wrap();
    for (const chip of ['Not on payroll', 'Locked out', 'No password', 'Inactive']) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }
  });

  it('has the four tabs and opens on Access', () => {
    wrap();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Access', 'Profile', 'Employment', 'Schedule and time']);
    expect(screen.getByText('Sign-in')).toBeInTheDocument();
  });

  it('says so plainly when the account cannot sign in', () => {
    state.user = BARE_USER;
    wrap();
    expect(screen.getByText('No password set')).toBeInTheDocument();
    // A blank last_login means no record, not a claim that they never signed in.
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByText('No employee record')).toBeInTheDocument();
  });

  it('has one Password reset that offers email and text', async () => {
    wrap();
    fireEvent.click(screen.getByTestId('staff-password-reset'));
    expect(await screen.findByText('Password reset: New Hire')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeChecked();
    expect(await screen.findByText(/from \(888\) 812-7905/)).toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toBeChecked();
    expect(screen.queryByRole('button', { name: /Send reset link/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Set password$/ })).not.toBeInTheDocument();
  });

  it('cannot text a reset to someone with no phone', async () => {
    state.user = { ...FULL_USER, phone: '' };
    wrap();
    fireEvent.click(screen.getByTestId('staff-password-reset'));
    expect(await screen.findByText(/No mobile number on file/)).toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toBeDisabled();
  });

  it('shows the level and the overtime allowance on Employment', () => {
    state.user = { ...FULL_USER, employee: { ...FULL_USER.employee, level: 'senior', overtime_allowance_hours: '5.00' } };
    wrap();
    fireEvent.click(screen.getByRole('tab', { name: 'Employment' }));
    expect(screen.getByTestId('pay-level-field')).toBeInTheDocument();
    expect(screen.getByLabelText('Overtime allowed')).toHaveValue(5);
    expect(screen.getByText(/outside the Senior range/)).toBeInTheDocument();
  });

  it('shows their photo and lets the owner set a new one (the same circle as their Profile)', async () => {
    state.user = { ...FULL_USER, photo_url: 'https://files.example/dana.jpg' };
    wrap();
    expect(screen.getByRole('img', { name: 'New Hire' })).toHaveAttribute('src', 'https://files.example/dana.jpg');
    fireEvent.click(screen.getByTestId('staff-photo'));
    expect(screen.getByRole('menuitem', { name: /Remove photo/ })).not.toHaveAttribute('aria-disabled');
    const file = new File(['x'], 'new.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('staff-photo-input'), { target: { files: [file] } });
    await waitFor(() => expect(uploadStaffPhoto).toHaveBeenCalledWith(7, file));
    // Someone else's photo: the owner's own top-bar avatar stays as it is.
    expect(state.setMyPhoto).not.toHaveBeenCalled();
  });

  it('sets the next review on Employment', () => {
    state.user = { ...FULL_USER, employee: { ...FULL_USER.employee, next_review_date: '2026-12-04' } };
    wrap();
    fireEvent.click(screen.getByRole('tab', { name: 'Employment' }));
    expect(screen.getByLabelText('Next review')).toHaveValue('2026-12-04');
    expect(screen.getByText(/Shows on their Profile/)).toBeInTheDocument();
  });

  it('puts the red over-hours flag at the top when the week is past their hours', () => {
    state.user = {
      ...FULL_USER,
      hours_flag: {
        hours: '43.2',
        limit: '40',
        text: 'Over their hours: 43.2 of 40. Forgot to clock out? Fix the time entry.',
        link: '/admin/time-payroll?employee=7',
      },
    };
    wrap();
    expect(screen.getByTestId('over-hours-flag')).toHaveTextContent('Over their hours: 43.2 of 40.');
  });

  it('offers the owner a small View as by the name, and nobody else', () => {
    state.user = { ...FULL_USER, is_staff: true };
    const first = wrap();
    expect(screen.queryByTestId('staff-view-as')).not.toBeInTheDocument();
    first.unmount();
    state.viewer = { id: 1, is_superuser: true, view_as: null };
    wrap();
    screen.getByTestId('staff-view-as').click();
    expect(screen.getByTestId('staff-view-as')).toHaveTextContent('View as');
    expect(state.startViewAs).toHaveBeenCalledWith(7);
  });

  it('keeps Deactivate in the actions menu, and Reactivate once someone is off', () => {
    const first = wrap();
    fireEvent.click(screen.getByTestId('staff-actions'));
    expect(screen.getByTestId('staff-deactivate')).toHaveTextContent('Deactivate');
    first.unmount();
    state.user = { ...FULL_USER, is_active: false };
    wrap();
    fireEvent.click(screen.getByTestId('staff-actions'));
    expect(screen.getByRole('menuitem', { name: 'Reactivate' })).toBeInTheDocument();
    expect(screen.queryByTestId('staff-deactivate')).not.toBeInTheDocument();
  });

  it('offers Unlock only while they are locked out', () => {
    state.user = { ...FULL_USER, locked_out: true };
    wrap();
    fireEvent.click(screen.getByTestId('staff-actions'));
    expect(screen.getByRole('menuitem', { name: 'Unlock sign-in' })).toBeInTheDocument();
  });
});
