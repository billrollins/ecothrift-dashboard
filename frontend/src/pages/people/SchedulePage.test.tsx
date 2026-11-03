import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleWeek } from '../../api/schedule.api';
import { groupByWeek } from '../../components/hr/MyWeek';
import SchedulePage, { weekLabel } from './SchedulePage';

const api = vi.hoisted(() => ({
  getScheduleWeek: vi.fn(),
  createScheduledShift: vi.fn(),
  updateScheduledShift: vi.fn(),
  deleteScheduledShift: vi.fn(),
  copyScheduleWeek: vi.fn(),
  fillScheduleFromUsual: vi.fn(),
  recordCallIn: vi.fn(),
}));
vi.mock('../../api/schedule.api', () => api);
vi.mock('../../api/hr.api', () => ({
  getDepartments: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Retail' }, { id: 2, name: 'Processing' }] }),
}));

const WEEK: ScheduleWeek = {
  start: '2026-10-19', end: '2026-10-25',
  days: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'],
  people: [
    { id: 6, name: 'Dave T', department: 2, department_name: 'Processing', fixed: false, hours: 8, call_ins: { d30: 0, d90: 0, no_show_90: 0 },
      usual: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start_time: '09:00', end_time: '17:00', department: 2, department_name: 'Processing', flexible: true })) },
    { id: 5, name: 'Carrie T', department: 1, department_name: 'Retail', fixed: true, usual: [], hours: 6, call_ins: { d30: 2, d90: 3, no_show_90: 0 } },
  ],
  shifts: [
    { id: 11, employee: 5, employee_name: 'Carrie T', date: '2026-10-20', start_time: '09:00', end_time: '15:00', text: '9am-3pm', hours: 6, department: 1, department_name: 'Retail', flexible: false, note: '' },
    { id: 12, employee: 6, employee_name: 'Dave T', date: '2026-10-21', start_time: '08:00', end_time: '16:00', text: '8am-4pm', hours: 8, department: 2, department_name: 'Processing', flexible: true, note: 'Truck day' },
    { id: 13, employee: 6, employee_name: 'Dave T', date: '2026-10-22', start_time: '09:00', end_time: '17:00', text: '9am-5pm', hours: 8, department: 2, department_name: 'Processing', flexible: true, note: '' },
    { id: 14, employee: 5, employee_name: 'Carrie T', date: '2026-10-22', start_time: '09:00', end_time: '15:00', text: '9am-3pm', hours: 6, department: 1, department_name: 'Retail', flexible: false, note: '' },
  ],
  store_hours: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']
    .map((date, i) => ({ date, open: i < 6, start: '09:00', end: '18:00' })),
  call_ins: [
    { id: 21, employee: 5, employee_name: 'Carrie T', shift_date: '2026-10-22', scheduled_shift: null, shift_text: '', kind: 'called_in', kind_label: 'Called in', called_at: null, reason: 'Sick', recorded_by: 'M', created_at: '' },
  ],
  fixed_departments: ['retail-operations'],
  can_edit: true,
  now: {},
};

