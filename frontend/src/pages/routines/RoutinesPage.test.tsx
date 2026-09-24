import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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
  useNavBadgeCounts: () => ({}),
  useNavBadgeTones: () => ({}),
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

function PathProbe() {
  const location = useLocation();
  return <div data-testid="path">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(path = '/routines') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/routines" element={<RoutinesPage />} />
            <Route path="/routines/catalog" element={<RoutinesPage />} />
            <Route path="/routines/run/:id" element={<RoutinesPage />} />
            <Route path="/today" element={<div>Today page</div>} />
          </Routes>
          <PathProbe />
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

  it('sends staff from the bare routines list to Today (one place)', () => {
    renderPage('/routines');
    expect(screen.getByText('Today page')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
  });

  it('keeps the catalog for superusers only', () => {
    renderPage('/routines/catalog');
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
  });

  it('opens an old run link on Today, beside the list', () => {
    renderPage('/routines?run=5');
    expect(screen.getByText('Today page')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/today?run=5');
  });

  it('carries a new-run link (routine, draft, return) to Today', () => {
    renderPage('/routines/run/new?routine=3&draft=9&return=%2Fadmin%2Fretail-qa');
    expect(screen.getByTestId('path')).toHaveTextContent('/today?routine=3&draft=9&return=%2Fadmin%2Fretail-qa');
  });

  it('opens a numbered run link on Today', () => {
    renderPage('/routines/run/12');
    expect(screen.getByTestId('path')).toHaveTextContent('/today?run=12');
  });
});
