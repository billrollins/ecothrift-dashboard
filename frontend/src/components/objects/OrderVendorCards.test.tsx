import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ObjectLink, ObjectModalProvider } from './ObjectModal';

const client = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../api/client', () => ({ default: client }));
vi.mock('../../pages/inventory/OrderDetailPage', () => ({ default: () => <div>THE ORDER PAGE</div> }));

const ORDER = {
  id: 12, order_number: 'CSTCO-12', status: 'processing', status_label: 'Processing', vendor: { id: 3, name: 'Costco' },
  vendor_name: 'Costco', description: '2 pallets of kitchen', condition: '', notes: '', ordered_date: '2026-10-13',
  money: { purchase: '1055.00', shipping: '919.00', fees: '31.65', total: '2005.65', retail: '10440.00', est_shrink: '0.10',
    sold_for: '889.04', shelf_value: '5358.48', cost_pct_of_retail: 19.2, recovered_pct: 44.3 },
  units: { manifest_lines: 103, manifest_units: 197, items: 195, pending: 0, on_shelf: 138, sold: 57, returned: 0, gone: 0, disputed: 0, pallets: 2 },
  claim: null, disputes: [], journey: [{ kind: 'ordered', at: '2026-10-13' }, { kind: 'delivered', at: '2026-10-20' }],
};
const VENDOR = { id: 3, name: 'Costco', code: 'CST', vendor_type: 'liquidation', contact_name: 'Pat', contact_email: '', contact_phone: '', address: '', notes: '', is_active: true, created_at: '' };
const METRICS = { period: '12m', start: '2025-11-02', metrics: { orders: 9, spent: '24179.97', landed_pct: '19', recovery_actual: '149', days_to_sell: 7.2, items_checked_in: 1905, items_sold: 1407 } };

function serve(order: Record<string, unknown> = ORDER) {
  client.get.mockImplementation((url: string) => Promise.resolve({
    data: url.endsWith('/orders/12/card/') ? order
      : url.endsWith('/vendors/3/metrics/') ? METRICS
        : url.endsWith('/vendors/3/') ? VENDOR
          : { count: 1, results: [{ id: 12, order_number: 'CSTCO-12', ordered_date: '2026-10-13', description: 'kitchen', total_cost: '2005.65' }] },
  }));
}

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter><ObjectModalProvider>{ui}</ObjectModalProvider></MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('Order and Vendor windows (Dash Updates #12, #13)', () => {
  it('the Order window says what disputed items add to the truck claim (Dash Update #1)', async () => {
    serve({ ...ORDER, units: { ...ORDER.units, disputed: 2 }, disputed_claim: { items: 2, retail: '80.00' } });
    wrap(<ObjectLink type="order" id={12} label="CSTCO-12" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'CSTCO-12' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('2 items, $80.00 toward the claim')).toBeInTheDocument();
  });

  it('the Order window shows cost against retail and recovered; its vendor opens the Vendor window; Edit shows the page', async () => {
    serve();
    const user = userEvent.setup();
    wrap(<ObjectLink type="order" id={12} label="CSTCO-12" />);
    await user.click(screen.getByRole('button', { name: 'CSTCO-12' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('19.2%')).toBeInTheDocument();
    expect(within(dialog).getByText('44.3%')).toBeInTheDocument();
    expect(within(dialog).getByText(/138 on the shelf/)).toBeInTheDocument();
    expect(within(dialog).queryByText('THE ORDER PAGE')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Costco' }));
    expect(await within(dialog).findByText('Liquidation')).toBeInTheDocument();
    expect(await within(dialog).findByText('149%')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Back' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Edit' }));
    expect(await within(dialog).findByText('THE ORDER PAGE')).toBeInTheDocument();
  });
});
