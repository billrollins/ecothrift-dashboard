import { ThemeProvider, createTheme } from '@mui/material/styles';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SalesDailyMetric, SalesMetrics } from '../../types/pos.types';
import { SalesOverviewSection } from './SalesOverviewSection';
import { salesAxisDollars } from './SalesTrendChart';

vi.mock('./useDashboardLayout', () => ({
  useDashboardLayout: () => ({ isMobile: false, isCompact: false }),
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { language: 'en', permissions: [] } }),
}));
vi.mock('./SalesGoalDialog', () => ({ SalesGoalDialog: () => null }));
vi.mock('./SalesTrendChart', async (orig) => ({
  ...(await orig<typeof import('./SalesTrendChart')>()),
  SalesTrendChart: () => <div data-testid="chart-stub" />,
}));

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** `count` days ending Thu 2026-11-05, rolling total `rolling` on the last day. */
function history(count: number, rolling: string): SalesDailyMetric[] {
  const end = Date.UTC(2026, 10, 5);
  return Array.from({ length: count }, (_, i) => {
    const t = end - (count - 1 - i) * 86400000;
    const d = new Date(t);
    const day = DAYS[(d.getUTCDay() + 6) % 7];
    return {
      date: d.toISOString().slice(0, 10),
      day,
      rolling_week_total: i === count - 1 ? rolling : '10000',
      four_week_weekly_avg: '11000',
      week_start: d.toISOString().slice(0, 10),
      is_week_start: day === 'Monday',
    };
  });
}

function sales(rolling: string, days = 140): SalesMetrics {
  return {
    today: '812.40',
    yesterday: '0',
    same_weekday_last_week: '1355',
    today_returns: '-12.00',
    today_thriftplus_revenue: '30.00',
    goal: { id: 1, amount: '15000', description: '' },
    daily_last_90_days: [],
    daily_history: history(days, rolling),
    last_week_to_date: '4188',
    weekly_last_14_weeks: [{ week_start: '2026-11-02', week_end: '2026-11-08', week_total: '5328', label: 'This Week' } as never],
  };
}

function renderCard(data: SalesMetrics) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <SalesOverviewSection sales={data} />
    </ThemeProvider>,
  );
}

describe('SalesOverviewSection (desktop)', () => {
  it('shows today big with last Thursday, then the week, then rolling 7 and the goal', () => {
    renderCard(sales('17109'));
    const today = screen.getByTestId('sales-today');
    expect(within(today).getByText('Today · Thu')).toBeInTheDocument();
    expect(within(today).getByText('$812')).toBeInTheDocument();
    const extras = screen.getByTestId('sales-sub-lines');
    expect(within(extras).getByText('−$12')).toBeInTheDocument();
    expect(within(extras).getByText('$30')).toBeInTheDocument();
    expect(today).toHaveTextContent('Last Thu $1,355');
    const week = screen.getByTestId('sales-this-week');
    expect(week).toHaveTextContent('This week');
    expect(week).toHaveTextContent('$5,328');
    expect(week).toHaveTextContent('Last wk to date $4,188');
    expect(within(screen.getByTestId('sales-rolling-7')).getByText('$17,109')).toBeInTheDocument();
    expect(within(screen.getByTestId('sales-weekly-goal')).getByText('$15,000')).toBeInTheDocument();
  });

  it.each([
    ['15000', 'over'],
    ['17109', 'over'],
    ['12000', 'near'],
    ['11999', 'under'],
  ])('rolling 7 of %s against a $15,000 goal is %s', (rolling, tone) => {
    renderCard(sales(rolling));
    expect(screen.getByTestId('sales-rolling-7')).toHaveAttribute('data-tone', tone);
  });

  it('keeps the percent of goal inside the rolling box, for the hover', () => {
    renderCard(sales('17109'));
    const box = screen.getByTestId('sales-rolling-7');
    expect(within(box).getByTestId('sales-rolling-7-hover')).toHaveTextContent('114%of goal');
    expect(box).toHaveAttribute('aria-label', 'Rolling 7 days $17,109, 114% of goal');
  });

  it('scrolls back with the arrow and the wheel, and Now returns', () => {
    renderCard(sales('17109'));
    const controls = screen.getByTestId('sales-trend-controls');
    const range = () => within(controls).getByText(/–/).textContent;
    const start = range();
    expect(within(controls).queryByText('Now')).toBeNull();
    fireEvent.click(screen.getByLabelText('Earlier weeks'));
    expect(range()).not.toBe(start);
    fireEvent.click(within(controls).getByText('Now'));
    expect(range()).toBe(start);
    fireEvent.wheel(screen.getByTestId('sales-trend-chart'), { deltaY: -100 });
    expect(range()).not.toBe(start);
    expect(within(controls).getByText('Now')).toBeInTheDocument();
  });

  it('zooms out to 36 weeks', () => {
    renderCard(sales('17109', 300));
    const controls = screen.getByTestId('sales-trend-controls');
    const twelve = within(controls).getByText(/–/).textContent;
    fireEvent.click(screen.getByText('36 wk'));
    expect(within(controls).getByText(/–/).textContent).not.toBe(twelve);
  });
});

describe('salesAxisDollars', () => {
  it('labels the $5K gridlines', () => {
    expect(salesAxisDollars(0)).toBe('$0');
    expect(salesAxisDollars(5000)).toBe('$5K');
    expect(salesAxisDollars(20000)).toBe('$20K');
  });
});
