import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimeEntry, WeeklyHoursStatus } from '../../types/hr.types';
import TodayPage from './TodayPage';

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

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, first_name: 'Bill', language: 'en', role: 'Employee' } }),
}));

vi.mock('../../hooks/useNavBadgeCounts', () => ({
  useNavBadgeCounts: () => ({ routines: 0 }),
}));

vi.mock('../../hooks/useTimeClock', () => ({
  useWeeklyHoursStatus: () => ({
    data: {
      week_start: '2026-08-31',
      week_end: '2026-09-06',
      hours_worked: '22.50',
      hours_limit: '40.00',
      hours_remaining: '17.50',
      is_at_limit: false,
      is_over_limit: false,
      overtime_hours: '0.00',
    } satisfies WeeklyHoursStatus,
  }),
  useCurrentEntry: () => ({ data: null as TimeEntry | null, isLoading: false }),
  useClockIn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClockOut: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetShift: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useStartBreak: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEndBreak: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../hooks/useRoutines', () => ({
  useTodayGlance: () => ({
    isLoading: false,
    data: {
      shift: '',
      shift_label: '',
      shift_department: '',
      start_with: null,
      verify_of: null,
      open: [],
      drafts: [],
      on_demand: [],
      language: 'en',
    },
  }),
  useMyRoutineRuns: () => ({ data: { open: [] } }),
}));

const theme = createTheme();

function renderToday() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <SnackbarProvider>
          <MemoryRouter>
            <TodayPage />
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('TodayPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the desk punch column and the pick-your-shift line', () => {
    setDesk(true);
    renderToday();
    expect(screen.getByText(/Good (morning|afternoon|evening), Bill/)).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(7);
    expect(screen.getByText('Pick your shift to see your day.')).toBeInTheDocument();
    expect(screen.getByText('/ 40.00 h')).toBeInTheDocument();
    expect(screen.queryByText('Start with')).not.toBeInTheDocument();
  });

  it('shows the phone Today without the week bar', () => {
    setDesk(false);
    renderToday();
    expect(screen.getByText(/Good (morning|afternoon|evening), Bill/)).toBeInTheDocument();
    expect(screen.getByText('Pick your shift to see your day.')).toBeInTheDocument();
    expect(screen.queryByText('/ 40.00 h')).not.toBeInTheDocument();
  });
});
