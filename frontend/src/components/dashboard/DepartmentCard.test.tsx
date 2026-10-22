import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DepartmentDailyMetric, DepartmentDailyWeek } from '../../types/pos.types';
import { DepartmentCard } from './DepartmentCard';
import {
  buyingGridValue,
  buyingWeekTotal,
  departmentCellAriaLabel,
  departmentDayIsClickable,
} from './DepartmentCardGrid';

vi.mock('./useDashboardLayout', () => ({
  useDashboardLayout: () => ({ isMobile: false, isCompact: false }),
}));

function day(date: string, buying: string, extras: Partial<DepartmentDailyMetric> = {}): DepartmentDailyMetric {
  return { date, day: 'Monday', buying, processing: '0', restoration: 0, retail: null, is_future: false, ...extras };
}

function week(start: string, values: string[], current = false): DepartmentDailyWeek {
  const [y, m, d] = start.split('-').map(Number);
  const days = values.map((value, i) => {
    const date = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    return value === 'future' ? day(date, '0', { is_future: true }) : day(date, value);
  });
  return { label: current ? 'This Week' : start, is_current: current, week_start: start, week_end: days[6].date, days };
}

const lastWeek = week('2026-10-12', ['100', '0', '250', '0', '0', '0', '0']);
const thisWeek = week('2026-10-19', ['40', '60', '0', '0', 'future', 'future', 'future'], true);

function renderCard(handlers: { onActualClick?: () => void; onCellClick?: (d: DepartmentDailyMetric) => void; onWeekClick?: (w: DepartmentDailyWeek) => void } = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <DepartmentCard
        label="Buying"
        metricLabel="Purchased inventory"
        accent="#13776f"
        icon={<span />}
        goalDisplay="$500"
        actualDisplay="$100"
        progress={0.2}
        onGoalClick={() => undefined}
        onActualClick={handlers.onActualClick ?? (() => undefined)}
        weeks={[lastWeek, thisWeek]}
        currentWeek={thisWeek}
        getValue={buyingGridValue}
        getWeekTotal={buyingWeekTotal}
        todayIso="2026-10-22"
        onCellClick={handlers.onCellClick ?? (() => undefined)}
        isCellClickable={departmentDayIsClickable}
        cellAriaLabel={departmentCellAriaLabel('Purchased inventory')}
        onWeekClick={handlers.onWeekClick ?? (() => undefined)}
      />
    </ThemeProvider>,
  );
}

describe('DepartmentCard flip', () => {
  it('has a labelled corner button that turns the card to past weeks and back, focus following', async () => {
    const user = userEvent.setup();
    renderCard();
    // The back is hidden until asked for: no past-week cells, no back button.
    expect(screen.queryByRole('button', { name: /Week of 10\/12/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show this week: Buying' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show past weeks: Buying' }));
    const back = screen.getByRole('button', { name: 'Show this week: Buying' });
    expect(back).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Week of 10/12: $350. Open details' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show past weeks: Buying' })).not.toBeInTheDocument();
    // The side you cannot see takes no focus.
    expect(back.closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'false');

    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Show past weeks: Buying' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Week of 10\/12/ })).not.toBeInTheDocument();
  });

  it('is keyboard friendly: Tab reaches the flip button and Space turns it', async () => {
    const user = userEvent.setup();
    renderCard();
    const flip = screen.getByRole('button', { name: 'Show past weeks: Buying' });
    flip.focus();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Show this week: Buying' })).toHaveFocus();
  });

  it('shows the metric name, the goal bar, and this week on the front', () => {
    renderCard();
    expect(screen.getByText('Purchased inventory · this week')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', '20% of goal');
    expect(screen.getByRole('button', { name: '10/19: Purchased inventory $40. Open details' })).toBeInTheDocument();
    // Future days are not buttons.
    expect(screen.queryByRole('button', { name: /^10\/23/ })).not.toBeInTheDocument();
  });
});

describe('DepartmentCard details taps', () => {
  it('the Actual, a day and a past week total each ask for their details', async () => {
    const user = userEvent.setup();
    const onActualClick = vi.fn();
    const onCellClick = vi.fn();
    const onWeekClick = vi.fn();
    renderCard({ onActualClick, onCellClick, onWeekClick });

    await user.click(screen.getByRole('button', { name: 'Actual $100: Buying details this week' }));
    expect(onActualClick).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '10/20: Purchased inventory $60. Open details' }));
    expect(onCellClick).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-10-20' }));

    await user.click(screen.getByRole('button', { name: 'Show past weeks: Buying' }));
    await user.click(screen.getByRole('button', { name: 'Week of 10/12: $350. Open details' }));
    expect(onWeekClick).toHaveBeenCalledWith(expect.objectContaining({ week_start: '2026-10-12' }));
  });
});
