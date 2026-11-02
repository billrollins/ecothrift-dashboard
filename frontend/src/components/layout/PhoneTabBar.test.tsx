import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhoneTabBar } from './PhoneTabBar';

const authState = vi.hoisted(() => ({
  role: 'Employee' as 'Employee' | 'Admin',
  language: 'en' as 'en' | 'es',
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      role: authState.role,
      is_superuser: authState.role === 'Admin',
      language: authState.language,
    },
  }),
}));

vi.mock('../../hooks/useNavBadgeCounts', () => ({
  useNavBadgeCounts: () => ({ today: 2 }),
  useNavBadgeTones: () => ({ today: 'grey' }),
}));

const theme = createTheme();

function Probe() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}{location.search}</div>;
}

function renderBar(path = '/dashboard?tab=store') {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <PhoneTabBar />
        <Probe />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('PhoneTabBar', () => {
  beforeEach(() => {
    authState.role = 'Employee';
    authState.language = 'en';
    localStorage.clear();
  });

  it('renders Store and My day, nothing else', () => {
    renderBar();
    const labels = screen.getAllByRole('button').map((node) => node.textContent?.replace(/^\d+/, '').trim());
    expect(labels).toEqual(['Store', 'My day']);
    expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /routines/i })).not.toBeInTheDocument();
  });

  it('marks the tab from the URL', () => {
    renderBar('/dashboard?tab=myday');
    expect(screen.getByRole('button', { name: /my day/i })).toHaveClass('Mui-selected');
    expect(screen.getByRole('button', { name: /store/i })).not.toHaveClass('Mui-selected');
  });

  it('keeps My day selected for old Today and routine links', () => {
    renderBar('/today?hours=1');
    expect(screen.getByRole('button', { name: /my day/i })).toHaveClass('Mui-selected');
  });

  it('uses the role default with nothing remembered: My day for an Employee, Store for an Admin', () => {
    renderBar('/dashboard');
    expect(screen.getByRole('button', { name: /my day/i })).toHaveClass('Mui-selected');
  });

  it('opens the other tab and remembers the choice per user', async () => {
    const user = userEvent.setup();
    renderBar('/dashboard?tab=store');
    await user.click(screen.getByRole('button', { name: /my day/i }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard?tab=myday');
    expect(localStorage.getItem('ecothrift.dashboard.tab.v1.1')).toBe('myday');
  });

  it('shows the due-today count on My day', () => {
    renderBar();
    expect(screen.getByLabelText('2 waiting')).toBeInTheDocument();
  });

  it('labels the tabs in Spanish when the user language is es', () => {
    authState.language = 'es';
    renderBar();
    expect(screen.getByRole('button', { name: /tienda/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mi dia/i })).toBeInTheDocument();
  });
});
