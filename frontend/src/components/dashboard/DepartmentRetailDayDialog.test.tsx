import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { RetailDaySummary } from '../../api/routines.api';
import {
  DepartmentRetailDayDialog,
  contributionSegments,
  crossPastDueDetail,
  crossPendingLabel,
  formatCardWeight,
  formatGradeScale,
  goalThreshold,
  letterTileTone,
  scoredContributionTotal,
  spotDetailLine,
} from './DepartmentRetailDayDialog';

const theme = createTheme();

function renderDialog(data: RetailDaySummary, mode: 'day' | 'week' = 'day') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <DepartmentRetailDayDialog
            open
            onClose={() => undefined}
            mode={mode}
            date={data.date}
            week={data.week}
            data={data}
          />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const scale = { a: 91, b: 81, c: 71, d: 61 };

const mixedDay: RetailDaySummary = {
  date: '2026-09-15',
  open: true,
  letter: 'B',
  score: 84.8,
  goal_letter: 'B',
  goal_met: true,
  grade_scale: scale,
  weights: { spot: 70.59, do: 29.41 },
  excluded: [],
  do: {
    score: 70,
    section_checks: { done: 3, expected: 5 },
    open_day_close: { done: 1, expected: 3 },
  },
  spot: { score: 91, walks: { done: 1, min_for_week: 3 }, state: 'done' },
  cross: {
    score: null,
    done: 0,
    due: 5,
    due_date: '2026-09-15',
    state: 'pending',
  },
  cross_info: {
    done: 0,
    due: 5,
    due_date: '2026-09-15',
    state: 'pending',
    done_on_this_day: 0,
  },
};

