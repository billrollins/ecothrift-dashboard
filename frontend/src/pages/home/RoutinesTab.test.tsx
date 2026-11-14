import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { fakeRun } from '../routines/routineFixture';
import type { TimeEntry } from '../../types/hr.types';
import RoutinesTab from './RoutinesTab';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const clocked: TimeEntry = {
  id: 1, employee: 1, employee_name: 'Bill Tester', date: '2026-09-03', clock_in: new Date().toISOString(), clock_out: null,
  shift: 'retail_open', shift_label: 'Retail Open', shift_department: 'Retail', break_minutes: 0, on_break: false,
  break_started_at: null, total_hours: null, status: 'pending', approved_by: null, approved_by_name: null, notes: '',
  created_at: '', updated_at: '',
};

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, first_name: 'Bill', language: 'en' } }),
}));

vi.mock('../../hooks/useTimeClock', () => ({
  useWeeklyHoursStatus: () => ({ data: undefined }),
  useCurrentEntry: () => ({ data: clocked, isLoading: false }),
  useClockIn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClockOut: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetShift: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useStartBreak: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEndBreak: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFixForgotten: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../hooks/useRoutines', () => {
  const soon = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
  return {
    useMyRoutineRuns: () => ({
      isLoading: false,
      isError: false,
      data: {
        start_with_id: 9,
        open: [
          fakeRun({ id: 4, title: 'Day checklist', href: '/routines/run/4', due_at: soon(10), remind_at: soon(-10), nag_at: soon(10), late_at: soon(30) }),
          fakeRun({ id: 9, title: 'Open checklist', href: '/routines/run/9', due_at: soon(20), remind_at: soon(-10), nag_at: soon(20), late_at: soon(30) }),
        ],
        done: [],
        drafts: [],
        on_demand: [],
        idle_prompt_minutes: 20,
      },
    }),
  };
});

vi.mock('../routines/RoutineRunnerPage', () => ({
  RoutineRunnerPage: ({ runId }: { runId?: number }) => <div>Runner {runId}</div>,
}));

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={createTheme()}>
      <QueryClientProvider client={client}>
        <SnackbarProvider>
          <MemoryRouter initialEntries={['/dashboard?tab=routines']}>
            <RoutinesTab />
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('RoutinesTab (phone)', () => {
  it('lists today\'s routines and opens one in place, full screen (it ran on Today until #137)', async () => {
    const user = userEvent.setup();
    renderTab();
    expect(screen.getByText('Next up')).toBeInTheDocument();
    expect(screen.getByText('Open checklist')).toBeInTheDocument();
    await user.click(screen.getByText('Day checklist'));
    expect(screen.getByText('Runner 4')).toBeInTheDocument();
    expect(screen.queryByText('Open checklist')).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
