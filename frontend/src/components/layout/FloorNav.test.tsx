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
  useNavBadgeCounts: () => ({ routines: 2 }),
}));

const theme = createTheme();

function PathProbe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

function renderNav(path = '/dashboard') {
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

describe('FloorNav', () => {
  beforeEach(() => {
    authState.role = 'Employee';
  });

  it('renders Home, Today, Pay, and Routines in that order', () => {
    renderNav();
    const labels = screen.getAllByRole('button').map((node) => node.getAttribute('aria-label'));
    expect(labels).toEqual(['Home', 'Today', 'Pay', 'Routines']);
  });

  it('marks Home as the current page on /dashboard', () => {
    renderNav('/dashboard');
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Today' })).not.toHaveAttribute('aria-current');
  });

  it('shows the routines waiting badge in a reserved slot', () => {
    renderNav();
    expect(screen.getByLabelText('2 waiting')).toBeInTheDocument();
  });

  it('hides Settings for an employee', () => {
    renderNav();
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('shows Settings after a divider for a Manager', () => {
    authState.role = 'Manager';
    renderNav();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('navigates when a different item is clicked', async () => {
    const user = userEvent.setup();
    renderNav('/dashboard');
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
  });

  it('does nothing when the active item is clicked', async () => {
    const user = userEvent.setup();
    renderNav('/dashboard');
    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/dashboard');
  });
});
