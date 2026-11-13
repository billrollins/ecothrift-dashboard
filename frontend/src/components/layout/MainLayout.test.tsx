import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { PageShell } from '../page/PageKit';
import MainLayout from './MainLayout';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'Admin', is_superuser: true, language: 'en', full_name: 'Bill R' } }),
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, role: 'Admin', is_superuser: true, language: 'en', full_name: 'Bill R' } }),
}));
vi.mock('../../api/core.api', () => ({
  getAppVersion: async () => ({ data: { version: '9.9.9' } }),
}));
vi.mock('./Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" />, SIDEBAR_WIDTH: 252 }));
vi.mock('./PhoneTabBar', () => ({ PhoneTabBar: () => null }));
vi.mock('./ClockPill', () => ({ ClockPill: () => <div data-testid="clock-pill-slot" /> }));
vi.mock('./NotificationBell', () => ({ NotificationBell: () => <div data-testid="bell-slot" /> }));
vi.mock('./AccountMenu', () => ({ AccountMenu: () => <div data-testid="avatar-slot" /> }));
vi.mock('../messages/MessagesEnvelope', () => ({ MessagesEnvelope: () => <div data-testid="old-envelope" /> }));

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}</div>;
}

function renderLayout(path = '/inventory/search', page: ReactNode = <Where />) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="*" element={page} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('MainLayout shell (staff navigation phase 1)', () => {
  it('top bar is right now: clock pill, one bell, avatar, in that order', () => {
    renderLayout();
    const ids = ['clock-pill-slot', 'bell-slot', 'avatar-slot'].map((id) => screen.getByTestId(id));
    expect(ids[0].compareDocumentPosition(ids[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ids[1].compareDocumentPosition(ids[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('no longer draws the old routines nag or messages envelope', () => {
    renderLayout();
    expect(screen.queryByTestId('old-nag')).not.toBeInTheDocument();
    expect(screen.queryByTestId('old-envelope')).not.toBeInTheDocument();
  });

  it('the logo opens the Dashboard', async () => {
    const user = userEvent.setup();
    renderLayout('/inventory/search');
    await user.click(screen.getByTestId('sidebar-logo'));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard');
  });

  it('names a kit page in the top bar (the page body never repeats it), and leaves older pages as they are', () => {
    const { unmount } = renderLayout('/inventory/vendors', <PageShell><div>vendor list</div></PageShell>);
    expect(screen.getByRole('heading', { level: 1, name: 'Vendors' })).toBeInTheDocument();
    unmount();
    renderLayout('/inventory/vendors');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});
