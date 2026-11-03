import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from './NotificationBell';

const state = vi.hoisted(() => ({
  superuser: false,
  unread: 0,
  approvals: 0,
  work: { count: 0, nagCount: 0, nagTone: 'none', owed: [], next: null } as Record<string, unknown>,
  hours: 'none' as string,
  buying: { ending: [], unrecorded: [], count: 0, tone: 'none' } as Record<string, unknown>,
  safe: false,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, first_name: 'Bill', role: 'Admin', is_superuser: state.superuser, language: 'en' },
    logout: vi.fn(),
    hasRole: () => false,
  }),
}));
vi.mock('../../hooks/useSafe', () => ({
  useSafe: () => ({ data: state.safe ? { needs_swap: true } : undefined }),
}));
vi.mock('../../api/messages.api', () => ({
  getUnread: async () => ({ data: { unread: state.unread } }),
}));
vi.mock('../../api/approvalRequests.api', () => ({
  fetchApprovalRequests: async () => Array.from({ length: state.approvals }, (_, i) => ({ id: i + 1, status: 'pending' })),
}));
vi.mock('../../hooks/useMyWork', () => ({
  useMyWork: () => ({ work: state.work, isLoading: false }),
}));
vi.mock('../../hooks/useHoursNag', () => ({
  useHoursNag: () => ({ level: state.hours, worked: 20, limit: 40, left: 20, clockOutBy: null }),
}));
vi.mock('../../hooks/useBuyingNags', () => ({
  useBuyingNags: () => state.buying,
}));
vi.mock('../routines/NagMessages', () => ({
  useNagMessages: () => ({ messages: [], busy: false, firstName: 'Bill', heard: vi.fn(), notMe: vi.fn() }),
  NagMessages: () => null,
}));

const theme = createTheme();

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}{location.search}</div>;
}

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={['/inventory/search']}>
          <NotificationBell />
          <Where />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function count(testId: string) {
  return screen.getByTestId(`${testId}-count`).textContent;
}

describe('NotificationBell', () => {
  beforeEach(() => {
    state.superuser = false;
    state.unread = 0;
    state.approvals = 0;
    state.work = { count: 0, nagCount: 0, nagTone: 'none', owed: [], next: null };
    state.hours = 'none';
    state.buying = { ending: [], unrecorded: [], count: 0, tone: 'none' };
    localStorage.clear();
  });

  it('badge is the total of messages, routines due and (owner) approvals', async () => {
    state.superuser = true;
    state.unread = 3;
    state.approvals = 2;
    state.work = { count: 4, nagCount: 5, nagTone: 'amber', owed: [], next: null };
    renderBell();
    await waitFor(() => expect(screen.getByTestId('notification-bell-badge')).toHaveTextContent('10'));
    expect(screen.getByTestId('notification-bell')).toHaveAccessibleName('Notifications: 10');
  });

  it('lists each row with its own count', async () => {
    const user = userEvent.setup();
    state.superuser = true;
    state.unread = 3;
    state.approvals = 2;
    state.work = { count: 4, nagCount: 5, nagTone: 'amber', owed: [], next: null };
    renderBell();
    await waitFor(() => expect(screen.getByTestId('notification-bell-badge')).toHaveTextContent('10'));
    await user.click(screen.getByTestId('notification-bell'));
    expect(count('bell-row-messages')).toBe('3');
    expect(count('bell-row-routines')).toBe('5');
    expect(count('bell-row-approvals')).toBe('2');
  });

  it('leaves out Approvals waiting for anyone but a superuser, and does not add them to the total', async () => {
    const user = userEvent.setup();
    state.approvals = 4;
    state.unread = 1;
    renderBell();
    await waitFor(() => expect(screen.getByTestId('notification-bell-badge')).toHaveTextContent('1'));
    await user.click(screen.getByTestId('notification-bell'));
    expect(screen.queryByTestId('bell-row-approvals')).not.toBeInTheDocument();
  });

  it('has no badge and says so when nothing is waiting', async () => {
    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByTestId('notification-bell'));
    expect(screen.getByText('Nothing new.')).toBeInTheDocument();
    expect(screen.getByTestId('notification-bell-badge').querySelector('.MuiBadge-badge')).toHaveClass('MuiBadge-invisible');
  });

  it('opens Messages, My day, and Requests from their rows', async () => {
    const user = userEvent.setup();
    state.superuser = true;
    state.unread = 1;
    renderBell();
    await user.click(screen.getByTestId('notification-bell'));
    await user.click(screen.getByTestId('bell-row-messages'));
    expect(screen.getByTestId('where')).toHaveTextContent('/messages');

    await user.click(screen.getByTestId('notification-bell'));
    await user.click(screen.getByTestId('bell-row-routines'));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard?tab=myday');
    expect(localStorage.getItem('ecothrift.dashboard.tab.v1.1')).toBe('myday');

    await user.click(screen.getByTestId('notification-bell'));
    await user.click(screen.getByTestId('bell-row-approvals'));
    expect(screen.getByTestId('where')).toHaveTextContent('/owner/approvals');
  });

  it('tells the owner and managers when the office cash needs a swap with the safe (2026-11-02)', async () => {
    state.safe = true;
    renderBell();
    await userEvent.setup().click(await screen.findByTestId('notification-bell'));
    expect(await screen.findByTestId('bell-row-safe')).toHaveTextContent('Office cash: swap with the safe');
    state.safe = false;
  });
});
