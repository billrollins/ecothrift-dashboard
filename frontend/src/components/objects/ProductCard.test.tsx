import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ObjectLink, ObjectModalProvider } from './ObjectModal';

const client = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../api/client', () => ({ default: client }));
vi.mock('../../pages/inventory/manage/ProductManageDrawer', () => ({ ProductManagePanel: () => <div>THE EDITOR</div> }));
vi.mock('../../api/inventory.api', async (orig) => ({
  ...(await orig<typeof import('../../api/inventory.api')>()),
  getProduct: vi.fn(async () => ({ data: { id: 3 } })),
}));

const CARD = {
  id: 3, product_number: 'P-0003', title: 'Stand Mixer 5qt', brand: 'KitchenAid', model: 'KSM150', category: 'Kitchen',
  is_active: true, photo_url: null, upc: '0123', identifiers: { upc: '0123', asin: 'B00' }, tags: [], created_at: '2026-10-01T15:00:00Z',
  counts: { total: 6, on_shelf: 3, processing: 0, sold: 2, gone: 1, returned: 0 },
  avg_sold: '80.00', avg_price: '89.00', avg_retail: '279.99', avg_days_to_sell: 4,
  items: [{ id: 9, sku: 'ITM0009', status: 'on_shelf', status_label: 'On Shelf', price: '89.00', sold_for: null, order_number: 'PO-12' }],
  orders: [{ id: 12, order_number: 'PO-12', items: 6 }], more_orders: false,
  journey: [{ kind: 'check_in', at: '2026-10-20T15:00:00Z', label: 'Checked in × 6', detail: 'PO-12' }],
};

window.matchMedia = ((query: string) => ({
  matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {},
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

describe('Product window (Dash Updates #11)', () => {
  it('is read-only with the numbers, items and orders; Edit swaps in the editor', async () => {
    client.get.mockResolvedValue({ data: CARD });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ThemeProvider theme={createTheme()}>
          <MemoryRouter>
            <ObjectModalProvider><ObjectLink type="product" id={3} label="Mixer" /></ObjectModalProvider>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Mixer' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('heading', { name: 'Stand Mixer 5qt' })).toBeInTheDocument();
    expect(within(dialog).getByText('P-0003')).toBeInTheDocument();
    expect(within(dialog).getByText('$80.00')).toBeInTheDocument();
    expect(within(dialog).getByText(/3 on the shelf · 2 sold · 1 scrapped or lost/)).toBeInTheDocument();
    expect(within(dialog).getByText('ITM0009')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'PO-12 (6)' })).toBeInTheDocument();
    expect(within(dialog).queryByText('THE EDITOR')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Edit' }));
    expect(await within(dialog).findByText('THE EDITOR')).toBeInTheDocument();
  });
});
