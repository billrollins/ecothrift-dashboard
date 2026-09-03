import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoutinesPage from './RoutinesPage';

function setDesk(desk: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desk ? query.includes('min-width') : query.includes('max-width'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

const authState = vi.hoisted(() => ({ language: 'en' as 'en' | 'es' }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      role: 'Employee',
      is_superuser: false,
      full_name: 'Pat',
      language: authState.language,
    },
  }),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      role: 'Employee',
      is_superuser: false,
      full_name: 'Pat',
      language: authState.language,
    },
  }),
}));

vi.mock('../../hooks/useNavBadgeCounts', () => ({
  useNavBadgeCounts: () => ({ routines: 0 }),
}));

vi.mock('../../hooks/useRoutines', () => ({
  useMyRoutineRuns: () => ({
    data: { open: [], done: [], on_demand: [], drafts: [] },
    isLoading: false,
    isError: false,
  }),
  useRoutines: () => ({ data: [], isLoading: false, isError: false }),
  useRoutineRun: () => ({ data: null, isLoading: false, isError: false }),
  useRoutine: () => ({ data: null, isLoading: false, isError: false }),
}));

const theme = createTheme();

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <RoutinesPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('RoutinesPage', () => {
  beforeEach(() => {
    authState.language = 'en';
    setDesk(true);
  });

  it('always renders the remaining groups so the list cannot jump', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Routines' })).toBeInTheDocument();
    expect(screen.getByText('My Routines')).toBeInTheDocument();
    expect(screen.getByText('Catalog')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Due today')).toBeInTheDocument();
    expect(screen.getByText('On demand')).toBeInTheDocument();
    expect(screen.queryByText('This week')).not.toBeInTheDocument();
    expect(screen.queryByText('Done this week')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing blocking the floor')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filter routines')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New routine')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Edit routine')).not.toBeInTheDocument();
  });

  it('renders the list in Spanish when the user language is es', () => {
    authState.language = 'es';
    renderPage();
    expect(screen.getByText('Mis rutinas')).toBeInTheDocument();
    expect(screen.getByText('Catalogo')).toBeInTheDocument();
    expect(screen.getByText('Para hoy')).toBeInTheDocument();
    expect(screen.getByText('En curso')).toBeInTheDocument();
  });
});