/** MUI useMediaQuery reads matchMedia: true makes every min-width query match (a 1440 px desk), false a phone. */
function setWide(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide && query.includes('min-width'), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <SchedulePage />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('SchedulePage', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getScheduleWeek.mockResolvedValue({ data: WEEK });
    api.createScheduledShift.mockResolvedValue({ data: {} });
    api.copyScheduleWeek.mockResolvedValue({ data: { made: 4 } });
    setWide(true);
  });

  it('groups by department, Retail first, and shows only what differs from usual', async () => {
    renderPage();
    const carrie = await screen.findByTestId('schedule-row-5');
    const sections = screen.getAllByTestId(/^section-/).map((el) => el.dataset.testid);
    expect(sections).toEqual(['section-1', 'section-2']);
    // Retail: a bar on the timeline; a call-in replaces the shift; call-ins this week, not "2 / 3".
    expect(within(carrie).getByTestId('bar-11')).toHaveTextContent('9-3');
    expect(within(screen.getByTestId('cell-5-2026-10-22')).getByTestId('callin-cell')).toHaveTextContent('Called in9-3');
    expect(within(screen.getByTestId('cell-5-2026-10-22')).queryByTestId('bar-14')).toBeNull();
    expect(carrie).toHaveTextContent('1 call-in this week');
    expect(carrie).not.toHaveTextContent('2 / 3');
    // Processing: the usual week once; Wed changed, Thu is usual (nothing drawn), Mon/Tue/Fri are days off.
    const dave = screen.getByTestId('schedule-row-6');
    expect(screen.getByTestId('usual-6')).toHaveTextContent('Mon-Fri 9-5');
    expect(screen.getByTestId('cell-6-2026-10-21')).toHaveTextContent('8-4');
    expect(screen.getByTestId('cell-6-2026-10-22')).toHaveTextContent('');
    expect(screen.getByTestId('cell-6-2026-10-19')).toHaveTextContent('Off');
    expect(screen.getByTestId('cell-6-2026-10-24')).toHaveTextContent('');
    expect(dave).not.toHaveTextContent('call-in');
    // Coverage: Carrie called in Thursday, so nobody is on the floor; Tuesday she covers 9-3 alone.
    expect(screen.getByTestId('coverage-2026-10-22')).toHaveTextContent('Gap 9-6');
    expect(screen.getByTestId('coverage-2026-10-20')).toHaveTextContent('Gap 3-6');
    expect(screen.getByTestId('coverage-2026-10-19')).toHaveTextContent('Gap 9-6'); // open, nobody on: keeps its width
    // Sunday: closed and nobody works, a narrow column with no coverage to judge.
    expect(screen.queryByTestId('coverage-2026-10-25')).toBeNull();
    expect(within(screen.getByTestId('section-1')).getAllByRole('columnheader').map((th) => th.textContent)).toContain('Su');
  });

  it('adds a shift on an empty day', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByTestId('schedule-row-6');
    await user.click(screen.getByTestId('cell-6-2026-10-19')); // Monday
    await user.click(await screen.findByRole('button', { name: 'Add shift' }));
    await waitFor(() => expect(api.createScheduledShift).toHaveBeenCalledWith({
      employee: 6, date: '2026-10-19', department: 2, start_time: '09:00', end_time: '15:00', note: '',
    }));
  });

  it('opens the shift when a usual day is tapped', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('cell-6-2026-10-22'));
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('collapses a flexible department', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('schedule-row-6');
    await user.click(screen.getByRole('button', { name: 'Hide Processing' }));
    expect(screen.queryByTestId('schedule-row-6')).toBeNull();
    expect(screen.getByTestId('schedule-row-5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show Processing' }));
    expect(screen.getByTestId('schedule-row-6')).toBeInTheDocument();
  });

  it('copies last week onto this one', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('schedule-row-5');
    const start = api.getScheduleWeek.mock.calls[0][0] as string;
    await user.click(screen.getByRole('button', { name: 'Copy last week' }));
    await waitFor(() => expect(api.copyScheduleWeek).toHaveBeenCalled());
    const [from, to] = api.copyScheduleWeek.mock.calls[0];
    expect(to).toBe(start);
    // UTC, so a week with a clock change (Nov 1) is still 7 days.
    expect(new Date(`${to}T12:00Z`).getTime() - new Date(`${from}T12:00Z`).getTime()).toBe(7 * 86_400_000);
  });
});

describe('schedule helpers', () => {
  it('labels a week and splits my two weeks', () => {
    expect(weekLabel('2026-10-19')).toBe('Oct 19-25');
    expect(weekLabel('2026-10-26')).toBe('Oct 26-Nov 1');
    const weeks = groupByWeek('2026-10-19', [WEEK.shifts[0], { ...WEEK.shifts[0], id: 99, date: '2026-10-27' }]);
    expect(weeks.map((w) => w.shifts.length)).toEqual([1, 1]);
  });

  it('staff see the week read-only, with who is on right now', async () => {
    // Dash Updates #6: no call-ins, no counts, no edit buttons; a chip for each person's state now.
    const people = WEEK.people.map(({ call_ins: _c, ...p }) => p);
    api.getScheduleWeek.mockResolvedValue({
      data: { ...WEEK, people, call_ins: [], can_edit: false, now: { '5': 'late', '6': 'on_shift' } },
    });
    renderPage();
    const carrie = await screen.findByTestId('schedule-row-5');
    expect(within(carrie).getByTestId('now-late')).toHaveAttribute('aria-label', 'Late');
    expect(within(screen.getByTestId('schedule-row-6')).getByTestId('now-on_shift')).toHaveAttribute('aria-label', 'On shift');
    expect(screen.queryByText('Copy last week')).not.toBeInTheDocument();
    expect(screen.queryByText('Call-ins')).not.toBeInTheDocument();
    expect(screen.queryByTestId('callin-cell')).toBeNull();
    await userEvent.click(carrie.querySelectorAll('td')[2]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
