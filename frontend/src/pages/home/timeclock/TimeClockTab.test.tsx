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
import { nextShiftText, weekWarning } from './weekHours';
import { clockShort, myWeekTotals, weekStrip } from './ThisWeekPane';
import type { ScheduleWeek } from '../../../api/schedule.api';

const state = vi.hoisted(() => ({
  entry: null as TimeEntry | null,
  period: null as MyPeriod | null,
  weekly: null as WeeklyHoursStatus | null,
  schedule: null as ScheduleWeek | null,
  manager: false,
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: state.manager
      ? { id: 1, first_name: 'Ashley', language: 'en', access: ['hr.schedule:write'] }
      : { id: 1, first_name: 'Ashley', language: 'en', access: [] },
  }),
}));

vi.mock('../../../api/schedule.api', async (orig) => ({
  ...(await orig<typeof import('../../../api/schedule.api')>()),
  getScheduleWeek: async () => ({ data: state.schedule }),
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

const shift = (id: number, employee: number, date: string, over: Partial<ScheduleWeek['shifts'][number]> = {}): ScheduleWeek['shifts'][number] => ({
  id, employee, employee_name: `P${employee}`, date, start_time: '09:00', end_time: '17:00', text: '9am-5pm', hours: 8,
  department: 1, department_name: 'Retail', flexible: false, note: '', ...over,
});

function scheduleWeek(over: Partial<ScheduleWeek> = {}): ScheduleWeek {
  const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
  return {
    start: days[0], end: days[6], days,
    store_hours: days.map((date) => ({ date, open: date !== '2026-11-15', start: '10:00', end: '19:00' })),
    people: [],
    shifts: [
      shift(1, 1, '2026-11-11'), shift(2, 2, '2026-11-11'), shift(3, 3, '2026-11-11', { start_time: '12:00', text: '12pm-5pm', hours: 5 }),
      shift(4, 1, '2026-11-14', { flexible: true, department_name: 'Processing', text: '8am-2pm', hours: 6 }),
      shift(5, 1, '2026-11-13'),
    ],
    call_ins: [], actual: [],
    requests: [{
      id: 21, employee: 1, employee_name: 'P1', kind: 'off', date: '2026-11-13', end_date: '2026-11-13', start_time: null, end_time: null,
      note: 'Dentist', status: 'pending', reply: '', decided_by_name: '', decided_at: null, created_at: '',
    }],
    fixed_departments: ['Retail'], can_edit: false, now: {},
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

describe('weekStrip (This week, day by day)', () => {
  const real = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`;
  it('my shift each day, worked hours, a day off asked, the store closed and how many work', () => {
    const days = weekStrip(scheduleWeek(), 1, period(), '2026-11-13', real as never, 'en');
    expect(days.map((d) => d.dow)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    const wed = days[2];
    expect(wed).toMatchObject({ main: '9am-5pm', caption: 'workedH{"h":"7.5"}', captionTone: 'good', working: true, isPast: true, crew: 'crew{"n":3}' });
    // Thu: worked (no shift on the schedule), nobody else on.
    expect(days[3]).toMatchObject({ main: 'dayOffShort', caption: 'workedH{"h":"7.5"}', crew: 'crewNone' });
    // Fri (today): on the schedule with a day off asked.
    expect(days[4]).toMatchObject({ isToday: true, main: '9am-5pm', caption: 'dayOffAsked', captionTone: 'wait', crew: 'crewOne' });
    // Sat: a flexible shift says so under its times; the store hours on every day.
    expect(days[5]).toMatchObject({ main: '8am-2pm', caption: 'Processing · flexShort', store: 'storeHours{"from":"10am","to":"7pm"}' });
    expect(days[6]).toMatchObject({ main: 'storeClosed', working: false, store: 'storeClosedLine' });
  });

  it('clockShort reads store hours the way the schedule does', () => {
    expect(['10:00', '19:30', '12:00', '00:00'].map(clockShort)).toEqual(['10am', '7:30pm', '12pm', '12am']);
  });

  it('an approved day off wins over the shift; totals count my shifts only', () => {
    const week = scheduleWeek();
    week.requests![0].status = 'approved';
    const fri = weekStrip(week, 1, undefined, '2026-11-13', tc as never, 'en')[4];
    expect(fri).toMatchObject({ main: 'dayOff', working: false, caption: '' });
    expect(myWeekTotals(week, 1)).toEqual({ hours: 22, shifts: 3 });
    expect(myWeekTotals(undefined, 1)).toEqual({ hours: 0, shifts: 0 });
  });
});

describe('TimeClockTab', () => {
  beforeEach(() => {
    state.schedule = scheduleWeek();
    state.manager = false;
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

  it('This week: the days, and Full schedule opens the whole week here', async () => {
    const user = userEvent.setup();
    renderTab();
    const strip = await screen.findByTestId('week-strip');
    expect(await within(strip).findAllByRole('button')).toHaveLength(7);
    expect(screen.queryByTestId('build-schedule')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('open-full-schedule'));
    expect(await screen.findByText('schedule grid read only')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('view=everyone');
  });

  it('a day cell opens the full schedule too; managers also get Build schedule', async () => {
    state.manager = true;
    const user = userEvent.setup();
    renderTab();
    expect(screen.getByTestId('build-schedule')).toHaveTextContent('Build schedule');
    const strip = await screen.findByTestId('week-strip');
    await user.click((await within(strip).findAllByRole('button'))[0]);
    expect(await screen.findByText('schedule grid read only')).toBeInTheDocument();
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
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['TimeClock']);
  });
});
