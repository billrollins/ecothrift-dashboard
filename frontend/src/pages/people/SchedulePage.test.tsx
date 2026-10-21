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
    { id: 5, name: 'Carrie T', department: 1, department_name: 'Retail', hours: 6, call_ins: { d30: 2, d90: 3, no_show_90: 0 } },
    { id: 6, name: 'Dave T', department: 2, department_name: 'Processing', hours: 8, call_ins: { d30: 0, d90: 0, no_show_90: 0 } },
  ],
  shifts: [
    { id: 11, employee: 5, employee_name: 'Carrie T', date: '2026-10-20', start_time: '09:00', end_time: '15:00', text: '9am-3pm', hours: 6, department: 1, department_name: 'Retail', flexible: false, note: '' },
    { id: 12, employee: 6, employee_name: 'Dave T', date: '2026-10-21', start_time: '08:00', end_time: '16:00', text: '8am-4pm', hours: 8, department: 2, department_name: 'Processing', flexible: true, note: 'Truck day' },
  ],
  call_ins: [
    { id: 21, employee: 5, employee_name: 'Carrie T', shift_date: '2026-10-22', scheduled_shift: null, shift_text: '', kind: 'called_in', kind_label: 'Called in', called_at: null, reason: 'Sick', recorded_by: 'M', created_at: '' },
  ],
  fixed_departments: ['retail-operations'],
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
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getScheduleWeek.mockResolvedValue({ data: WEEK });
    api.createScheduledShift.mockResolvedValue({ data: {} });
    api.copyScheduleWeek.mockResolvedValue({ data: { made: 4 } });
    setWide(true);
  });

  it('shows each person with fixed and flexible shifts, call-ins and counts', async () => {
    renderPage();
    const carrie = await screen.findByTestId('schedule-row-5');
    expect(carrie).toHaveTextContent('9am-3pm');
    expect(carrie).toHaveTextContent('Called in');
    expect(carrie).toHaveTextContent('2 / 3');
    const dave = screen.getByTestId('schedule-row-6');
    expect(dave).toHaveTextContent('~8am-4pm');
    expect(dave).toHaveTextContent('Truck day');
  });

  it('adds a shift on an empty day', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByTestId('schedule-row-6');
    await user.click(within(row).getAllByRole('cell')[1]); // Monday
    await user.click(await screen.findByRole('button', { name: 'Add shift' }));
    await waitFor(() => expect(api.createScheduledShift).toHaveBeenCalledWith({
      employee: 6, date: '2026-10-19', department: 2, start_time: '09:00', end_time: '15:00', note: '',
    }));
  });

  it('on a phone shows one day at a time as cards', async () => {
    setWide(false);
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByTestId('schedule-phone')).toBeInTheDocument();
    expect(screen.queryByTestId('schedule-row-5')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Tue\s*20/ }));
    expect(screen.getByTestId('schedule-card-5')).toHaveTextContent('9am-3pm Retail');
    expect(screen.getByTestId('schedule-card-6')).toHaveTextContent('Off');
    await user.click(screen.getByRole('button', { name: /Wed\s*21/ }));
    expect(screen.getByTestId('schedule-card-6')).toHaveTextContent('About 8am-4pm Processing');
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
    expect(new Date(`${to}T12:00`).getTime() - new Date(`${from}T12:00`).getTime()).toBe(7 * 86_400_000);
  });
});

describe('schedule helpers', () => {
  it('labels a week and splits my two weeks', () => {
    expect(weekLabel('2026-10-19')).toBe('Oct 19-25');
    expect(weekLabel('2026-10-26')).toBe('Oct 26-Nov 1');
    const weeks = groupByWeek('2026-10-19', [WEEK.shifts[0], { ...WEEK.shifts[0], id: 99, date: '2026-10-27' }]);
    expect(weeks.map((w) => w.shifts.length)).toEqual([1, 1]);
  });
});
