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
  fix: vi.fn(async (_args: { id: number; clockOut?: string }) => ({})),
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
  useMyPay: () => ({ isLoading: false, data: [] }),
  useCurrentEntry: () => ({ data: clockState.entry, isLoading: false }),
  useClockIn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClockOut: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetShift: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useStartBreak: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEndBreak: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFixForgotten: () => ({ mutateAsync: clockState.fix, isPending: false }),
}));

vi.mock('../../../hooks/useTimeEntries', () => ({
  useTimeEntries: () => ({ isLoading: false, data: { results: [] } }),
  useModificationRequests: () => ({ isLoading: false, data: { count: 0, results: [] } }),
}));

// The runner has its own tests; here it only has to open in place of the list.
vi.mock('../../../pages/routines/RoutineRunnerPage', () => ({
  RoutineRunnerPage: ({ runId }: { runId?: number }) => <div>Runner {runId}</div>,
}));

vi.mock('../../../hooks/useRoutines', () => {
  // Relative to now so states do not drift with the calendar: both are soft nags (due soon).
  const soon = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
  return {
    useMyRoutineRuns: () => ({
      isLoading: false,
      isError: false,
      data: clockState.entry ? {
        start_with_id: 9,
        open: [
          fakeRun({ id: 4, title: 'Day checklist', href: '/routines/run/4', due_at: soon(10), remind_at: soon(-10), nag_at: soon(10), late_at: soon(30) }),
          fakeRun({ id: 9, title: 'Open checklist', href: '/routines/run/9', due_at: soon(20), remind_at: soon(-10), nag_at: soon(20), late_at: soon(30) }),
        ],
        done: [],
        drafts: [],
        on_demand: [],
        idle_prompt_minutes: 20,
      } : { open: [], done: [], drafts: [], on_demand: [], idle_prompt_minutes: 20 },
    }),
  };
});

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
    // Hours & pay starts folded on a phone. (The shift tiles come from an unmocked query.)
    expect(screen.getByText('Hours & pay')).toBeInTheDocument();
    expect(screen.queryByText('Current pay period')).not.toBeInTheDocument();
    expect(screen.getByText("You're all caught up for today.")).toBeInTheDocument();
    expect(screen.queryByText('Next up')).not.toBeInTheDocument();
  });

  it('leads with the shift checklist, lists the rest, and opens a routine in place', async () => {
    const user = userEvent.setup();
    clockState.entry = {
      id: 1,
      employee: 1,
      employee_name: 'Bill Tester',
      date: '2026-09-03',
      clock_in: new Date().toISOString(),
      clock_out: null,
      shift: 'retail_open',
      shift_label: 'Retail Open',
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
    expect(screen.getByText('Next up')).toBeInTheDocument();
    expect(screen.getByText('Open checklist')).toBeInTheDocument();
    expect(screen.getByText('Day checklist')).toBeInTheDocument();
    // The header and the list agree: 2 to do, both nagging (amber), under Due soon.
    expect(screen.getByText('2 to do')).toBeInTheDocument();
    expect(screen.getByText('2 need attention')).toBeInTheDocument();
    expect(screen.getByText('Due soon')).toBeInTheDocument();
    await user.click(screen.getByText('Day checklist'));
    expect(screen.getByText('Runner 4')).toBeInTheDocument();
    expect(screen.queryByText('Open checklist')).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
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
      shift_label: 'Retail Open',
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

  it('asks when they left for a punch that was never clocked out, instead of Clock out', async () => {
    const user = userEvent.setup();
    const since = new Date(Date.now() - 24 * 3_600_000);
    const suggested = new Date(since.getTime() + 7 * 3_600_000);
    clockState.entry = {
      id: 7,
      employee: 1,
      employee_name: 'Bill Tester',
      date: '2026-09-23',
      clock_in: since.toISOString(),
      clock_out: null,
      shift: 'retail_open',
      shift_label: 'Retail Open',
      shift_department: 'Retail',
      break_minutes: 0,
      on_break: false,
      break_started_at: null,
      total_hours: null,
      status: 'pending',
      stale: { since: since.toISOString(), suggested_clock_out: suggested.toISOString() },
      approved_by: null,
      approved_by_name: null,
      notes: '',
      created_at: '',
      updated_at: '',
    };
    clockState.onBreak = false;
    renderToday();
    expect(screen.getByText('You never clocked out')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clock out' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close it at this time' }));
    // The suggestion is filled in; minutes precision, as the time box keeps them.
    const sent = clockState.fix.mock.calls[0][0];
    expect(sent.id).toBe(7);
    expect(Math.abs(new Date(sent.clockOut ?? '').getTime() - suggested.getTime())).toBeLessThan(60_000);
  });
});
