import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ReportCardsResponse } from '../../types/buying.types';
import ReportCardsPage from './ReportCardsPage';

const response: ReportCardsResponse = {
  results: [
    {
      auction_id: 7,
      title: 'Kitchen lot',
      marketplace: 'Target',
      ordered_date: '2026-05-01',
      age_days: 146,
      hammer_price: '1450.00',
      stage: 'judged',
      card: {
        purchase_order_id: 31,
        order_number: 'BST-LOT-77',
        po_status: 'complete',
        predicted: { revenue: '5000', profit: '2000', days_to_sell: 38, units: 87 },
        actual: {
          items: 80, sold: 60, on_shelf: 20, revenue: '4600.00', shelf_value: '700.00',
          profit_so_far: '2700.00', avg_days_to_sell: 41, sell_through_pct: 75,
        },
        revenue_vs_predicted_pct: 92,
        cost: '1900.00',
      },
    },
  ],
  calibration: { trucks: 1, median_ratio: 0.92, applied: null, min_trucks: 5, min_age_days: 90, min_sold_pct: 50 },
  last_90_days: { won: 2, lost: 5 },
};

vi.mock('../../api/buying.api', () => ({
  fetchBuyingReportCards: async () => response,
}));

describe('Report cards', () => {
  it('shows the valuation check and each won truck against its prediction', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider theme={createTheme()}>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <ReportCardsPage />
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByText('Actual is 92% of predicted')).toBeInTheDocument();
    expect(screen.getByText(/1 of 5 trucks needed/)).toBeInTheDocument();
    expect(screen.getByText('1.0×')).toBeInTheDocument();
    expect(screen.getByText('2 won · 5 lost')).toBeInTheDocument();
    expect(screen.getByText('Target · Kitchen lot')).toBeInTheDocument();
    expect(screen.getByText('BST-LOT-77')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('60 of 80 (75%)')).toBeInTheDocument();
  });
});
