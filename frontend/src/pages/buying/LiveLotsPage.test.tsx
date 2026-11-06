import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveLot, LiveLots } from '../../types/buying.types';
import LiveLotsPage from './LiveLotsPage';

const api = vi.hoisted(() => ({ fetchLiveLots: vi.fn(), postManifestRequest: vi.fn() }));
vi.mock('../../api/buying.api', () => api);
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1, is_superuser: true } }) }));

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

function lot(fields: Partial<LiveLot>): LiveLot {
  return {
    id: 1, seller: 'Target', seller_slug: 'target', title: '6 Pallets of Apparel, 3,163 Units, Ext. Retail $120,761, Franklin, IN',
    short_title: '6 Pallets of Apparel', units: 3163, url: 'https://bstock.com/x', retail: 120761, retail_source: 'B-Stock',
    price: 6350, price_basis: 'current bid', bids: 0, ends: inHours(28.5), pallets: 6, city: 'Franklin, IN', manifest: 'none',
    manifest_eligible: true, watched: false, method: 'whole truck', estimate_note: '',
    brings_in: { low: 29000, likely: 33700, high: 41600 }, freight: 2000, freight_basis: 'formula', landed: 8667,
    landed_pct: 0.07, bid_up_to: 21097, room: 14747, room_pct: 0.12, profit_at_max: 9548, reach: 'no_bids', ...fields,
  };
}

function renderPage(data: LiveLots) {
  api.fetchLiveLots.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><LiveLotsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const base: LiveLots = { generated_at: new Date().toISOString(), last_listed_at: new Date().toISOString(), landed_pct: 0.2, fit_id: 1, lots: [], contract: [] };

describe('LiveLotsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows your max and the profit at it, with the clean title, and never ranks on an opening bid', async () => {
    renderPage({
      ...base,
      lots: [
        lot({}),
        lot({ id: 2, short_title: 'Bedding truck', bids: 9, price: 30000, reach: 'over', room: -8903, profit_at_max: 4000, bid_up_to: 21097, ends: inHours(2) }),
        lot({ id: 3, short_title: 'Manifest lot', method: 'manifest', manifest: 'yes', bids: 3, reach: 'under', room: 5000, bid_up_to: 12000, profit_at_max: 6000, ends: inHours(50) }),
      ],
    });
    expect(await screen.findByText('6 Pallets of Apparel')).toBeTruthy();
    expect(screen.getAllByText('$21,097').length).toBe(2);
    expect(screen.getByText('≈ +$9,548')).toBeTruthy(); // a whole-truck guess reads as approximate
    expect(screen.getByText('+$6,000')).toBeTruthy(); // priced by its manifest
    expect(screen.getByText('over by $8,903')).toBeTruthy();
    expect(screen.getByText('$5,000 under')).toBeTruthy();
    expect(screen.getByText('28 h')).toBeTruthy();
    expect(screen.getAllByText('get manifest').length).toBe(2); // not on the lot that has one
    // Ending soon by default, but a lot already over your max sits last.
    const titles = screen.getAllByText(/6 Pallets of Apparel|Bedding truck|Manifest lot/).map((n) => n.textContent);
    expect(titles).toEqual(['6 Pallets of Apparel', 'Manifest lot', 'Bedding truck']);
  });

  it('says so when nothing is live, and warns when B-Stock was not checked for hours', async () => {
    renderPage({ ...base, last_listed_at: new Date(Date.now() - 5 * 3600_000).toISOString() });
    expect(await screen.findByText('No live lots right now.')).toBeTruthy();
    expect(screen.getByText(/over 3 hours ago/)).toBeTruthy();
  });
});
