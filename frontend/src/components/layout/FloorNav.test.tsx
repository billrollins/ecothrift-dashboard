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

describe('FloorNav (Store | Today)', () => {
  beforeEach(() => {
    authState.role = 'Employee';
    localStorage.clear();
  });

  it('renders Store then Today, and no Settings tab for anyone', () => {
    renderNav();
    expect(screen.getAllByRole('tab').map((node) => node.getAttribute('aria-label'))).toEqual(['Store', 'Today']);
    authState.role = 'Manager';
    renderNav();
    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('marks Store as selected on ?tab=store', () => {
    renderNav('/dashboard?tab=store');
    expect(screen.getByRole('tab', { name: 'Store' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'false');
  });

  it('defaults to Today for an Employee and Store for a Manager when nothing is remembered', () => {
    renderNav('/dashboard');
    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
  });

  it('defaults to Store for a Manager', () => {
    authState.role = 'Manager';
    renderNav('/dashboard');
    expect(screen.getByRole('tab', { name: 'Store' })).toHaveAttribute('aria-selected', 'true');
  });

  it('prefers the remembered tab over the role default', () => {
    authState.role = 'Manager';
    localStorage.setItem('ecothrift.dashboard.tab.v1.1', 'myday');
    renderNav('/dashboard');
    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
  });

  it('treats a routine or the hours panel in the URL as Today', () => {
    authState.role = 'Manager';
    renderNav('/dashboard?run=12');
    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the due-today count on Today', () => {
    renderNav();
    expect(screen.getByLabelText('2 waiting')).toBeInTheDocument();
  });

  it('opens the other tab and remembers it for this user', async () => {
    const user = userEvent.setup();
    renderNav('/dashboard?tab=store');
    await user.click(screen.getByRole('tab', { name: 'Today' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/dashboard?tab=myday');
    expect(localStorage.getItem('ecothrift.dashboard.tab.v1.1')).toBe('myday');
  });

  it('does not navigate when the active tab is clicked', async () => {
    const user = userEvent.setup();
    renderNav('/dashboard?tab=store');
    await user.click(screen.getByRole('tab', { name: 'Store' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/dashboard?tab=store');
  });
});
