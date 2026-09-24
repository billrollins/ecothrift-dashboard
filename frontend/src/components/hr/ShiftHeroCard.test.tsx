import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TimeEntry, WeeklyHoursStatus } from '../../types/hr.types';
import { ShiftHeroCard } from './ShiftHeroCard';

// The shift tiles come from the staff endpoint; two departments are enough here.
vi.mock('../../api/hr.api', () => ({
  getClockTiles: async () => ({
    data: [
      { punch_code: 'retail_open', name: 'Retail Open', department: 'Retail', department_slug: 'retail', department_sort: 0 },
      { punch_code: 'retail_close', name: 'Retail Close', department: 'Retail', department_slug: 'retail', department_sort: 0 },
      { punch_code: 'warehouse_day', name: 'Warehouse Day', department: 'Warehouse', department_slug: 'warehouse', department_sort: 1 },
    ],
  }),
}));

function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const weekly: WeeklyHoursStatus = {
  week_start: '2026-08-31',
  week_end: '2026-09-06',
  hours_worked: '22.50',
  hours_limit: '40.00',
  hours_remaining: '17.50',
  is_at_limit: false,
  is_over_limit: false,
  overtime_hours: '0.00',
};

function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 1,
    employee: 1,
    employee_name: 'Bill Tester',
    date: '2026-09-03',
    clock_in: new Date(Date.now() - 3661_000).toISOString(),
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
    ...overrides,
  };
}

describe('ShiftHeroCard', () => {
  it('shows the shift tiles when clocked out and clocks in on a tap', async () => {
    const user = userEvent.setup();
    const onClockIn = vi.fn();
    render(
      <ShiftHeroCard
        entry={null}
        weekly={weekly}
        lang="en"
        onClockIn={onClockIn}
        onSetShift={vi.fn()}
      />,
    );
    expect(screen.getByText('Clock in')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Retail Open' }));
    expect(onClockIn).toHaveBeenCalledWith('retail_open');
  });

  it('shows the timer and Change when clocked in; weekly hours live in Hours & pay', () => {
    render(
      <ShiftHeroCard
        entry={entry()}
        weekly={weekly}
        lang="en"
        onClockIn={vi.fn()}
        onSetShift={vi.fn()}
      />,
    );
    expect(screen.getByText('On the clock')).toBeInTheDocument();
    expect(screen.getByText(/\d+:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.queryByText(/h left this week/)).not.toBeInTheDocument();
  });

  it('names the break on the status line', () => {
    render(
      <ShiftHeroCard
        entry={entry({ on_break: true, break_started_at: new Date().toISOString() })}
        weekly={weekly}
        lang="en"
        onClockIn={vi.fn()}
        onSetShift={vi.fn()}
      />,
    );
    expect(screen.getByText('On break')).toBeInTheDocument();
    expect(screen.getByText('End your break before clocking out.')).toBeInTheDocument();
  });
});
