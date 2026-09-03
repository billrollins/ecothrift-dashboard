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
  useNavBadgeCounts: () => ({ routines: 2 }),
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

  it('renders Home, Today, Pay, and Routines', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^pay$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /routines/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument();
  });

  it('marks the active tab from the path', () => {
    renderBar('/pay');
    expect(screen.getByRole('button', { name: /^pay$/i })).toHaveClass('Mui-selected');
    expect(screen.getByRole('button', { name: /home/i })).not.toHaveClass('Mui-selected');
  });

  it('keeps Routines selected on the routines list', () => {
    renderBar('/routines');
    expect(screen.getByRole('button', { name: /routines/i })).toHaveClass('Mui-selected');
  });

  it('shows the routines waiting badge in a reserved slot', () => {
    renderBar();
    expect(screen.getByLabelText('2 waiting')).toBeInTheDocument();
  });

  it('labels the tabs in Spanish when the user language is es', () => {
    authState.language = 'es';
    renderBar();
    expect(screen.getByRole('button', { name: /inicio/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hoy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pago/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rutinas/i })).toBeInTheDocument();
  });
});
