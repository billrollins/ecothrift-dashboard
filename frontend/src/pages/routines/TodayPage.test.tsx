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
  useNavBadgeCounts: () => ({}),
  useNavBadgeTones: () => ({ today: 'grey' }),
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
  useMyPay: () => ({ isLoading: false, data: [] }),
  useCurrentEntry: () => ({ data: null as TimeEntry | null, isLoading: false }),
  useClockIn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClockOut: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetShift: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useStartBreak: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEndBreak: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFixForgotten: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../hooks/useTimeEntries', () => ({
  useTimeEntries: () => ({ isLoading: false, data: { results: [] } }),
  useModificationRequests: () => ({ isLoading: false, data: { count: 0, results: [] } }),
}));

vi.mock('./RoutineRunnerPage', () => ({
  RoutineRunnerPage: ({ runId }: { runId?: number }) => <div>Runner {runId}</div>,
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

function renderToday(path = '/today') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <SnackbarProvider>
          <MemoryRouter initialEntries={[path]}>
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

  it('shows the desk punch column, an empty list, and Hours & pay once', () => {
    setDesk(true);
    renderToday();
    expect(screen.getByText(/Good (morning|afternoon|evening), Bill/)).toBeInTheDocument();
    // The shift tiles come from a query this test does not mock, so they are not counted here.
    expect(screen.getByText("You're all caught up for today.")).toBeInTheDocument();
    expect(screen.getByText('Hours & pay')).toBeInTheDocument();
    expect(screen.getAllByText('17.50 h left')).toHaveLength(1);
    expect(screen.queryByText(/h left this week/)).not.toBeInTheDocument();
    expect(screen.queryByText('My QA')).not.toBeInTheDocument();
  });

  it('opens a routine beside the list on a desk', () => {
    setDesk(true);
    renderToday('/today?run=5');
    expect(screen.getByText('Runner 5')).toBeInTheDocument();
    expect(screen.getByText('To do today')).toBeInTheDocument();
  });

  it('shows the phone Today with Hours & pay', () => {
    setDesk(false);
    renderToday();
    expect(screen.getByText(/Good (morning|afternoon|evening), Bill/)).toBeInTheDocument();
    expect(screen.getByText("You're all caught up for today.")).toBeInTheDocument();
    expect(screen.getByText('Hours & pay')).toBeInTheDocument();
  });

  it('gives a routine the whole screen on a phone', () => {
    setDesk(false);
    renderToday('/today?run=5');
    expect(screen.getByText('Runner 5')).toBeInTheDocument();
    expect(screen.queryByText(/Good (morning|afternoon|evening), Bill/)).not.toBeInTheDocument();
  });

  it('opens Hours & pay from an old Pay link', () => {
    setDesk(false);
    renderToday('/today?hours=1');
    expect(screen.getByText('Current pay period')).toBeInTheDocument();
    expect(screen.getByText('Recent shifts')).toBeInTheDocument();
  });
});
