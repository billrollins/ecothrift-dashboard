import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MePage } from '../../api/accounts.api';
import { ProfileTab } from './ProfileTab';

const state = vi.hoisted(() => ({ page: null as unknown, setMyPhoto: vi.fn(), logout: vi.fn() }));

const api = vi.hoisted(() => ({
  getMePage: vi.fn(async () => ({ data: state.page })),
  uploadMyPhoto: vi.fn(async () => ({
    data: { ...(state.page as MePage), details: { ...(state.page as MePage).details, photo_url: 'https://files.example/me.jpg' } },
  })),
  removeMyPhoto: vi.fn(),
  patchMeDetails: vi.fn(),
  setMyRegisterPin: vi.fn(),
  signOutEverywhere: vi.fn(),
}));
vi.mock('../../api/accounts.api', () => api);
vi.mock('../../components/users/ChangePasswordDialog', () => ({ default: () => null }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ logout: state.logout, setMyPhoto: state.setMyPhoto }) }));

const PAGE: MePage = {
  details: {
    first_name: 'Rosa', last_name: 'Jimenez', email: 'rosa@example.com', username: 'rosa', phone: '4025550101',
    role: 'Employee', photo_url: null,
  },
  employee: {
    employee_number: 'EMP-014', position: 'Processor', department: 'Processing', hire_date: '2025-03-03',
    emergency_name: '', emergency_phone: '', employment_type: 'part_time', level: 'senior', pay_rate: '15.50',
    on_payroll: true, overtime_allowance_hours: '5.00',
  },
  next_review: { kind: 'checkin', date: '2026-11-22', label: '60-day check-in', with: 'Bill Rollins', days: 9 },
  pin: { set: false, set_at: null, can_set: true },
  schedule: [],
  drawers: null,
};

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter>
          <ProfileTab />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('Home > Profile', () => {
  beforeEach(() => {
    state.page = PAGE;
    vi.clearAllMocks();
  });

  it('opens with who I am: name, job, EMP number, role, time here, and no page title', async () => {
    wrap();
    expect(await screen.findByRole('heading', { name: 'Rosa Jimenez' })).toBeInTheDocument();
    const identity = screen.getByTestId('profile-identity');
    expect(within(identity).getByText('Processor · Processing')).toBeInTheDocument();
    expect(within(identity).getByText('EMP-014')).toBeInTheDocument();
    expect(within(identity).getByText('Employee')).toBeInTheDocument();
    expect(within(identity).getByText(/here$/)).toBeInTheDocument();
    // The Home band names the tab; the body never repeats it.
    expect(screen.queryByRole('heading', { name: 'Profile' })).not.toBeInTheDocument();
  });

  it('shows my contact details and asks for an emergency contact when there is none', async () => {
    wrap();
    const contact = await screen.findByTestId('profile-contact');
    expect(within(contact).getByText('(402) 555-0101')).toBeInTheDocument();
    expect(within(contact).getByText('rosa@example.com')).toBeInTheDocument();
    expect(within(contact).getByText('Add someone to call')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('profile-edit-contact'));
    expect(await screen.findByText('My phone and emergency contact')).toBeInTheDocument();
  });

  it('shows my work details read only: department, job, level, employment, pay rate, overtime', async () => {
    wrap();
    const work = await screen.findByTestId('profile-work');
    for (const text of ['Processing', 'Processor', 'Senior', 'Part time', '$15.50 an hour', 'Up to 5 h past 40 a week', 'Mar 3, 2025']) {
      expect(within(work).getByText(text)).toBeInTheDocument();
    }
    expect(within(work).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(work).queryByRole('button')).not.toBeInTheDocument();
  });

  it('says Not on payroll instead of a rate, and No overtime at 0', async () => {
    state.page = { ...PAGE, employee: { ...PAGE.employee!, on_payroll: false, pay_rate: '0.00', overtime_allowance_hours: '0.00' } };
    wrap();
    const work = await screen.findByTestId('profile-work');
    expect(within(work).getByText('Not on payroll')).toBeInTheDocument();
    expect(within(work).getByText('No overtime')).toBeInTheDocument();
  });

  it('shows my next review: a check-in with who holds it, and a link to my check-ins', async () => {
    wrap();
    const review = await screen.findByTestId('profile-review');
    expect(within(review).getByText('60-day check-in with Bill Rollins')).toBeInTheDocument();
    expect(within(review).getByText('In 9 days')).toBeInTheDocument();
    expect(within(review).getByRole('link', { name: 'My check-ins' })).toHaveAttribute('href', '/check-ins');
  });

  it('says plainly when no review is set, and when one is past its date', async () => {
    state.page = { ...PAGE, next_review: null };
    const first = wrap();
    expect(await screen.findByText('Not set yet')).toBeInTheDocument();
    first.unmount();
    state.page = { ...PAGE, next_review: { kind: 'review', date: '2026-11-10', label: 'Performance review', with: '', days: -3 } };
    wrap();
    const review = await screen.findByTestId('profile-review');
    expect(within(review).getByText('Was due 3 days ago')).toBeInTheDocument();
    expect(within(review).queryByRole('link')).not.toBeInTheDocument();
  });

  it('saves a new photo and the top-bar avatar follows', async () => {
    wrap();
    fireEvent.click(await screen.findByTestId('profile-photo'));
    // No photo yet: nothing to remove.
    expect(screen.getByRole('menuitem', { name: /Remove photo/ })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: /New photo/ }));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('profile-photo-input'), { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyPhoto).toHaveBeenCalledWith(file));
    await waitFor(() => expect(state.setMyPhoto).toHaveBeenCalledWith('https://files.example/me.jpg'));
    expect(await screen.findByRole('img', { name: 'Rosa Jimenez' })).toHaveAttribute('src', 'https://files.example/me.jpg');
  });

  it('keeps sign-in here (password, register PIN, sign out everywhere) and leaves the clock and pay totals out', async () => {
    wrap();
    expect(await screen.findByTestId('profile-pin')).toHaveTextContent('Set PIN');
    expect(screen.getByText('Dash password')).toBeInTheDocument();
    expect(screen.getByTestId('me-sign-out-everywhere')).toBeInTheDocument();
    expect(screen.queryByText(/Hours & pay|My week|My usual shifts/)).not.toBeInTheDocument();
  });
});
