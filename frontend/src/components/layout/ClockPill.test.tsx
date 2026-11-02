import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockPill } from './ClockPill';

const state = vi.hoisted(() => ({
  entry: null as null | Record<string, unknown>,
  clockOut: vi.fn(async () => undefined),
  clockIn: vi.fn(async (_shift: string) => undefined),
  toggleBreak: vi.fn(async () => undefined),
  guardOpen: false,
  language: 'en' as 'en' | 'es',
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 7, role: 'Employee', is_superuser: false, language: state.language } }),
}));

vi.mock('../../hooks/useTimeClock', () => ({
  useCurrentEntry: () => ({ data: state.entry, isLoading: false }),
}));

vi.mock('../../pages/hr/useTimeClockActions', () => ({
  useTimeClockActions: () => ({
    entry: state.entry,
    onBreak: Boolean(state.entry?.on_break),
    owed: [],
    guardOpen: state.guardOpen,
    closeGuard: vi.fn(),
    limitOpen: false,
    confirmLimit: vi.fn(),
    closeLimit: vi.fn(),
    clockIn: state.clockIn,
    clockOut: state.clockOut,
    toggleBreak: state.toggleBreak,
    pending: { clockIn: false, clockOut: false, break: false, fix: false },
  }),
}));

vi.mock('../hr/ShiftPicker', () => ({
  ShiftPicker: ({ onPick }: { onPick: (shift: string) => void }) => (
    <button type="button" onClick={() => onPick('retail_open')}>Pick Retail Open</button>
  ),
}));

const theme = createTheme();

function entry(extra: Record<string, unknown> = {}) {
  return {
    id: 5,
    clock_in: new Date(2026, 10, 2, 8, 58).toISOString(),
    clock_out: null,
    shift: 'retail_open',
    shift_label: 'Retail Open',
    on_break: false,
    break_minutes: 0,
    break_started_at: null,
    stale: null,
    ...extra,
  };
}

function renderPill() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <ClockPill />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('ClockPill', () => {
  beforeEach(() => {
    state.entry = null;
    state.language = 'en';
    state.guardOpen = false;
    state.clockOut.mockClear();
    state.clockIn.mockClear();
    state.toggleBreak.mockClear();
  });

  it('says when the shift started', () => {
    state.entry = entry();
    renderPill();
    expect(screen.getByTestId('clock-pill')).toHaveAccessibleName(/On shift since 8:58 AM/);
  });

  it('says Not clocked in when there is no open punch', () => {
    renderPill();
    expect(screen.getByTestId('clock-pill')).toHaveAccessibleName(/Not clocked in/);
  });

  it('speaks Spanish', () => {
    state.language = 'es';
    state.entry = entry();
    renderPill();
    expect(screen.getByTestId('clock-pill')).toHaveAccessibleName(/En turno desde 8:58 AM/);
  });

  it('tapping the pill opens the shift dialog and sends nothing', async () => {
    const user = userEvent.setup();
    state.entry = entry();
    renderPill();
    await user.click(screen.getByTestId('clock-pill'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText("Today's shift")).toBeInTheDocument();
    expect(screen.getByText('Retail Open')).toBeInTheDocument();
    expect(state.clockOut).not.toHaveBeenCalled();
  });

  it('clock out needs an explicit confirm: "Clock out now, <time>?" then Clock out', async () => {
    const user = userEvent.setup();
    state.entry = entry();
    renderPill();
    await user.click(screen.getByTestId('clock-pill'));

    await user.click(screen.getByRole('button', { name: 'Clock out' }));
    expect(screen.getByTestId('clock-confirm')).toHaveTextContent(/^Clock out now, \d{1,2}:\d{2} (AM|PM)\?$/);
    expect(state.clockOut).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Clock out' }));
    expect(state.clockOut).toHaveBeenCalledTimes(1);
  });

  it('Cancel on the confirm step sends nothing and goes back to the shift', async () => {
    const user = userEvent.setup();
    state.entry = entry();
    renderPill();
    await user.click(screen.getByTestId('clock-pill'));
    await user.click(screen.getByRole('button', { name: 'Clock out' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(state.clockOut).not.toHaveBeenCalled();
    expect(screen.queryByTestId('clock-confirm')).not.toBeInTheDocument();
    expect(screen.getByText("Today's shift")).toBeInTheDocument();
  });

  it('clock in picks a shift, then asks "Clock in to <shift> now, <time>?" before sending', async () => {
    const user = userEvent.setup();
    renderPill();
    await user.click(screen.getByTestId('clock-pill'));
    await user.click(screen.getByRole('button', { name: 'Pick Retail Open' }));
    expect(state.clockIn).not.toHaveBeenCalled();
    expect(screen.getByTestId('clock-confirm')).toHaveTextContent(/^Clock in to .+ now, \d{1,2}:\d{2} (AM|PM)\?$/);

    await user.click(screen.getByRole('button', { name: 'Clock in' }));
    expect(state.clockIn).toHaveBeenCalledWith('retail_open');
  });

  it('on a break the primary button ends the break; clock out waits for it', async () => {
    const user = userEvent.setup();
    state.entry = entry({ on_break: true, break_started_at: new Date(2026, 10, 2, 12, 0).toISOString() });
    renderPill();
    await user.click(screen.getByTestId('clock-pill'));
    expect(screen.queryByRole('button', { name: 'Clock out' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'End break' }));
    expect(state.toggleBreak).toHaveBeenCalledTimes(1);
    expect(state.clockOut).not.toHaveBeenCalled();
  });

  it('a forgotten punch is fixed in My day, not clocked out from the pill', async () => {
    const user = userEvent.setup();
    state.entry = entry({ stale: { since: 'x', suggested_clock_out: 'y' } });
    renderPill();
    await user.click(screen.getByTestId('clock-pill'));
    expect(screen.getByRole('button', { name: 'Fix it in My day' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clock out' })).not.toBeInTheDocument();
  });
});
