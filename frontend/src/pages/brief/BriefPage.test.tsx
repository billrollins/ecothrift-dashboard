import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DailyBriefPayload } from '../../api/brief.api';
import BriefPage from './BriefPage';

const payload: DailyBriefPayload = {
  day: '2026-09-27',
  brief: {
    status: 'ready',
    body: {
      headline: 'Sales were flat; 2 lots to bid on today.',
      needs_you: ['Approve the brand aliases request.', 'Carrie is at 38.5 hours this week.'],
      numbers: ['$1,212 in sales, down $80 on last Sunday.'],
      watch: ['1,840 items have sat over 90 days.'],
    },
    model_used: 'claude-opus-5-5',
    error: '',
    finished_at: '2026-09-28T11:00:00Z',
  },
  writing: false,
  snapshot: { for_day: '2026-09-27', sales: { revenue: '1212.00', items_sold: 140 }, errors: {} },
  days: ['2026-09-27'],
};

vi.mock('../../api/brief.api', () => ({
  fetchDailyBrief: async () => payload,
  writeDailyBrief: async () => ({ ...payload, writing: true }),
}));

describe('Morning brief', () => {
  it('shows the headline, what needs you, the numbers and the snapshot behind them', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider theme={createTheme()}>
        <QueryClientProvider client={client}>
          <BriefPage />
        </QueryClientProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByText('Sales were flat; 2 lots to bid on today.')).toBeInTheDocument();
    expect(screen.getByText(/Carrie is at 38.5 hours/)).toBeInTheDocument();
    expect(screen.getByText(/down \$80 on last Sunday/)).toBeInTheDocument();
    expect(screen.getByText(/written by claude-opus-5-5/)).toBeInTheDocument();
    await user.click(screen.getByText('The numbers behind it'));
    expect(screen.getByText('1212.00', { exact: false })).toBeInTheDocument();
  });
});
