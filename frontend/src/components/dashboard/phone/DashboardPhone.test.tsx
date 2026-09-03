import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardMetrics, DepartmentDailyMetric, SalesWeeklyRow } from '../../../types/pos.types';
import { DashboardPhone } from './DashboardPhone';

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'Employee', is_superuser: false },
  }),
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
      schedule: { weekdays: [0, 1, 2, 3, 4], audits_per_day: 1 },
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
    goals: {},
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
  it('renders the today hero, week book, and department cards', () => {
    renderPhone();
    expect(screen.getByText("Today's sales")).toBeInTheDocument();
    expect(screen.getByText('$420')).toBeInTheDocument();
    expect(screen.getByText(/Last Thu \$400/)).toBeInTheDocument();
    expect(screen.getByText('+$20')).toBeInTheDocument();
    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.getByText('Past weeks')).toBeInTheDocument();
    expect(screen.getByText('Buying')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Restoration')).toBeInTheDocument();
    expect(screen.getByText('Retail')).toBeInTheDocument();
  });
});
