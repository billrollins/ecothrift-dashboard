import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardMetrics, DepartmentDailyMetric } from '../types/pos.types';
import DashboardPage from './DashboardPage';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 2, role: 'Employee', is_superuser: false, language: 'en' } }),
}));
vi.mock('../components/layout/FloorNav', () => ({ FloorNav: () => null }));
vi.mock('../components/dashboard/useDashboardLayout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/dashboard/useDashboardLayout')>()),
  useDashboardLayout: () => ({ isMobile: false, isCompact: false }),
}));

function day(date: string, dow: string, isFuture = false): DepartmentDailyMetric {
  return { date, day: dow, buying: '100', processing: '80', restoration: 1, retail: 'B', is_future: isFuture };
}

const metrics: DashboardMetrics = {
  sales: {
    today: '420',
    yesterday: '390',
    same_weekday_last_week: '400',
    today_returns: '0',
    today_thriftplus_revenue: '0',
    goal: null,
    daily_last_90_days: [
      { date: '2026-10-22', day: 'Thursday', rolling_week_total: '2800', four_week_weekly_avg: '2600', week_start: '2026-10-18', is_week_start: false },
    ],
    weekly_last_14_weeks: [
      {
        week_start: '2026-10-19',
        week_end: '2026-10-25',
        week_total: '1400',
        week_items_sold: 9,
        label: 'This Week',
        days: [{ date: '2026-10-22', day: 'Thursday', revenue: '420', items_sold: 9 }],
      },
    ],
  },
  department_metrics: {
    week_start: '2026-10-19',
    buying: { week: '400', today: '100' },
    processing: { week: '320', today: '80' },
    restoration: {
      active_jobs: 1, awaiting_parts: 0, returns_pending: 0, week_jobs_done: 4, today_jobs_done: 1,
      week_tested: 0, week_repairs: 0, week_assembled: 0, week_salvaged: 0,
      today_tested: 0, today_repairs: 0, today_assembled: 0, today_salvaged: 0, ready: true,
    },
    retail: {
      ready: true, average_grade: 'B', last_grade: 'B', schedule: { weekdays: [] }, grade_goal: 'B', week_audits: 0,
      today_work_cycles: 0, week_work_cycles: 0, week_idle_dismissed: 0, week_required: 0, completed_days: 0,
      scheduled_days: 0, due_days: 0, due_goal_met: false, week_goal_met: false,
    },
    goals: {},
    daily_weeks: [
      {
        label: 'This Week',
        is_current: true,
        week_start: '2026-10-19',
        week_end: '2026-10-25',
        days: [
          day('2026-10-19', 'Monday'), day('2026-10-20', 'Tuesday'), day('2026-10-21', 'Wednesday'),
          day('2026-10-22', 'Thursday'), day('2026-10-23', 'Friday', true), day('2026-10-24', 'Saturday', true),
          day('2026-10-25', 'Sunday', true),
        ],
      },
    ],
  },
};

vi.mock('../hooks/useDashboard', () => ({
  useDashboardMetrics: () => ({ data: metrics, isLoading: false, error: null }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('DashboardPage (desk)', () => {
  it('is one screen: Sales first, then the four department cards in one grid; no Today\'s focus', () => {
    renderPage();
    expect(screen.queryByText("Today's focus")).not.toBeInTheDocument();
    const sections = screen.getAllByRole('region');
    expect(sections.map((s) => s.getAttribute('aria-label'))).toEqual(['Sales', 'Departments']);

    const grid = screen.getByTestId('department-grid');
    const cards = within(grid).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(cards).toEqual(['Buying', 'Processing', 'Restoration', 'Retail']);
  });

  it('the Sales card and every department card turn over from a labelled corner button', () => {
    renderPage();
    for (const name of ['Sales', 'Buying', 'Processing', 'Restoration', 'Retail']) {
      expect(screen.getByRole('button', { name: `Show past weeks: ${name}` })).toBeInTheDocument();
    }
  });
});
