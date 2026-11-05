import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstimateResponse, EstimateResult } from '../../types/buying.types';
import EstimateProfitPage from './EstimateProfitPage';

// PO 318 run through the ship 1 rules (design A2): likely 26,539, band 22,574 to 29,878.
const po318: EstimateResult = {
  supported: true,
  seller: 'Target',
  lot: {
    id: 9, title: 'Bikes and fitness, 26 pallets', url: 'https://bstock.com/buy/listings/details/aa11', marketplace: 'Target',
    status: 'open', listing_type: 'SPOT', end_time: '2099-04-21T14:00:00Z', current_price: 12000, bid_count: 14,
    pallet_count: 26, has_manifest: true, last_updated_at: null,
  },
  method: 'manifest',
  manifest_source: 'your CSV',
  retail: { used: 66395, source: 'manifest', manifest: 66395, bstock: 66000 },
  brings_in: { low: 22574, likely: 26539, high: 29878 },
  brings_in_pct: { low: 0.34, likely: 0.3997, high: 0.45 },
  price: 12000,
  price_basis: 'price seen on B-Stock',
  fee_rate: 0.05,
  fee: 600,
  freight: { used: 2500, basis: 'typed', reason: '', formula: { amount: 2700, low: 2025, high: 3375, mode: 'truckload', pallets: 26, miles: 620, city: 'Indianapolis, IN' } },
  landed: 15100,
  landed_pct: 0.2274,
  profit: { low: 7474, likely: 11439, high: 14778 },
  multiple: { low: 1.49, likely: 1.76, high: 1.98 },
  bid_up_to: [
    { landed_pct: 0.2, landed: 13279, bid: 10265.71, freight_included: true },
    { landed_pct: 0.23, landed: 15270.85, bid: 12162.71, freight_included: true },
  ],
  tags: ['sold items only'],
  notes: [],
  retail_doubt: false,
  close_date: '2026-04-21',
  close_basis: 'lot end time',
  lead_days: 21,
  shelf_date: '2026-05-12',
  whole_truck_rates: [0.35, 0.5, 0.65],
  seller_slug: 'target',
  seller_average: 0.5,
  seller_sold_items: 6650,
  fill_in_share: 0,
  missing_pieces_share: 0,
  missing_pieces_effect: 0,
  seasons: [],
  categories: [
    {
      seller_category: 'BICYCLES-PHYSICAL FITNESS', retail: 66395, units: 410, share: 1, likely: 26539, missing_pieces_retail: 0,
      basis: 'sold', evidence: '1,232 sold, $50,105 retail', rates: [0.34, 0.4, 0.45], rule: 'category',
    },
  ],
  lines: 412,
  miss_line: 'Tested on 8 Target trucks without each truck\'s own results: median miss 4.9 points of retail, 4 of 8 within 4, worst 17.8.',
  horizon: 'about 6 months',
  your_number: null,
};

const calls: { link?: string; file?: File | null; price?: string; freight?: string }[] = [];
let reply: EstimateResponse = po318;

vi.mock('../../api/buying.api', () => ({
  postEstimateProfit: async (req: { link?: string; file?: File | null }) => {
    calls.push(req);
    return reply;
  },
  patchBuyingValuationInputs: async () => ({}),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <ThemeProvider theme={createTheme()}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EstimateProfitPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Estimate Profit', () => {
  beforeEach(() => {
    calls.length = 0;
    reply = po318;
  });

  it('needs a link or a file before it runs', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Estimate' })).toBeDisabled();
  });

  it('shows brings in, profit, bid up to, the rules and the miss line for a pasted lot', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('B-Stock lot link'), { target: { value: ' https://bstock.com/buy/listings/details/aa11 ' } });
    fireEvent.change(screen.getByLabelText('Freight'), { target: { value: '2500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Estimate' }));

    expect(await screen.findByText('$26,539')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show by seller category (1)' }));
    expect(screen.getAllByText('$26,539').length).toBe(2); // headline and the category row
    expect(calls[0]).toMatchObject({ link: 'https://bstock.com/buy/listings/details/aa11', freight: '2500' });
    expect(screen.getByText(/\$22,574 to \$29,878/)).toBeInTheDocument();
    expect(screen.getByText('+$11,439')).toBeInTheDocument();
    expect(screen.getByText('$10,266')).toBeInTheDocument();
    expect(screen.getByText('$12,163')).toBeInTheDocument();
    expect(screen.getByText('sold items only')).toBeInTheDocument();
    expect(screen.getByText(/median miss 4.9 points/)).toBeInTheDocument();
    expect(screen.getByText('about 6 months')).toBeInTheDocument();
    expect(screen.getByText(/formula truckload, 26 pallets/)).toBeInTheDocument();
    expect(screen.getByText('Your number')).toBeInTheDocument();
  });

  it('sends a dropped CSV and shows the weak estimate and whole-truck tags it gets back', async () => {
    reply = { ...po318, lot: null, tags: ['sold items only', 'weak estimate'], profit: null, freight: { used: null, basis: 'none', reason: 'no lot link, so no pallets or city', formula: null } };
    renderPage();
    const file = new File(['Seller Category,Qty,Unit Retail\n'], 'target_tl.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('manifest-file'), { target: { files: [file] } });
    expect(screen.getByText('target_tl.csv')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Estimate' }));

    expect(await screen.findByText('weak estimate')).toBeInTheDocument();
    expect(calls[0].file?.name).toBe('target_tl.csv');
    expect(screen.getByText('Paste the lot link to save your number.')).toBeInTheDocument();
    expect(screen.getAllByText(/before freight/).length).toBe(2);
  });

  it('says not yet for other sellers and not in our list for a new lot', async () => {
    reply = { supported: false, not_found: true, message: 'This lot is not in our list yet. The sweep runs hourly; try again later, or drop its manifest CSV.' };
    renderPage();
    fireEvent.change(screen.getByLabelText('B-Stock lot link'), { target: { value: 'https://bstock.com/buy/listings/details/zz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Estimate' }));
    expect(await screen.findByText(/not in our list yet/)).toBeInTheDocument();
  });
});
