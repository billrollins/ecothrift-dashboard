import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { BuyingAuctionDetail } from '../../types/buying.types';
import AuctionOutcomeCard from './AuctionOutcomeCard';

const calls = vi.hoisted(() => ({ won: [] as unknown[] }));

vi.mock('../../api/buying.api', () => ({
  postBuyingAuctionWon: async (id: number, body: unknown) => {
    calls.won.push({ id, body });
    return { id, purchase_order_number: 'BST-LOT-1', won_note: '' };
  },
  postBuyingAuctionLost: async () => ({}),
}));

function renderCard(detail: Partial<BuyingAuctionDetail>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ThemeProvider theme={createTheme()}>
      <QueryClientProvider client={client}>
        <SnackbarProvider>
          <MemoryRouter>
            <AuctionOutcomeCard detail={{ id: 5, current_price: '900.00', manifest_row_count: 40, ...detail } as BuyingAuctionDetail} />
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('AuctionOutcomeCard', () => {
  it('records a win with the price (fees and shipping blank = the defaults)', async () => {
    const user = userEvent.setup();
    renderCard({});
    await user.click(screen.getByRole('button', { name: 'We won it' }));
    expect(screen.getByText(/40 manifest lines/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(calls.won).toEqual([{ id: 5, body: { hammer_price: '900.00', fees: undefined, shipping: undefined } }]);
    expect(await screen.findByText(/PO BST-LOT-1 is made with the manifest on it/)).toBeInTheDocument();
  });

  it('shows the report card once there is a PO', () => {
    renderCard({
      report_card: {
        purchase_order_id: 12,
        order_number: 'BST-LOT-1',
        po_status: 'processing',
        predicted: { revenue: '3000', profit: '1200', days_to_sell: 38, units: 87 },
        actual: {
          items: 80, sold: 40, on_shelf: 30, revenue: '1500.00', shelf_value: '900.00',
          profit_so_far: '200.00', avg_days_to_sell: 21, sell_through_pct: 50,
        },
        revenue_vs_predicted_pct: 50,
        cost: '1300.00',
      },
    });
    expect(screen.getByText('PO BST-LOT-1')).toBeInTheDocument();
    expect(screen.getByText('$3,000')).toBeInTheDocument();
    expect(screen.getByText('$1,500')).toBeInTheDocument();
    expect(screen.getByText('80 made · 40 sold (50%)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'We won it' })).not.toBeInTheDocument();
  });
});
