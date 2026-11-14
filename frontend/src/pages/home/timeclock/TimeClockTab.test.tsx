import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HoursNag } from '../../../hooks/useHoursNag';
import type { MyPeriod, MyPeriodWorked, TimeEntry, WeeklyHoursStatus } from '../../../types/hr.types';
import TimeClockTab from './TimeClockTab';
import { shiftRows } from './MineView';
import { nextShiftText, weekWarning } from './WeekHoursCard';

const state = vi.hoisted(() => ({
  entry: null as TimeEntry | null,
  period: null as MyPeriod | null,
  weekly: null as WeeklyHoursStatus | null,
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, first_name: 'Ashley', language: 'en' } }),
}));

vi.mock('../../../hooks/useTimeClock', () => ({
  useWeeklyHoursStatus: () => ({ data: state.weekly, isLoading: false, dataUpdatedAt: Date.now() }),
  useMyPeriod: () => ({ data: state.period, isLoading: false, isError: false }),
  useMyPay: () => ({ isLoading: false, data: [] }),
  useCurrentEntry: () => ({ data: state.entry, isLoading: false }),
  useClockIn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClockOut: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetShift: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useStartBreak: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEndBreak: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFixForgotten: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../hooks/useRoutines', () => ({
  useMyRoutineRuns: () => ({ isLoading: false, isError: false, data: { open: [], done: [], drafts: [], on_demand: [], idle_prompt_minutes: 20 } }),
}));

// The week grid has its own tests; here it only has to come up read only.
vi.mock('../../people/SchedulePage', () => ({
  default: ({ embedded }: { embedded?: boolean }) => <div>schedule grid {embedded ? 'read only' : 'editable'}</div>,
}));

