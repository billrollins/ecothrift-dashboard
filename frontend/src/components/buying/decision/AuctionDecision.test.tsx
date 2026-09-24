import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AuctionDecision, BuyingAuctionDetail } from '../../../types/buying.types';
import AuctionDecisionHeader from './AuctionDecisionHeader';
import AuctionKpiCards from './AuctionKpiCards';
import AuctionSideRail from './AuctionSideRail';

const patched = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock('../../../api/buying.api', () => ({
  patchBuyingAuctionBuyer: async (id: number, body: unknown) => {
    patched.calls.push({ id, body });
    return { max_bid: '1900.00', buyer_notes: '' };
  },
}));

const decision: AuctionDecision = {
  score: 92,
  verdict: 'Bid up to $2,050. Fills the kitchen & dining gap, 2 hazards to check, cash back in about 38 days. Similar lots closed near your max, so expect a fight.',
  bids: { max_bid: '2050.00', max_is_buyer: false, comfortable: '1600.00', model: '2050.00', stretch: '2300.00', room: '600.00' },
  need: {
    level: 'High', score: 78, category: 'Kitchen & dining', share_pct: 70,
    cover_weeks: '1.6', cover_after_weeks: '5.8', target_weeks: '4.0', note: 'This lot takes Kitchen & dining past its 4.0-week target.',
  },
  hazards: {
    count: 2,
    named: [
      { code: 'incomplete', label: 'Missing pieces', lines: 1, retail_pct: 6.3 },
      { code: 'fragile', label: 'Likely breakage', lines: 9, retail_pct: 5.1 },
    ],
    clean: ['No $0 lines', 'No lines too big to process'],
    known: true,
  },
  profit: { at_current: '1900.00', roi_pct: 83, at_max: '1210.00', low: '900.00', high: '2800.00', break_even_bid: '3100.00', per_pallet: '475.00' },
  time_to_sell: { days: 38, sell_through_30_pct: 45 },
  landed: {
    bid: '1450.00', fee: '72.50', freight: '420.00', labor: '0.00', disposal: '0.00', total: '1942.50',
    recovery: '3842.50', profit: '1900.00', fee_rate: '0.0500', recovery_pct_of_retail: 31, value_basis_pct: 40,
  },
  similar: {
    lots: [{ id: 3, title: 'Kitchen lot', category: 'Kitchen & dining', origin_city: 'Dallas, TX', pallets: 4, close: '1980.00', retail: '11000.00' }],
    likely_low: '1900.00', likely_high: '2150.00', days: 30,
  },
  seller: { name: 'Target', won_90_days: 12, lost_90_days: 4, trucks_judged: 5, actual_vs_predicted_pct: 6 },
  units: 87,
  retail: '12300.00',
};

const detail = {
  id: 7,
  title: 'Small Kitchen Appliances',
  url: '',
  marketplace: { id: 1, name: 'Target', slug: 'target', external_id: null },
  origin_city: 'Dallas, TX',
  condition_summary: 'Customer returns',
  lot_id: 'TGT-78432',
  pallet_count: 4,
  lot_size: 87,
  total_retail_value: '12300.00',
  manifest_row_count: 87,
  current_price: '1450.00',
  bid_count: 24,
  end_time: new Date(Date.now() + 2 * 3_600_000).toISOString(),
  archived_at: null,
  buyer_notes: '',
} as unknown as BuyingAuctionDetail;

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={createTheme()}>
      <QueryClientProvider client={client}>
        <SnackbarProvider>
          <MemoryRouter>{node}</MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('auction decision panel', () => {
  it('leads with the verdict, the bid and your max; a tier fills the max', async () => {
    const user = userEvent.setup();
    wrap(
      <AuctionDecisionHeader
        detail={detail}
        decision={decision}
        watched={false}
        watchlistBusy={false}
        onToggleWatchlist={vi.fn()}
        onRefresh={vi.fn()}
        refreshing={false}
        onPass={vi.fn()}
        passing={false}
      />,
    );
    expect(screen.getByText('Bid up to $2,050.')).toBeInTheDocument();
    expect(screen.getByText('$1,450')).toBeInTheDocument();
    expect(screen.getByText('24 bids')).toBeInTheDocument();
    expect(screen.getByLabelText('Score 92')).toBeInTheDocument();
    await user.click(screen.getByText('Comfortable'));
    await user.click(screen.getByRole('button', { name: 'Set max' }));
    expect(patched.calls).toContainEqual({ id: 7, body: { max_bid: '1600' } });
  });

  it("goes back to the model's max by clearing yours", async () => {
    const user = userEvent.setup();
    wrap(
      <AuctionDecisionHeader
        detail={detail}
        decision={{ ...decision, bids: { ...decision.bids, max_bid: '1800.00', max_is_buyer: true } }}
        watched={false}
        watchlistBusy={false}
        onToggleWatchlist={vi.fn()}
        onRefresh={vi.fn()}
        refreshing={false}
        onPass={vi.fn()}
        passing={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: "Use the model's" }));
    expect(patched.calls).toContainEqual({ id: 7, body: { max_bid: '' } });
  });

  it('shows need, hazards, profit and time to sell', () => {
    wrap(<AuctionKpiCards decision={decision} />);
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText(/after this lot 5.8 wk/)).toBeInTheDocument();
    expect(screen.getByText('2 flags')).toBeInTheDocument();
    expect(screen.getByText('Missing parts')).toBeInTheDocument();
    expect(screen.getByText('No $0 lines')).toBeInTheDocument();
    expect(screen.getByText('$1,900')).toBeInTheDocument();
    expect(screen.getByText('Break-even bid')).toBeInTheDocument();
    expect(screen.getByText('~38 days')).toBeInTheDocument();
  });

  it('breaks down the landed cost and shows similar lots and the seller', () => {
    wrap(<AuctionSideRail detail={detail} decision={decision} />);
    expect(screen.getByText('Total landed')).toBeInTheDocument();
    expect(screen.getByText('$1,943')).toBeInTheDocument();
    expect(screen.getByText(/Likely close: \$1,900 to \$2,150/)).toBeInTheDocument();
    expect(screen.getByText('+6%')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('What should future-you know about this lot?')).toBeInTheDocument();
  });

  it('works out landed cost and profit at any bid', async () => {
    const user = userEvent.setup();
    wrap(<AuctionSideRail detail={detail} decision={decision} />);
    await user.type(screen.getByLabelText('What if I win at'), '2000');
    // 2,000 + 5% fee + 420 fixed freight = 2,520; 3,842.50 back = 52%.
    expect(screen.getByText(/Landed \$2,520/)).toBeInTheDocument();
    expect(screen.getByText(/\(52%\)/)).toBeInTheDocument();
  });
});
