import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { fakeRun } from '../../../pages/routines/routineFixture';
import type { TimeEntry, WeeklyHoursStatus } from '../../../types/hr.types';
import { TodayPhone } from './TodayPhone';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const clockState = vi.hoisted(() => ({
  entry: null as TimeEntry | null,
  onBreak: false,
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, first_name: 'Bill', language: 'en' } }),
}));

vi.mock('../../../hooks/useTimeClock', () => ({
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
  useCurrentEntry: () => ({ data: clockState.entry, isLoading: false }),
  useClockIn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClockOut: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetShift: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useStartBreak: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEndBreak: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../hooks/useRoutines', () => ({
  useTodayGlance: () => ({
    isLoading: false,
    data: clockState.entry ? {
      shift: 'retail_open',
      shift_label: 'Cashier - Open',
      shift_department: 'Retail',
      start_with: fakeRun({
        id: 9,
        title: 'Open checklist',
        href: '/routines/run/9',
        nag_at: new Date(2026, 8, 3, 10, 30).toISOString(),
      }),
      verify_of: null,
      open: [
        fakeRun({
          id: 4,
          title: 'Day checklist',
          href: '/routines/run/4',
          nag_at: new Date(2026, 8, 3, 10, 30).toISOString(),
        }),
      ],
      drafts: [],
      on_demand: [],
      language: 'en',
    } : {
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
            <TodayPhone />
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('TodayPhone', () => {
  it('shows shift tiles and the clocked-out prompt', () => {
    clockState.entry = null;
    clockState.onBreak = false;
    renderToday();
    expect(screen.getByText(/Good (morning|afternoon|evening), Bill/)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.getByText('Pick your shift to see your day.')).toBeInTheDocument();
    expect(screen.queryByText('Start with')).not.toBeInTheDocument();
  });

  it('shows Start with and a due row, and navigates on tap', async () => {
    const user = userEvent.setup();
    clockState.entry = {
      id: 1,
      employee: 1,
      employee_name: 'Bill Tester',
      date: '2026-09-03',
      clock_in: new Date().toISOString(),
      clock_out: null,
      shift: 'retail_open',
      shift_label: 'Cashier - Open',
      shift_department: 'Retail',
      break_minutes: 0,
      on_break: false,
      break_started_at: null,
      total_hours: null,
      status: 'pending',
      approved_by: null,
      approved_by_name: null,
      notes: '',
      created_at: '',
      updated_at: '',
    };
    clockState.onBreak = false;
    renderToday();
    expect(screen.getByText('Open checklist')).toBeInTheDocument();
    expect(screen.getByText(/Due 10:30am/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Day checklist/i }));
    expect(navigate).toHaveBeenCalledWith('/routines/run/4');
  });

  it('disables Clock out while on break', () => {
    clockState.entry = {
      id: 1,
      employee: 1,
      employee_name: 'Bill Tester',
      date: '2026-09-03',
      clock_in: new Date().toISOString(),
      clock_out: null,
      shift: 'retail_open',
      shift_label: 'Cashier - Open',
      shift_department: 'Retail',
      break_minutes: 0,
      on_break: true,
      break_started_at: new Date().toISOString(),
      total_hours: null,
      status: 'pending',
      approved_by: null,
      approved_by_name: null,
      notes: '',
      created_at: '',
      updated_at: '',
    };
    clockState.onBreak = true;
    renderToday();
    expect(screen.getByRole('button', { name: 'Clock out' })).toBeDisabled();
  });
});
