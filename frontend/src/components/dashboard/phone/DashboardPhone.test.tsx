import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardMetrics, DepartmentDailyMetric, SalesWeeklyRow } from '../../../types/pos.types';
import { DashboardPhone } from './DashboardPhone';

const auth = vi.hoisted(() => ({ user: { id: 1, role: 'Employee', is_superuser: false } }));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => auth,
}));

vi.mock('../useDashboardLayout', () => ({
  useDashboardLayout: () => ({ isMobile: true, isCompact: true }),
}));

const theme = createTheme();

function day(date: string, dow: string, extras: Partial<DepartmentDailyMetric> = {}): DepartmentDailyMetric {
  return {
    date,
    day: dow,
    buying: '120',
    processing: '80',
    restoration: 2,
    retail: 'B',
    is_future: false,
    ...extras,
  };
}

function salesWeek(label: string, start: string, extras: Partial<SalesWeeklyRow> = {}): SalesWeeklyRow {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const startDate = new Date(`${start}T00:00:00`);
  return {
    week_start: start,
    week_end: start,
    week_total: '1400',
    week_items_sold: 40,
    label,
    days: names.map((name, i) => {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      return { date: iso, day: name, revenue: '200', items_sold: 6 };
    }),
    ...extras,
  };
}

const metrics: DashboardMetrics = {
  sales: {
    today: '420',
    yesterday: '390',
    same_weekday_last_week: '400',
    today_returns: '-36',
    today_thriftplus_revenue: '17.5',
    goal: { id: 1, amount: '5000', description: '' },
    daily_last_90_days: [
      {
        date: '2026-09-03',
        day: 'Thursday',
        rolling_week_total: '2800',
        four_week_weekly_avg: '2600',
        week_start: '2026-08-31',
        is_week_start: false,
      },
    ],
    weekly_last_14_weeks: [
      salesWeek('This Week', '2026-08-31'),
      salesWeek('Last Week', '2026-08-24'),
      salesWeek('2 Weeks Ago', '2026-08-17'),
    ],
  },
  department_metrics: {
    buying: { week: '800', today: '120' },
    processing: { week: '600', today: '80' },
    restoration: {
      active_jobs: 3,
      awaiting_parts: 0,
      returns_pending: 0,
      week_jobs_done: 8,
      today_jobs_done: 1,
      week_tested: 0,
      week_repairs: 0,
      week_assembled: 0,
      week_salvaged: 0,
      today_tested: 0,
      today_repairs: 0,
      today_assembled: 0,
      today_salvaged: 0,
      ready: true,
    },
    retail: {
      ready: true,
      average_grade: 'B',
      last_grade: 'B',
      schedule: { weekdays: [0, 1, 2, 3, 4] },
      grade_goal: 'B',
      week_audits: 4,
      today_work_cycles: 1,
      week_work_cycles: 4,
      week_idle_dismissed: 0,
      week_required: 5,
      completed_days: 4,
      scheduled_days: 5,
      due_days: 4,
      due_goal_met: true,
      week_goal_met: false,
    },
    goals: { buying: { id: 1, department: 'buying', value: '5000', description: '' } },
    daily_weeks: [
      {
        label: 'This Week',
        is_current: true,
        week_start: '2026-08-31',
        week_end: '2026-09-06',
        days: [
          day('2026-08-31', 'Monday'),
          day('2026-09-01', 'Tuesday'),
          day('2026-09-02', 'Wednesday'),
          day('2026-09-03', 'Thursday'),
          day('2026-09-04', 'Friday', { is_future: true, buying: '0', processing: '0', restoration: 0, retail: null }),
          day('2026-09-05', 'Saturday', { is_future: true, buying: '0', processing: '0', restoration: 0, retail: null }),
          day('2026-09-06', 'Sunday', { is_future: true, buying: '0', processing: '0', restoration: 0, retail: null }),
        ],
      },
    ],
  },
};

function renderPhone() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <DashboardPhone metrics={metrics} />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('DashboardPhone', () => {
  it("shows today, the Sales card, then the department cards; Today's focus is gone", () => {
    auth.user = { id: 1, role: 'Employee', is_superuser: false };
    renderPhone();
    expect(screen.getByText("Today's sales")).toBeInTheDocument();
    expect(screen.getByText('$420')).toBeInTheDocument();
    expect(screen.getByText(/Last Thu \$400/)).toBeInTheDocument();
    expect(screen.getByText('+$20')).toBeInTheDocument();
    expect(screen.getByText('Returns -$36.00')).toBeInTheDocument();
    expect(screen.getByText('Thrift+ revenue $17.50')).toBeInTheDocument();
    expect(screen.queryByText("Today's focus")).not.toBeInTheDocument();
    // Sales first, then the departments (owner 2026-10-22).
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Sales', 'Departments']);
    expect(screen.getByRole('button', { name: 'Show past weeks: Sales' })).toBeInTheDocument();
    // Each card names its one number.
    expect(screen.getByText('Purchased inventory · this week')).toBeInTheDocument();
    expect(screen.getByText('Processed inventory, at our price · this week')).toBeInTheDocument();
    expect(screen.getByText('Count of items finished · this week')).toBeInTheDocument();
    expect(screen.getByText('Quality score · this week')).toBeInTheDocument();
  });

  it('staff see the goals and every Actual, like the owner', () => {
    auth.user = { id: 1, role: 'Employee', is_superuser: false };
    renderPhone();
    expect(screen.getByRole('button', { name: 'Buying goal $5,000' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actual $800: Buying details this week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actual B: Retail details this week' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: "Share of the week's goal" })).toHaveAttribute('aria-valuenow', '16');
  });

  it('the Sales card turns over to every week, this week first', async () => {
    auth.user = { id: 1, role: 'Admin', is_superuser: true };
    const user = userEvent.setup();
    renderPhone();
    await user.click(screen.getByRole('button', { name: 'Show past weeks: Sales' }));
    expect(screen.getByRole('button', { name: 'Show the trend: Sales' })).toHaveFocus();
    const weeks = screen.getAllByRole('button', { name: /Show its days$/ }).map((b) => b.getAttribute('aria-label'));
    expect(weeks[0]).toMatch(/^This Week/);
    expect(weeks).toHaveLength(3);
  });
});
