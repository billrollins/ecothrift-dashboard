import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MePage as MePageData } from '../../api/accounts.api';
import MePage from './MePage';

const api = vi.hoisted(() => ({
  getMePage: vi.fn(),
  patchMeDetails: vi.fn(),
  setMyRegisterPin: vi.fn(),
  signOutEverywhere: vi.fn(),
}));
vi.mock('../../api/accounts.api', () => api);
vi.mock('../../api/hiring.api', () => ({
  getMyOnboarding: vi.fn().mockResolvedValue({ data: { onboarding: null } }),
  getMyCheckins: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock('../../api/messages.api', () => ({
  getThreads: vi.fn().mockResolvedValue({ data: [{ id: 7, subject: 'Your register PIN', unread: 1, preview_from: 'Bill R' }] }),
}));
vi.mock('../../api/supplies.api', () => ({
  getSupplyLists: vi.fn().mockResolvedValue({
    cycle: { week_start: '2026-11-02', deadline: '2026-11-02T21:00:00Z' }, can_edit: false, is_owner: false,
    lists: [{ id: 3, name: 'Processing', item_count: 4, count: null }, { id: 4, name: 'Front', item_count: 2, count: { id: 1 } }],
  }),
}));
vi.mock('../../components/hr/HoursPayPanel', () => ({ HoursPayPanel: () => <div data-testid="hours-pay" /> }));
vi.mock('../../components/hr/MyWeek', () => ({ MyWeek: () => <div data-testid="my-week" /> }));
vi.mock('../../components/users/ChangePasswordDialog', () => ({ default: () => null }));
const logout = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ logout }) }));

const PAGE: MePageData = {
  details: { first_name: 'Carrie', last_name: 'T', email: 'carrie@x.com', username: 'carrie', phone: '', role: 'Employee' },
  employee: {
    employee_number: 'EMP-004', position: 'Cashier', department: 'Retail', hire_date: '2026-09-01',
    emergency_name: '', emergency_phone: '',
  },
  pin: { set: false, set_at: null, can_set: true },
  schedule: [{ shift: 'Retail Open', department: 'Retail', time_in: '08:30', time_out: '14:30', days: [1, 3], day_names: ['Tue', 'Thu'] }],
  drawers: null,
};

/** MUI useMediaQuery reads matchMedia: true makes every min-width query match (a 1440 px desk), false a phone. */
function setWide(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide && query.includes('min-width'), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/me']}>
          <Routes>
            <Route path="/me" element={<MePage />} />
            <Route path="/login" element={<div data-testid="login" />} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('MePage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getMePage.mockResolvedValue({ data: PAGE });
    setWide(false);
  });

  it('shows my details, a nudge for the emergency contact, my week, my usual shifts and Hours & pay', async () => {
    renderPage();
    const details = await screen.findByTestId('me-details');
    expect(details).toHaveTextContent('Carrie T');
    expect(details).toHaveTextContent('Employee · Cashier · Retail');
    expect(details).toHaveTextContent('Add someone to call in an emergency.');
    expect(screen.getByTestId('me-schedule')).toHaveTextContent('Tue, Thu · 8:30am to 2:30pm');
    expect(screen.getByTestId('hours-pay')).toBeInTheDocument();
    expect(await screen.findByText('Messages (1 unread)')).toBeInTheDocument();
    expect(screen.getByTestId('my-week')).toBeInTheDocument();
    expect(screen.getByTestId('me-pin-status')).toHaveTextContent('Register PIN: not set yet');
  });

  it('lists the supply lists that still need the count this week', async () => {
    renderPage();
    const block = await screen.findByTestId('me-supplies');
    expect(block).toHaveTextContent('Processing');
    expect(block).not.toHaveTextContent('Front');
    expect(within(block).getByRole('link', { name: 'Count' })).toHaveAttribute('href', '/supplies/count/3');
  });

  it('uses two columns on a desk and one on a phone', async () => {
    setWide(true);
    const { unmount } = renderPage();
    const columns = await screen.findByTestId('me-columns');
    const [left, right] = Array.from(columns.children);
    expect(within(left as HTMLElement).getByTestId('me-details')).toBeInTheDocument();
    expect(within(right as HTMLElement).getByTestId('hours-pay')).toBeInTheDocument();
    unmount();
    setWide(false);
    renderPage();
    await screen.findByTestId('me-details');
    expect(screen.queryByTestId('me-columns')).toBeNull();
  });

  it('sets my register PIN with my password', async () => {
    const user = userEvent.setup();
    api.setMyRegisterPin.mockResolvedValue({ data: { ...PAGE, pin: { set: true, set_at: '2026-10-21T12:00:00Z', can_set: true } } });
    renderPage();
    await user.click(within(await screen.findByTestId('me-security')).getByRole('button', { name: 'Set PIN' }));
    await user.type(screen.getByLabelText(/^New PIN/), '40a71');
    await user.type(screen.getByLabelText(/^Same PIN again/), '4071');
    await user.type(screen.getByLabelText(/^My Dash password/), 'secret-pw');
    await user.click(screen.getByRole('button', { name: 'Save PIN' }));
    expect(api.setMyRegisterPin).toHaveBeenCalledWith('4071', 'secret-pw');
    await waitFor(() => expect(screen.getByTestId('me-pin-status')).toHaveTextContent('Register PIN: set'));
  });

  it('shows why a PIN was refused', async () => {
    const user = userEvent.setup();
    api.setMyRegisterPin.mockRejectedValue({ response: { data: { detail: 'Pick a different PIN.', code: 'PIN_TAKEN' } } });
    renderPage();
    await user.click(within(await screen.findByTestId('me-security')).getByRole('button', { name: 'Set PIN' }));
    await user.type(screen.getByLabelText(/^New PIN/), '4071');
    await user.type(screen.getByLabelText(/^Same PIN again/), '4071');
    await user.type(screen.getByLabelText(/^My Dash password/), 'secret-pw');
    await user.click(screen.getByRole('button', { name: 'Save PIN' }));
    expect(await screen.findByText('Pick a different PIN.')).toBeInTheDocument();
  });

  it('signs out on all devices after asking', async () => {
    const user = userEvent.setup();
    api.signOutEverywhere.mockResolvedValue({ data: { detail: 'ok', ended: 2 } });
    renderPage();
    await user.click(await screen.findByTestId('me-sign-out-everywhere'));
    await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(screen.getByTestId('login')).toBeInTheDocument());
    expect(api.signOutEverywhere).toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
  });
});
