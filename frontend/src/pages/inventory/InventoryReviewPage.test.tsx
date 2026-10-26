import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { FlagsResponse, ReviewDimension, ReviewResponse, ReviewRow } from '../../api/inventoryReview.api';
import InventoryReviewPage, { flagHelp, itemsHref, limitShown, limitStored, pct } from './InventoryReviewPage';

const api = vi.hoisted(() => ({ getInventoryReview: vi.fn(), getReviewFlags: vi.fn() }));
vi.mock('../../api/inventoryReview.api', async (orig) => ({ ...(await orig<object>()), ...api }));
const core = vi.hoisted(() => ({ updateSetting: vi.fn() }));
vi.mock('../../api/core.api', () => core);
const auth = vi.hoisted(() => ({ manager: true }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasRole: () => auth.manager, user: { is_superuser: false } }),
}));

function row(key: string, over: Partial<ReviewRow> = {}): ReviewRow {
  return {
    key, label: key || 'No subcategory', units_in: 5, legacy_sold: 0, units_out: 3, units_sold: 3, units_scrapped: 0,
    units_lost: 0, units_returned: 0, sales: '30.00', net: '27.00', sold_retail: '90.00', sold_with_retail: 3,
    sold_net_with_retail: '27.00', sold_cost: '9.00', sold_with_cost: 3, sold_net_with_cost: '27.00', sold_no_checkin: 0,
    median_days_to_sell: 12.4, sold_4wk: 8, sold_12wk: 30, on_hand: 40, stale_on_hand: 10, bulk_on_hand: 20,
    on_hand_no_retail: 1, on_hand_no_checkin: 0, on_hand_missing: 1, weeks_of_supply: 20, stale_share: 0.25,
    bulk_share: 0.5, recovery: 0.3, net_to_cost: 3, flags: ['overstocked'], rank: 0, ...over,
  };
}

const SETTINGS = {
  inventory_review_overstock_weeks: 12, inventory_review_short_weeks: 2, inventory_review_stale_heavy_share: 0.4,
  inventory_review_slowing_share: 0.3, inventory_review_missing_share: 0.1, inventory_review_stale_days: 90,
};