describe('DepartmentRetailDayDialog', () => {
  it('tints an F tile red, never amber', () => {
    expect(letterTileTone('F')).toBe('red');
    expect(letterTileTone('D')).toBe('amber');
    expect(letterTileTone('C')).toBe('amber');
    renderDialog({ ...mixedDay, letter: 'F', score: 40 });
    expect(screen.getByTestId('retail-letter-tile')).toHaveAttribute('data-tone', 'red');
  });

  it('shows No walk that day on a past day with no walk', () => {
    renderDialog({
      ...mixedDay,
      spot: { score: null, walks: { done: 0, min_for_week: 3 }, state: 'none' },
    });
    expect(screen.getByText('No walk that day')).toBeInTheDocument();
    expect(screen.queryByText('No walk yet')).not.toBeInTheDocument();
  });

  it('shows No walk yet when today has no walk', () => {
    renderDialog({
      ...mixedDay,
      spot: { score: null, walks: { done: 0, min_for_week: 3 }, state: 'not_yet' },
    });
    expect(screen.getByText('No walk yet')).toBeInTheDocument();
    expect(screen.queryByText('No walk that day')).not.toBeInTheDocument();
  });

  it('keeps a pending Cross card grey and names the due date', () => {
    expect(crossPendingLabel('2026-09-15')).toBe('Pending until Tue Sep 15');
    renderDialog(mixedDay);
    expect(screen.getByTestId('retail-cross-card')).toHaveAttribute('data-tone', 'grey');
    expect(screen.getByText('Pending until Tue Sep 15')).toBeInTheDocument();
    expect(screen.getByTestId('retail-spot-card')).toHaveAttribute('data-tone', 'green');
    expect(screen.getByTestId('retail-do-card')).toHaveAttribute('data-tone', 'amber');
  });

  it('sizes day contribution segments so scored points sum to the score', () => {
    const segments = contributionSegments(
      mixedDay,
      goalThreshold(mixedDay.goal_letter, mixedDay.grade_scale),
      'day',
    );
    expect(segments.map((row) => row.key)).toEqual(['spot', 'do']);
    expect(scoredContributionTotal(segments)).toBeCloseTo(91 * 0.7059 + 70 * 0.2941, 1);
    expect(Math.round(scoredContributionTotal(segments) * 10) / 10).toBe(mixedDay.score);
    renderDialog(mixedDay);
    expect(screen.getByTestId('retail-contribution-bar')).toBeInTheDocument();
    expect(screen.getByTestId('retail-contribution-bar').querySelector('[data-segment="cross"]'))
      .toBeNull();
    expect(screen.getByTestId('retail-cross-card')).toHaveAttribute('data-weight', '');
    expect(screen.getByText('Cross · this week')).toBeInTheDocument();
    expect(screen.queryByText(/Cross · \d/)).not.toBeInTheDocument();
  });

  it('drops Spot from the day bar when there was no walk', () => {
    const noWalk: RetailDaySummary = {
      ...mixedDay,
      score: 80,
      weights: { spot: 0, do: 100 },
      excluded: ['spot'],
      spot: { score: null, walks: { done: 0, min_for_week: 3 }, state: 'none' },
      do: {
        score: 80,
        section_checks: { done: 4, expected: 5 },
        open_day_close: { done: 3, expected: 3 },
      },
    };
    const segments = contributionSegments(noWalk, 81, 'day');
    expect(segments.map((row) => row.key)).toEqual(['do']);
    expect(scoredContributionTotal(segments)).toBeCloseTo(80);
    renderDialog(noWalk);
    expect(screen.getByText('Spot not counted · no walk that day')).toBeInTheDocument();
    expect(formatCardWeight('Spot', 0, true)).toBe('Spot —');
  });

  it('reads footer scale text from the payload, not a constant', () => {
    expect(formatGradeScale(scale)).toBe('A 91 · B 81 · C 71 · D 61 · F below 61');
    renderDialog(mixedDay);
    expect(screen.getByTestId('retail-grade-scale')).toHaveTextContent(
      'A 91 · B 81 · C 71 · D 61 · F below 61',
    );
    expect(screen.getByTestId('retail-grade-scale')).not.toHaveTextContent('A 90 · B 80');
  });

  it('shows Store closed and nothing else on a closed day', () => {
    renderDialog({
      date: '2026-08-31',
      open: false,
      letter: null,
      score: null,
      goal_letter: 'B',
      goal_met: false,
      grade_scale: scale,
      do: null,
      spot: null,
      cross: null,
    });
    expect(screen.getByText('Store closed')).toBeInTheDocument();
    expect(screen.queryByTestId('retail-spot-card')).not.toBeInTheDocument();
    expect(screen.queryByText(/Goal/)).not.toBeInTheDocument();
  });

  it('renders week totals on the same cards', () => {
    const weekData: RetailDaySummary = {
      week: '2026-W38',
      open: true,
      letter: 'A',
      score: 95,
      goal_letter: 'B',
      goal_met: true,
      grade_scale: scale,
      weights: { spot: 60, do: 25, cross: 15 },
      excluded: [],
      do: {
        score: 90,
        section_checks: { done: 18, expected: 40 },
        open_day_close: { done: 9, expected: 15 },
      },
      spot: { score: 88, walks: { done: 3, min_for_week: 3 }, state: 'done' },
      cross: {
        score: 100,
        done: 5,
        due: 5,
        due_date: '2026-09-15',
        state: 'live',
      },
    };
    const segments = contributionSegments(weekData, 81, 'week');
    expect(segments).toHaveLength(3);
    renderDialog(weekData, 'week');
    expect(screen.getByText('Sep 14 to Sep 20, 2026')).toBeInTheDocument();
    expect(screen.getByText('Goal B · met')).toBeInTheDocument();
    expect(spotDetailLine({ score: 88, walks: { done: 3, min_for_week: 3 }, state: 'done' }, 'week'))
      .toBe('3 walks · avg 88');
    expect(screen.getByText('3 walks · avg 88')).toBeInTheDocument();
    expect(screen.getByText(/18 of 40 section checks/)).toBeInTheDocument();
    expect(screen.getByText(/9 of 15 open\/day\/close/)).toBeInTheDocument();
    expect(screen.getByTestId('retail-letter-tile')).toHaveTextContent('A');
  });

  it('hatches pending Cross at 15 on the week bar', () => {
    const weekPending: RetailDaySummary = {
      week: '2026-W38',
      open: true,
      letter: 'B',
      score: 84.8,
      goal_letter: 'B',
      goal_met: true,
      grade_scale: scale,
      weights: { spot: 70.59, do: 29.41, cross: 0 },
      excluded: ['cross'],
      do: {
        score: 70,
        section_checks: { done: 18, expected: 40 },
        open_day_close: { done: 9, expected: 15 },
      },
      spot: { score: 91, walks: { done: 3, min_for_week: 3 }, state: 'done' },
      cross: {
        score: null,
        done: 0,
        due: 5,
        due_date: '2026-09-15',
        state: 'pending',
      },
    };
    const segments = contributionSegments(weekPending, 81, 'week');
    expect(segments).toHaveLength(3);
    expect(segments.find((row) => row.key === 'cross')).toMatchObject({
      pending: true,
      points: 15,
    });
  });

  it('tints week Cross red once past due and incomplete', () => {
    expect(crossPastDueDetail({
      score: 40,
      done: 2,
      due: 5,
      due_date: '2026-09-15',
      state: 'live',
    })).toBe('2 of 5 done · 3 not done');
    renderDialog(
      {
        week: '2026-W38',
        open: true,
        letter: 'C',
        score: 70,
        goal_letter: 'B',
        goal_met: false,
        grade_scale: scale,
        weights: { spot: 60, do: 25, cross: 15 },
        excluded: [],
        do: {
          score: 90,
          section_checks: { done: 18, expected: 40 },
          open_day_close: { done: 9, expected: 15 },
        },
        spot: { score: 88, walks: { done: 3, min_for_week: 3 }, state: 'done' },
        cross: {
          score: 40,
          done: 2,
          due: 5,
          due_date: '2026-09-15',
          state: 'live',
        },
      },
      'week',
    );
    expect(screen.getByTestId('retail-cross-card')).toHaveAttribute('data-tone', 'red');
    expect(screen.getByText('2 of 5 done · 3 not done')).toBeInTheDocument();
  });
});