function setDesk(desk: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desk ? query.includes('min-width') : query.includes('max-width'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const week = (worked: string, limit = '40.00'): WeeklyHoursStatus => ({
  week_start: '2026-11-09',
  week_end: '2026-11-15',
  hours_worked: worked,
  hours_limit: limit,
  hours_remaining: String(Math.max(parseFloat(limit) - parseFloat(worked), 0)),
  is_at_limit: parseFloat(worked) >= parseFloat(limit),
  is_over_limit: parseFloat(worked) > parseFloat(limit),
  overtime_hours: '0.00',
});

function entry(over: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 1, employee: 1, employee_name: 'Ashley Tester', date: '2026-11-12',
    clock_in: '2026-11-12T15:00:00Z', clock_out: '2026-11-12T23:00:00Z', shift: 'retail_open', shift_label: 'Retail Open',
    shift_department: 'Retail', break_minutes: 30, on_break: false, break_started_at: null, total_hours: '7.50',
    status: 'pending', approved_by: null, approved_by_name: null, notes: '', created_at: '', updated_at: '', ...over,
  };
}

const worked = (over: Partial<MyPeriodWorked> = {}): MyPeriodWorked => ({ ...entry(), change: null, ...over });

function period(over: Partial<MyPeriod> = {}): MyPeriod {
  return {
    date_from: '2026-11-09', date_to: '2026-11-22', label: 'Nov 09 - 22, 2026', today: '2026-11-13', days_left: 9,
    on_payroll: true,
    so_far: { hours: '15.50', overtime_hours: '0.00', pending_hours: '15.50', shift_count: 2, pay: '232.50' },
    ahead: { hours: '16.00', shift_count: 2, pay: '240.00' },
    expected: { hours: '31.50', overtime_hours: '0.00', pay: '472.50' },
    weeks: [
      { start: '2026-11-09', end: '2026-11-15', worked: '15.50', ahead: '8.00', limit: '40.00', is_current: true },
      { start: '2026-11-16', end: '2026-11-22', worked: '0.00', ahead: '8.00', limit: '40.00', is_current: false },
    ],
    days: [
      {
        date: '2026-11-11', is_today: false, is_past: true,
        scheduled: [{ id: 5, date: '2026-11-11', start_time: '09:00', end_time: '17:00', text: '9am-5pm', hours: 8, hours_ahead: '0.00', department_name: 'Retail' }],
        worked: [worked({ id: 11, date: '2026-11-11', change: { id: 3, status: 'pending', review_note: '' } })],
        day_off: null,
      },
      { date: '2026-11-12', is_today: false, is_past: true, scheduled: [], worked: [worked({ id: 12, status: 'flagged' })], day_off: null },
      {
        date: '2026-11-14', is_today: false, is_past: false,
        scheduled: [{ id: 6, date: '2026-11-14', start_time: '09:00', end_time: '17:00', text: '9am-5pm', hours: 8, hours_ahead: '8.00', department_name: 'Retail' }],
        worked: [], day_off: null,
      },
    ],
    requests: [{
      id: 21, kind: 'off', date: '2026-11-20', end_date: '2026-11-20', start_time: null, end_time: null, note: 'Dentist',
      status: 'pending', reply: '', decided_by_name: '', decided_at: null, created_at: '2026-11-10T12:00:00Z',
    }],
    ...over,
  };
}

const tc = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`;
const NONE: HoursNag = { level: 'none', worked: 0, limit: 40, left: 40, clockOutBy: null };

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.search}</div>;
}

function renderTab(path = '/dashboard?tab=myday') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={createTheme()}>
      <QueryClientProvider client={client}>
        <SnackbarProvider>
          <MemoryRouter initialEntries={[path]}>
            <TimeClockTab />
            <Where />
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('weekWarning (the overtime warning)', () => {
  it('says the hours left, and what the schedule adds this week', () => {
    expect(weekWarning(week('20.00'), NONE, null, undefined, tc, 'en')).toMatchObject({ tone: 'quiet', text: 'hLeft{"left":"20"}' });
    const text = weekWarning(week('20.00'), NONE, null, period(), tc, 'en').text;
    expect(text).toBe('hLeft{"left":"20"} scheduledAhead{"ahead":"8"}');
  });

  it('warns ahead when the schedule takes the week past what they are cleared for', () => {
    const p = period({ weeks: [{ start: '2026-11-09', end: '2026-11-15', worked: '36.00', ahead: '8.00', limit: '40.00', is_current: true }] });
    expect(weekWarning(week('36.00'), NONE, null, p, tc, 'en')).toMatchObject({
      tone: 'wait', text: 'scheduleOver{"total":"44","over":"4","limit":"40"}',
    });
  });

  it('on the clock: the time to clock out by an hour out, clock out now at the limit, the red flag past it', () => {
    const open = entry({ clock_out: null });
    const soft: HoursNag = { level: 'soft', worked: 39.5, limit: 40, left: 0.5, clockOutBy: new Date(2026, 10, 13, 16, 30) };
    expect(weekWarning(week('39.50'), soft, open, undefined, tc, 'en')).toMatchObject({
      tone: 'wait', worked: 39.5, text: 'soonLeft{"left":"30 min","time":"4:30 PM","limit":"40"}',
    });
    const hard: HoursNag = { level: 'hard', worked: 40, limit: 40, left: 0, clockOutBy: null };
    expect(weekWarning(week('40.00'), hard, open, undefined, tc, 'en')).toMatchObject({ tone: 'problem', text: 'atLimit{"limit":"40"}' });
    expect(weekWarning(week('43.20'), NONE, null, undefined, tc, 'en').tone).toBe('problem');
  });

  it('counts the overtime allowance in the limit', () => {
    expect(weekWarning(week('42.00', '45.00'), NONE, null, undefined, tc, 'en')).toMatchObject({ tone: 'quiet', limit: 45 });
  });
});

describe('shiftRows and nextShiftText', () => {
  it('one row per shift worked, the schedule on the day, a status that says what needs a look', () => {
    const rows = shiftRows(period(), tc as never, 'en');
    expect(rows.map((r) => [r.day, r.scheduled, r.status?.label ?? null, Boolean(r.fix)])).toEqual([
      ['Wed Nov 11', '9am-5pm Retail · 8.00 h', 'fixAsked', false],
      ['Thu Nov 12', '', 'needsFix', true],
      ['Sat Nov 14', '9am-5pm Retail · 8.00 h', 'upcoming', false],
    ]);
    expect(rows[1].hours).toBe('7.50 h');
  });

  it('names the next shift still ahead, skipping an approved day off', () => {
    expect(nextShiftText(period(), 'Today', 'en')).toBe('Sat Nov 14 · 9am-5pm Retail');
    const off = period();
    off.days[2].day_off = { ...off.requests[0], date: '2026-11-14', end_date: '2026-11-14', status: 'approved' };
    expect(nextShiftText(off, 'Today', 'en')).toBeNull();
  });
});

describe('TimeClockTab', () => {
  beforeEach(() => {
    state.entry = null;
    state.period = period();
    state.weekly = week('15.50');
    setDesk(false);
  });

  it('shows the clock, the week and Mine; pay stays hidden until Show pay', async () => {
    const user = userEvent.setup();
    renderTab();
    expect(screen.getByTestId('time-clock-card')).toBeInTheDocument();
    expect(screen.getByTestId('week-warning')).toHaveTextContent('24.5 h left this week. 8 h more on the schedule this week.');
    expect(screen.getByTestId('next-shift')).toHaveTextContent('Sat Nov 14 · 9am-5pm Retail');
    const tiles = screen.getByTestId('period-tiles');
    expect(within(tiles).getByText('15.50 h')).toBeInTheDocument();
    expect(within(tiles).queryByText('$232.50')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show pay' }));
    expect(within(tiles).getByText('$232.50')).toBeInTheDocument();
    expect(within(tiles).getByText('$472.50')).toBeInTheDocument();
    expect(within(tiles).getByText('Expected by Nov 22')).toBeInTheDocument();
  });

  it('off payroll: hours, no dollars and no Show pay', () => {
    state.period = period({
      on_payroll: false,
      so_far: { hours: '15.50', overtime_hours: '0.00', pending_hours: '0.00', shift_count: 2, pay: null },
      ahead: { hours: '16.00', shift_count: 2, pay: null },
      expected: { hours: '31.50', overtime_hours: '0.00', pay: null },
    });
    renderTab();
    const tiles = screen.getByTestId('period-tiles');
    expect(within(tiles).getByText('31.50 h')).toBeInTheDocument();
    expect(within(tiles).getByText('Hours only: you are not on payroll.')).toBeInTheDocument();
    expect(within(tiles).queryByText(/\$/)).not.toBeInTheDocument();
    // The button keeps its room (no layout shift) but is hidden: nothing to show.
    expect(screen.queryByRole('button', { name: 'Show pay' })).not.toBeInTheDocument();
  });

  it('Fix opens a time change request; Request time off opens the ask', async () => {
    const user = userEvent.setup();
    renderTab();
    expect(screen.getByText('Fix asked')).toBeInTheDocument();
    expect(screen.getByText('Needs a fix')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fix this shift: Thu Nov 12' }));
    expect(await screen.findByText('Request time change')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Day off Fri Nov 20')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request time off' }));
    expect(await screen.findByText('Days off are unpaid.')).toBeInTheDocument();
  });

  it('Everyone shows the week read only, and stays in the URL', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByTestId('time-clock-everyone-tab'));
    expect(await screen.findByText('schedule grid read only')).toBeInTheDocument();
    expect(screen.queryByTestId('time-clock-mine')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('view=everyone');
  });

  it('opens on Everyone from an old staff Schedule link', async () => {
    renderTab('/dashboard?tab=myday&view=everyone');
    await waitFor(() => expect(screen.getByText('schedule grid read only')).toBeInTheDocument());
  });

  it('on the clock: break and clock out; Clock out waits while on break', () => {
    state.entry = entry({ clock_out: null, on_break: true, break_started_at: new Date().toISOString(), clock_in: new Date().toISOString() });
    renderTab();
    expect(screen.getByRole('button', { name: 'Clock out' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'End break' })).toBeEnabled();
  });

  it('on a desk the band names the tab once and the body does not repeat it', () => {
    setDesk(true);
    renderTab();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Time clock']);
  });
});
