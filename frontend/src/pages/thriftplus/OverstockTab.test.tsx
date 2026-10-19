import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchOverstock, markOverstock } from '../../api/thriftplus.api';
import type { OverstockList, OverstockRow } from '../../types/thriftplus.types';
import OverstockTab from './OverstockTab';

const row = (over: Partial<OverstockRow>): OverstockRow => ({
  product_id: 1, title: 'Flannel shacket', brand: 'Generic', category: 'Clothing', units: 1560, tag_total: '7800.00',
  price_avg: '5.00', price_min: '5.00', price_max: '5.00', retail_avg: '19.99', cost_avg: '2.50', age_oldest: 200, age_newest: 30,
  sold_90: 40, sold_180: 70, per_90: '41.0', days_of_supply: 3424, flags: [], mark: null, ...over,
});

const LIST: OverstockList = {
  total: 2, undecided: 1,
  counts: { undecided: 1, back_stock: 1, bundle: 0, dollar_bin: 0, liquidate: 0, donate: 0, keep: 0 },
  units: 2230, tag_total: '14500.00', settings: { group_min_units: 10, overstock_days: 365 }, matching: 1,
  rows: [row({ flags: [{ key: 'cost', text: 'Cost is about 50% of the tag: it was bought to sell near the tag.' }] })],
};

vi.mock('../../api/thriftplus.api', () => ({
  fetchOverstock: vi.fn(async () => LIST),
  markOverstock: vi.fn(async () => ({ product_id: 1, action: 'bundle' })),
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { is_superuser: true } }) }));

describe('Overstock tab (rulebook P6, owner 2026-10-19)', () => {
  it('lists lots to mark and lets the owner mark one with a note', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OverstockTab />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('1 of 2 lots to mark')).toBeInTheDocument();
    expect(fetchOverstock).toHaveBeenCalledWith(expect.objectContaining({ show: 'undecided' }));
    const card = screen.getByTestId('lot-card');
    expect(within(card).getByText('3,424 days (9.4 years)')).toBeInTheDocument();
    expect(within(card).getByText('Bought to sell near the tag')).toBeInTheDocument();
    await user.type(within(card).getByLabelText('Note (optional)'), '3 for $10');
    await user.click(within(card).getByTestId('mark-bundle'));
    await waitFor(() => expect(markOverstock).toHaveBeenCalledWith(1, 'bundle', '3 for $10'));
    await user.click(screen.getByTestId('show-back_stock'));
    await waitFor(() => expect(fetchOverstock).toHaveBeenCalledWith(expect.objectContaining({ show: 'back_stock' })));
  });
});
