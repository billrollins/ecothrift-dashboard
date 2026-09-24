import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { WishlistAuction } from '../../types/buying.types';
import WishListPage from './WishListPage';

const fetched = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));

const row: WishlistAuction = {
  id: 7,
  title: 'Target housewares 12 pallets',
  marketplace: 'Target',
  url: '',
  top_category: 'Kitchen & dining',
  origin_city: 'Dallas, TX',
  total_retail_value: '12300.00',
  lot_size: 87,
  end_time: new Date(Date.now() + 3 * 3_600_000).toISOString(),
  current_price: '1450.00',
  bid_count: 9,
  price_target: '2050.00',
  max_bid: '2050.00',
  max_is_buyer: false,
  room: '600.00',
  expected_close: '1800.00',
  state: 'in_range',
  priority: 92,
  need_score: 72,
  need_level: 'High',
  est_profit: '1900.00',
  profit_low: '900',
  profit_high: '2800',
  profitability_ratio: '0.8300',
  estimated_revenue: '5000.00',
  estimated_total_cost: '2200.00',
  pallet_count: 4,
  condition_summary: 'Customer returns',
  days_to_sell: 38,
  has_analysis: true,
  matched_retail_pct: 36.5,
  hazards: [{ code: 'fragile', lines: 14, retail_pct: 7.5 }],
  hazard_count: 1,
  why: 'Need 72 (Kitchen 40%), profit 83%, sells fast',
  why_not: ['7.5% of retail is breakable'],
  watched: true,
};

vi.mock('../../api/buying.api', () => ({
  fetchBuyingWishlist: async (options: Record<string, unknown>) => {
    fetched.calls.push(options);
    const results = options.includeOver
      ? [row, { ...row, id: 8, marketplace: 'Walmart', state: 'over', current_price: '2600.00', room: '-550.00' }]
      : [row];
    return {
      results,
      eligible: results.length,
      live_total: 247,
      report_cards: { trucks: 0, median_ratio: null },
      strip: {
        won_today: 1,
        won_unpaid: { lots: 2, total: '2200.00' },
        on_order: { units: 1600, retail: '20000.00' },
        in_building: { units: 290, retail: '9800.00', oldest_days: 23 },
      },
    };
  },
  fetchBuyingCategoryNeed: async () => ({ categories: [] }),
  buyingWatchlistQueryKey: (params: unknown) => ['buying', 'watchlist', params],
  fetchBuyingWatchlist: async () => ({
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        id: 21, title: 'Costco appliances', marketplace: { id: 2, name: 'Costco', slug: 'costco', external_id: null },
        end_time: new Date(Date.now() + 90 * 60_000).toISOString(), current_price: '2600.00', max_bid: '2500.00', price_target: '2200.00',
      },
      {
        id: 22, title: 'Ended lot', marketplace: { id: 2, name: 'Costco', slug: 'costco', external_id: null },
        end_time: new Date(Date.now() - 60_000).toISOString(), current_price: '100.00', max_bid: null, price_target: '500.00',
      },
    ],
  }),
  postBuyingWatchlist: async () => ({}),
  deleteBuyingWatchlist: async () => undefined,
  postBuyingAuctionArchive: async () => ({}),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={createTheme()}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <WishListPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe("Today's best", () => {
  it('shows the strip, how many pass, and each lot with its max, room, need and reasons', async () => {
    renderPage();
    expect(await screen.findByText('Target · Kitchen & dining')).toBeInTheDocument();
    expect(screen.getByText(/1 of 247 live auctions pass/)).toBeInTheDocument();
    expect(screen.getByText('Won, not paid')).toBeInTheDocument();
    expect(screen.getByText('$2,200')).toBeInTheDocument();
    expect(screen.getByText('$600 room')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Fragile · 7.5%')).toBeInTheDocument();
    expect(screen.getByText('Need 72 (Kitchen 40%), profit 83%, sells fast')).toBeInTheDocument();
    expect(screen.getByText('7.5% of retail is breakable')).toBeInTheDocument();
    // Today's plan: the goal is 1 or 2 a day; this one ends within a day and is under its max.
    expect(screen.getByText('Bid on this one')).toBeInTheDocument();
    expect(screen.getByText('Won today: 1 of 1 to 2')).toBeInTheDocument();
    expect(screen.getByText(/^1\. Target, ends/)).toBeInTheDocument();
    // The shortlist: live watched lots only, with the buyer's max (over it here).
    expect(await screen.findByText('Your shortlist')).toBeInTheDocument();
    expect(await screen.findByText('Costco · Costco appliances')).toBeInTheDocument();
    expect(screen.getByText('$2,600 / $2,500')).toBeInTheDocument();
    expect(screen.queryByText('Costco · Ended lot')).not.toBeInTheDocument();
  });

  it('ranks by profit and adds the ones over max on request', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Target · Kitchen & dining');
    await user.click(screen.getByRole('button', { name: 'Profit' }));
    await user.click(screen.getByRole('switch', { name: 'Show ones over max' }));
    expect(await screen.findByText('$550 over max')).toBeInTheDocument();
    expect(fetched.calls).toContainEqual({ includeOver: true, rank: 'profit', category: '' });
  });
});
