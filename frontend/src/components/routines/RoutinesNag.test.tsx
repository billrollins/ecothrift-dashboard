import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyRoutines, QaNudgeRow } from '../../api/routines.api';
import type { HoursNag } from '../../hooks/useHoursNag';
import { fakeRun } from '../../pages/routines/routineFixture';
import { RoutinesNag } from './RoutinesNag';

const state = vi.hoisted(() => ({
  mine: { open: [], done: [], drafts: [], on_demand: [], idle_prompt_minutes: 20 } as MyRoutines,
  nudges: [] as QaNudgeRow[],
  hours: { level: 'none', worked: 20, limit: 40, left: 20, clockOutBy: null } as HoursNag,
  ack: vi.fn(async () => ({})),
  logout: vi.fn(async () => undefined),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, first_name: 'Bill', language: 'en' }, logout: state.logout }),
}));

vi.mock('../../hooks/useRoutines', () => ({
  useMyRoutineRuns: () => ({ data: state.mine, isLoading: false, isError: false }),
}));

vi.mock('../../hooks/useRetailQa', () => ({
  usePendingQaNudges: () => ({ data: { nudges: state.nudges } }),
  useAckQaNudge: () => ({ mutateAsync: state.ack, isPending: false }),
}));

vi.mock('../../hooks/useHoursNag', () => ({
  useHoursNag: () => state.hours,
}));

vi.mock('../../hooks/useDeviceConfig', () => ({
  useDeviceConfig: () => ({ config: { registerName: 'Register 1' } }),
}));

const theme = createTheme();
const soon = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

function renderNag() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <RoutinesNag />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('RoutinesNag', () => {
  beforeEach(() => {
    state.mine = { open: [], done: [], drafts: [], on_demand: [], idle_prompt_minutes: 20 };
    state.nudges = [];
    state.hours = { level: 'none', worked: 20, limit: 40, left: 20, clockOutBy: null };
    state.ack.mockClear();
  });

  it('is hidden when nothing nags', () => {
    state.mine = {
      ...state.mine,
      open: [fakeRun({ id: 1, due_at: soon(300), remind_at: soon(120), nag_at: soon(300), late_at: soon(400) })],
    };
    renderNag();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('counts soft nags in amber and opens the same sections in a drawer', async () => {
    const user = userEvent.setup();
    state.mine = {
      ...state.mine,
      open: [fakeRun({ id: 1, title: 'Closing checklist', due_at: soon(60), remind_at: soon(-10), nag_at: soon(60), late_at: soon(120) })],
    };
    renderNag();
    await user.click(screen.getByRole('button', { name: '1 needs attention' }));
    expect(screen.getByText('Due soon')).toBeInTheDocument();
    expect(screen.getByText('Closing checklist')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Today' })).toBeInTheDocument();
  });

  it('opens by itself for a nudge, and Heard clears the message', async () => {
    const user = userEvent.setup();
    state.mine = {
      ...state.mine,
      open: [fakeRun({
        id: 7, title: 'Opening checklist', due_at: soon(60), remind_at: soon(-10), nag_at: soon(60), late_at: soon(120),
        nudge: { id: 3, by: 'Carrie', at: new Date().toISOString(), message: 'Please finish opening', heard: false },
      })],
    };
    state.nudges = [{
      id: 3, run_id: 7, created_by: { id: 2, name: 'Carrie Smith' }, created_at: new Date().toISOString(),
      at_label: '', message: 'Please finish opening',
    }];
    renderNag();
    // One nudged routine: the message and the routine are the same nag, counted once, red.
    expect(screen.getAllByText('1 needs attention').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Please finish opening').length).toBeGreaterThan(0);
    expect(screen.getByText('From Carrie Smith', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Heard' }));
    expect(state.ack).toHaveBeenCalledWith({ id: 3, kind: 'heard', device: 'Register 1' });
  });

  it('nags red at the weekly hour limit, even with no routines due', async () => {
    const user = userEvent.setup();
    state.hours = { level: 'hard', worked: 40.2, limit: 40, left: 0, clockOutBy: null };
    renderNag();
    await user.click(screen.getByRole('button', { name: '1 needs attention' }));
    // Also the icon's tooltip, if it has opened by now.
    expect(screen.getAllByText('40 hours reached this week').length).toBeGreaterThan(0);
    expect(screen.getByText(/Clock out now\. No overtime is approved\./)).toBeInTheDocument();
  });

  it('nags amber with an hour or less left', async () => {
    const user = userEvent.setup();
    state.hours = { level: 'soft', worked: 39.5, limit: 40, left: 0.5, clockOutBy: new Date(2026, 8, 24, 16, 15) };
    renderNag();
    await user.click(screen.getByRole('button', { name: '1 needs attention' }));
    expect(screen.getByText('30 min left this week')).toBeInTheDocument();
    expect(screen.getByText(/Clock out by 4:15 PM\./)).toBeInTheDocument();
  });
});
