import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TimeEntry, WeeklyHoursStatus } from '../../types/hr.types';
import { ShiftHeroCard } from './ShiftHeroCard';

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
    ...overrides,
  };
}

describe('ShiftHeroCard', () => {
  it('shows seven single-line tiles when clocked out', async () => {
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
    expect(screen.getAllByRole('button')).toHaveLength(7);
    await user.click(screen.getByRole('button', { name: 'Cashier - Open' }));
    expect(onClockIn).toHaveBeenCalledWith('retail_open');
  });

  it('shows the timer, Change, and hours left when clocked in', () => {
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
    expect(screen.getByText('17.50 h left this week')).toBeInTheDocument();
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
