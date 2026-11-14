import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FloorNav } from './FloorNav';

const authState = vi.hoisted(() => ({
  role: 'Employee' as 'Employee' | 'Manager' | 'Admin',
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      role: authState.role,
      is_superuser: authState.role === 'Admin',
      language: 'en',
    },
  }),
}));

vi.mock('../../hooks/useNavBadgeCounts', () => ({
  useNavBadgeCounts: () => ({ today: 2 }),
  useNavBadgeTones: () => ({ today: 'grey' }),
}));

const theme = createTheme();

function PathProbe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}{location.search}</div>;
}

function renderNav(path = '/dashboard?tab=store') {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <FloorNav />
        <PathProbe />
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

const TABS = ['Store', 'Time clock', 'HR', 'Routines', 'Calendar', 'Messages', 'Profile'];

describe('FloorNav (Dash Home tabs, 2026-11-13)', () => {
  beforeEach(() => {
    authState.role = 'Employee';
    localStorage.clear();
  });

  it('renders the seven Home tabs in order, and no Settings tab for anyone', () => {
    renderNav();
    expect(screen.getAllByRole('tab').map((node) => node.getAttribute('aria-label'))).toEqual(TABS);
    authState.role = 'Manager';
    renderNav();
    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('marks Store as selected on ?tab=store', () => {
    renderNav('/dashboard?tab=store');
    expect(screen.getByRole('tab', { name: 'Store' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Time clock' })).toHaveAttribute('aria-selected', 'false');
  });

  it('lands everyone on Store when nothing is remembered', () => {
    renderNav('/dashboard');
    expect(screen.getByRole('tab', { name: 'Store' })).toHaveAttribute('aria-selected', 'true');
    authState.role = 'Manager';
    renderNav('/dashboard');
    expect(screen.getAllByRole('tab', { name: 'Store' })[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('prefers the remembered tab', () => {
    localStorage.setItem('ecothrift.dashboard.tab.v1.1', 'hr');
    renderNav('/dashboard');
    expect(screen.getByRole('tab', { name: 'HR' })).toHaveAttribute('aria-selected', 'true');
  });

  it('treats a routine in the URL as Routines (it runs there since #137), the hours panel as Time clock', () => {
    const first = renderNav('/dashboard?run=12');
    expect(screen.getByRole('tab', { name: 'Routines' })).toHaveAttribute('aria-selected', 'true');
    first.unmount();
    renderNav('/dashboard?hours=1');
    expect(screen.getByRole('tab', { name: 'Time clock' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the routines-waiting count on Routines, not on Time clock', () => {
    renderNav();
    const routines = screen.getByRole('tab', { name: 'Routines' });
    expect(routines).toContainElement(screen.getByLabelText('2 waiting'));
  });

  it('opens another tab and remembers it for this user', async () => {
    const user = userEvent.setup();
    renderNav('/dashboard?tab=store');
    await user.click(screen.getByRole('tab', { name: 'HR' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/dashboard?tab=hr');
    expect(localStorage.getItem('ecothrift.dashboard.tab.v1.1')).toBe('hr');
  });

  it('does not navigate when the active tab is clicked', async () => {
    const user = userEvent.setup();
    renderNav('/dashboard?tab=store');
    await user.click(screen.getByRole('tab', { name: 'Store' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/dashboard?tab=store');
  });
});