function response(dimension: ReviewDimension, category: string | null, rows: ReviewRow[]): ReviewResponse {
  return {
    span: 1, dimension, category, from: '2026-10-19', to: '2026-10-25', as_of: '2026-10-28T15:00:00-05:00', built: null,
    rows, total: row(category ?? '', { label: 'All', rank: -1 }), settings: SETTINGS, flags: [],
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
        <SnackbarProvider>
          <MemoryRouter initialEntries={[url]}>
            <Routes>
              <Route path="/inventory/review" element={<><InventoryReviewPage /><Where /></>} />
              <Route path="/inventory/search" element={<Where />} />
            </Routes>
          </MemoryRouter>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function mockTabs() {
  api.getInventoryReview.mockImplementation(async ({ dimension, category }: { dimension?: ReviewDimension; category?: string | null }) => {
    if (dimension === 'vendor') {
      return { data: response('vendor', null, [row('TRGET', { label: 'Target (TRGET)', on_hand: 50 }), row('', { label: 'No vendor', on_hand: 5 })]) };
    }
    if (dimension === 'price_point') {
      return { data: response('price_point', null, [row('100+', { label: '$100 and up', rank: 5, on_hand: 90 }), row('u5', { label: 'Under $5', rank: 0, on_hand: 10 })]) };
    }
    return {
      data: category
        ? response('category', category, [row('Cookware', { on_hand: 30 }), row('', { on_hand: 10, flags: [] })])
        : response('category', null, [row('Toys & games', { on_hand: 10 }), row('Kitchen & dining', { on_hand: 40 })]),
    };
  });
}

describe('InventoryReviewPage helpers', () => {
  it('builds the search drill links and reads the flag limits', () => {
    expect(itemsHref('category', null, row('Kitchen & dining'))).toBe('/inventory/search?category=Kitchen+%26+dining');
    expect(itemsHref('category', 'Kitchen & dining', row(''), true))
      .toBe('/inventory/search?category=Kitchen+%26+dining&sub=%28none%29&stale=1');
    expect(itemsHref('vendor', null, row(''))).toBe('/inventory/search?vendor=%28none%29');
    expect(itemsHref('price_point', null, row('10-25'), true)).toBe('/inventory/search?price_point=10-25&stale=1');
    expect(pct(0.256)).toBe('26%');
    expect(pct(null)).toBe('-');
    expect(flagHelp('stale', SETTINGS)).toBe('More than 40% of on hand is over 90 days on the shelf.');
  });

  it('shows shares as percents and refuses a limit that makes no sense', () => {
    expect(limitShown('share', 0.4)).toBe('40');
    expect(limitStored('share', '35')).toBe(0.35);
    expect(limitStored('share', '140')).toBeNull();
    expect(limitStored('weeks', '8.5')).toBe(8.5);
    expect(limitStored('days', '0')).toBeNull();
    expect(limitStored('weeks', '')).toBeNull();
  });
});

describe('InventoryReviewPage', () => {
  it('shows categories, opens a category, then a subcategory in Inventory search', async () => {
    mockTabs();
    const user = userEvent.setup();
    renderAt('/inventory/review');
    const table = await screen.findByRole('table', { name: 'Categories' });
    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows[1]).toHaveTextContent('Kitchen & dining');  // most on hand first, under the total
    expect(bodyRows[1]).toHaveTextContent('25%');
    expect(screen.getByText('Week of Oct 19 to Oct 25', { exact: false })).toBeInTheDocument();

    await user.click(within(bodyRows[1]).getByText('Kitchen & dining'));
    expect(await screen.findByRole('table', { name: 'Kitchen & dining subcategories' })).toBeInTheDocument();
    expect(api.getInventoryReview).toHaveBeenLastCalledWith(
      { span: 1, dimension: 'category', category: 'Kitchen & dining' }, expect.anything(),
    );

    await user.click(screen.getByText('No subcategory'));
    expect(screen.getByTestId('where')).toHaveTextContent('/inventory/search?category=Kitchen+%26+dining&sub=%28none%29');
  });

  it('switches to 4 weeks and sorts by a column', async () => {
    mockTabs();
    const user = userEvent.setup();
    renderAt('/inventory/review');
    const table = await screen.findByRole('table', { name: 'Categories' });
    await user.click(within(table).getByText('In'));
    await user.click(within(table).getByText('On hand'));
    expect(within(table).getAllByRole('row')[2]).toHaveTextContent('Kitchen & dining');
    await user.click(screen.getByRole('button', { name: '4 weeks' }));
    expect(screen.getByTestId('where')).toHaveTextContent('span=4');
  });

  it('lists vendors, opens one in Inventory search, and keeps price points in band order', async () => {
    mockTabs();
    const user = userEvent.setup();
    renderAt('/inventory/review');
    await user.click(await screen.findByRole('tab', { name: 'Vendors' }));
    const vendors = await screen.findByRole('table', { name: 'Vendors' });
    await user.click(within(vendors).getByText('No vendor'));
    expect(screen.getByTestId('where')).toHaveTextContent('/inventory/search?vendor=%28none%29');

    renderAt('/inventory/review?tab=price-points');
    const prices = await screen.findByRole('table', { name: 'Price points' });
    const rows = within(prices).getAllByRole('row');
    expect(rows[2]).toHaveTextContent('Under $5');
    expect(rows[3]).toHaveTextContent('$100 and up');
  });

  it('shows each flag with what carries it, and a manager saves a limit', async () => {
    const flags: FlagsResponse = {
      span: 1, from: '2026-10-19', to: '2026-10-25', as_of: '2026-10-28T15:00:00-05:00', settings: SETTINGS,
      setting_keys: {
        overstocked: 'inventory_review_overstock_weeks', short: 'inventory_review_short_weeks',
        stale: 'inventory_review_stale_heavy_share', slowing: 'inventory_review_slowing_share',
        missing: 'inventory_review_missing_share', stale_days: 'inventory_review_stale_days',
      },
      flags: [
        { key: 'overstocked', label: 'Overstocked', carried: { category: [{ key: 'Toys & games', label: 'Toys & games', on_hand: 10 }], vendor: [{ key: 'TRGET', label: 'Target (TRGET)', on_hand: 50 }], price_point: [] } },
        { key: 'short', label: 'Short', carried: { category: [], vendor: [], price_point: [] } },
        { key: 'stale', label: 'Stale-heavy', carried: { category: [], vendor: [], price_point: [] } },
        { key: 'slowing', label: 'Slowing', carried: { category: [], vendor: [], price_point: [] } },
        { key: 'missing', label: 'Missing data', carried: { category: [], vendor: [], price_point: [] } },
      ],
    };
    mockTabs();
    api.getReviewFlags.mockResolvedValue({ data: flags });
    core.updateSetting.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderAt('/inventory/review?tab=flags');
    const over = await screen.findByLabelText('Overstocked flag');
    expect(within(over).getByText('Toys & games · 10').closest('a')).toHaveAttribute('href', '/inventory/review?category=Toys+%26+games');
    expect(within(over).getByText('Target (TRGET) · 50').closest('a')).toHaveAttribute('href', '/inventory/search?vendor=TRGET');
    expect(within(screen.getByLabelText('Short flag')).getByText('Nothing carries it now.')).toBeInTheDocument();

    const box = screen.getByLabelText('Stale-heavy limit');
    expect(box).toHaveValue('40');
    await user.clear(box);
    await user.type(box, '35');
    await user.click(within(screen.getByLabelText('Stale-heavy flag')).getByRole('button', { name: 'Save' }));
    expect(core.updateSetting).toHaveBeenCalledWith('inventory_review_stale_heavy_share', { value: 0.35 });
  });

  it('shows the limits without boxes to people who are not managers', async () => {
    auth.manager = false;
    mockTabs();
    api.getReviewFlags.mockResolvedValue({
      data: {
        span: 1, from: '2026-10-19', to: '2026-10-25', as_of: '2026-10-28T15:00:00-05:00', settings: SETTINGS,
        setting_keys: { overstocked: 'inventory_review_overstock_weeks', short: 'inventory_review_short_weeks', stale: 'inventory_review_stale_heavy_share', slowing: 'inventory_review_slowing_share', missing: 'inventory_review_missing_share', stale_days: 'inventory_review_stale_days' },
        flags: [],
      },
    });
    renderAt('/inventory/review?tab=flags');
    expect(await screen.findByText('90 days')).toBeInTheDocument();
    expect(screen.getByText('40 %')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    auth.manager = true;
  });
});
