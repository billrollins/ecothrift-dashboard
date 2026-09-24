import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

function renderBar(path = '/dashboard') {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <PhoneTabBar />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('PhoneTabBar', () => {
  beforeEach(() => {
    authState.role = 'Employee';
    authState.language = 'en';
  });

  it('renders Dashboard and Today (routines, hours and pay live in Today)', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /today/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^pay$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /routines/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument();
  });

  it('marks the active tab from the path', () => {
    renderBar('/today?hours=1');
    expect(screen.getByRole('button', { name: /today/i })).toHaveClass('Mui-selected');
    expect(screen.getByRole('button', { name: /dashboard/i })).not.toHaveClass('Mui-selected');
  });

  it('keeps Today selected for an old routine link', () => {
    renderBar('/routines/run/5');
    expect(screen.getByRole('button', { name: /today/i })).toHaveClass('Mui-selected');
  });

  it('shows the due-today count on Today', () => {
    renderBar();
    expect(screen.getByLabelText('2 waiting')).toBeInTheDocument();
  });

  it('labels the tabs in Spanish when the user language is es', () => {
    authState.language = 'es';
    renderBar();
    expect(screen.getByRole('button', { name: /tablero/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hoy/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pago/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rutinas/i })).not.toBeInTheDocument();
  });
});
