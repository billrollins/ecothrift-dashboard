import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { TimeEntry } from '../../types/hr.types';
import PayPage from './PayPage';

function setPhoneNav(phone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query.includes('max-width'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({
    rows,
    columns,
  }: {
    rows?: Array<Record<string, unknown>>;
    columns?: Array<{ field: string; renderCell?: (params: { row: Record<string, unknown> }) => unknown }>;
  }) => {
    const actions = columns?.find((col) => col.field === 'actions');
    return (
      <div data-testid="data-grid-stub">
        {(rows || []).map((row) => (
          <div key={String(row.id)}>{actions?.renderCell?.({ row }) as never}</div>
        ))}
      </div>
    );
  },
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, language: 'en', is_superuser: false, role: 'Employee' } }),
}));

vi.mock('../../hooks/useNavBadgeCounts', () => ({
  useNavBadgeCounts: () => ({ routines: 0 }),
}));

vi.mock('../../hooks/useTimeClock', () => ({
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
    },
  }),
  useMyPay: () => ({
    isLoading: false,
    data: [
      {
        date_from: '2026-08-31',
        date_to: '2026-09-13',
        label: 'Aug 31 - Sep 13, 2026',
        is_current: true,
        shift_count: 4,
        total_hours: '22.50',
        approved_hours: '16.00',
        pending_hours: '6.50',
        total_pay: '337.50',
      },
      {
        date_from: '2026-08-17',
        date_to: '2026-08-30',
        label: 'Aug 17 - Aug 30, 2026',
        is_current: false,
        shift_count: 10,
        total_hours: '80.00',
        approved_hours: '80.00',
        pending_hours: '0.00',
        total_pay: '1200.00',
      },
    ],
  }),
}));

const recent: TimeEntry = {
  id: 44,
  employee: 1,
  employee_name: 'Bill Tester',
  date: '2026-09-02',
  clock_in: '2026-09-02T13:02:00.000Z',
  clock_out: '2026-09-02T21:31:00.000Z',
  shift: 'retail_day',
  shift_label: 'Cashier - Day',
  shift_department: 'Retail',
  break_minutes: 30,
  on_break: false,
  break_started_at: null,
  total_hours: '8.00',
  status: 'pending',
  approved_by: null,
  approved_by_name: null,
  notes: '',
  created_at: '',
  updated_at: '',
};

vi.mock('../../hooks/useTimeEntries', () => ({
  useTimeEntries: () => ({
    isLoading: false,
    data: { results: [recent] },
  }),
}));

const theme = createTheme();

function renderPay() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <SnackbarProvider>
          <MemoryRouter>
            <PayPage />
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('PayPage', () => {
  it('shows this week, hides dollars, and opens a time change on a phone', async () => {
    setPhoneNav(true);
    const user = userEvent.setup();
    renderPay();
    expect(screen.getByText('22.50')).toBeInTheDocument();
    expect(screen.getByText('/ 40.00 h')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Show pay' }).length).toBeGreaterThan(1);
    expect(screen.getByText('80.00 h')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /time & payroll/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clock in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clock out/i })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Show pay' })[0]);
    expect(screen.getAllByRole('button', { name: 'Hide pay' }).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/\$/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /8\.00 h/i }));
    expect(screen.getByText('Request time change')).toBeInTheDocument();
  });

  it('shows three cards and the shifts grid on a desk, with no punch', async () => {
    setPhoneNav(false);
    const user = userEvent.setup();
    renderPay();
    expect(screen.getByRole('heading', { name: 'Pay' })).toBeInTheDocument();
    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.getByText('Current pay period')).toBeInTheDocument();
    expect(screen.getByText('Past periods')).toBeInTheDocument();
    expect(screen.getByText('Recent shifts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request change' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clock in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clock out/i })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Show pay' })[0]);
    expect(screen.getAllByRole('button', { name: 'Hide pay' }).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/\$/).length).toBeGreaterThan(0);
  });
});
