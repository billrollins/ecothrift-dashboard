import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewResponse, ReviewRow } from '../../api/inventoryReview.api';
import InventoryReviewPage, { flagHelp, itemsHref, pct } from './InventoryReviewPage';

const api = vi.hoisted(() => ({ getInventoryReview: vi.fn() }));
vi.mock('../../api/inventoryReview.api', async (orig) => ({ ...(await orig<object>()), ...api }));

function row(key: string, over: Partial<ReviewRow> = {}): ReviewRow {
  return {
    key, label: key || 'No subcategory', units_in: 5, legacy_sold: 0, units_out: 3, units_sold: 3, units_scrapped: 0,
    units_lost: 0, units_returned: 0, sales: '30.00', net: '27.00', sold_retail: '90.00', sold_with_retail: 3,
    sold_net_with_retail: '27.00', sold_cost: '9.00', sold_with_cost: 3, sold_net_with_cost: '27.00', sold_no_checkin: 0,
    median_days_to_sell: 12.4, sold_4wk: 8, sold_12wk: 30, on_hand: 40, stale_on_hand: 10, bulk_on_hand: 20,
    on_hand_no_retail: 1, on_hand_no_checkin: 0, on_hand_missing: 1, weeks_of_supply: 20, stale_share: 0.25,
    bulk_share: 0.5, recovery: 0.3, net_to_cost: 3, flags: ['overstocked'], ...over,
  };
}

const SETTINGS = {
  inventory_review_overstock_weeks: 12, inventory_review_short_weeks: 2, inventory_review_stale_heavy_share: 0.4,
  inventory_review_slowing_share: 0.3, inventory_review_missing_share: 0.1, inventory_review_stale_days: 90,
};

function response(category: string | null, rows: ReviewRow[]): ReviewResponse {
  return {
    span: 1, category, from: '2026-10-19', to: '2026-10-25', as_of: '2026-10-28T15:00:00-05:00', built: null,
    rows, total: row(category ?? '', { label: 'All' }), settings: SETTINGS, flags: [],
  };
}

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/inventory/review" element={<><InventoryReviewPage /><Where /></>} />
            <Route path="/inventory/search" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('InventoryReviewPage helpers', () => {
  it('builds the search drill links and reads the flag limits', () => {
    expect(itemsHref(null, row('Kitchen & dining'))).toBe('/inventory/search?category=Kitchen+%26+dining');
    expect(itemsHref('Kitchen & dining', row(''), true))
      .toBe('/inventory/search?category=Kitchen+%26+dining&sub=%28none%29&stale=1');
    expect(pct(0.256)).toBe('26%');
    expect(pct(null)).toBe('-');
    expect(flagHelp('stale', SETTINGS)).toBe('More than 40% of on hand is over 90 days on the shelf.');
  });
});

describe('InventoryReviewPage', () => {
  it('shows categories, opens a category, then a subcategory in Inventory search', async () => {
    api.getInventoryReview.mockImplementation(async ({ category }: { category?: string | null }) => ({
      data: category
        ? response(category, [row('Cookware', { on_hand: 30 }), row('', { on_hand: 10, flags: [] })])
        : response(null, [row('Toys & games', { on_hand: 10 }), row('Kitchen & dining', { on_hand: 40 })]),
    }));
    const user = userEvent.setup();
    renderAt('/inventory/review');
    const table = await screen.findByRole('table', { name: 'Categories' });
    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows[1]).toHaveTextContent('Kitchen & dining');  // most on hand first, under the total
    expect(bodyRows[1]).toHaveTextContent('25%');
    expect(screen.getByText('Week of Oct 19 to Oct 25', { exact: false })).toBeInTheDocument();

    await user.click(within(bodyRows[1]).getByText('Kitchen & dining'));
    expect(await screen.findByRole('table', { name: 'Kitchen & dining subcategories' })).toBeInTheDocument();
    expect(api.getInventoryReview).toHaveBeenLastCalledWith({ span: 1, category: 'Kitchen & dining' }, expect.anything());

    await user.click(screen.getByText('No subcategory'));
    expect(screen.getByTestId('where')).toHaveTextContent('/inventory/search?category=Kitchen+%26+dining&sub=%28none%29');
  });

  it('switches to 4 weeks and sorts by a column', async () => {
    api.getInventoryReview.mockResolvedValue({ data: response(null, [row('A', { units_in: 1 }), row('B', { units_in: 9 })]) });
    const user = userEvent.setup();
    renderAt('/inventory/review');
    const table = await screen.findByRole('table', { name: 'Categories' });
    await user.click(within(table).getByText('In'));
    expect(within(table).getAllByRole('row')[2]).toHaveTextContent('B');
    await user.click(screen.getByRole('button', { name: '4 weeks' }));
    expect(screen.getByTestId('where')).toHaveTextContent('span=4');
  });
});
