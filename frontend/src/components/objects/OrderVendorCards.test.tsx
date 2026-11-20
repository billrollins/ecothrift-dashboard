import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ObjectLink, ObjectModalProvider } from './ObjectModal';

const client = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }));
vi.mock('../../api/client', () => ({ default: client }));
const auth = vi.hoisted(() => ({ user: { id: 2, is_superuser: false, view_as: null } as { id: number; is_superuser: boolean; view_as: unknown } }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));

const ORDER = {
  id: 12, order_number: 'CSTCO-12', status: 'processing', status_label: 'Processing', vendor: { id: 3, name: 'Costco' },
  vendor_name: 'Costco', description: '2 pallets of kitchen', condition: '', notes: '', ordered_date: '2026-10-13',
  money: { purchase: '1055.00', shipping: '919.00', fees: '31.65', total: '2005.65', retail: '10440.00', est_shrink: '0.10',
    sold_for: '889.04', shelf_value: '5358.48', cost_pct_of_retail: 19.2, recovered_pct: 44.3 },
  units: { manifest_lines: 103, manifest_units: 197, items: 195, pending: 0, on_shelf: 138, sold: 57, returned: 0, gone: 0, disputed: 0, pallets: 2 },
  claim: null, disputes: [], journey: [{ kind: 'ordered', at: '2026-10-13' }, { kind: 'delivered', at: '2026-10-20' }],
};
/** The edit view's data (detail-surface) the window also reads (Dash Update #191). */
const SURFACE = {
  id: 12, vendor: 3, vendor_name: 'Costco', vendor_code: 'CST', order_number: 'CSTCO-12', status: 'processing',
  ordered_date: '2026-10-13', paid_date: '2026-10-14', shipped_date: null, expected_delivery: '2026-10-19', delivered_date: '2026-10-20',
  purchase_cost: '1055.00', shipping_cost: '919.00', fees: '31.65', total_cost: '2005.65', retail_value: '10440.00',
  est_shrink: '0.10', condition: '', description: '2 pallets of kitchen', item_count: 197, pallet_count: 2, notes: '',
  manifest_filename: 'costco-12.csv', manifest_uploaded_at: '2026-10-15T15:00:00Z', manifest_row_count: 103,
  manifest_category_count: 7, closeout_status: '', has_manifest: true, created_at: '2026-10-13T15:00:00Z', updated_at: '2026-10-20T15:00:00Z',
};
const VENDOR = { id: 3, name: 'Costco', code: 'CST', vendor_type: 'liquidation', contact_name: 'Pat', contact_email: '', contact_phone: '', address: '', notes: '', is_active: true, created_at: '' };
const METRICS = { period: '12m', start: '2025-11-02', metrics: { orders: 9, spent: '24179.97', landed_pct: '19', recovery_actual: '149', days_to_sell: 7.2, items_checked_in: 1905, items_sold: 1407 } };

function serve(order: Record<string, unknown> = ORDER, surface: Record<string, unknown> = SURFACE) {
  client.get.mockImplementation((url: string) => Promise.resolve({
    data: url.endsWith('/orders/12/card/') ? order
      : url.endsWith('/orders/12/detail-surface/') ? surface
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

  it('the Order window shows cost against retail and recovered; its vendor opens the Vendor window', async () => {
    serve();
    const user = userEvent.setup();
    wrap(<ObjectLink type="order" id={12} label="CSTCO-12" />);
    await user.click(screen.getByRole('button', { name: 'CSTCO-12' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('19.2%')).toBeInTheDocument();
    expect(within(dialog).getByText('44.3%')).toBeInTheDocument();
    expect(within(dialog).getByText(/138 on the shelf/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Costco' }));
    expect(await within(dialog).findByText('Liquidation')).toBeInTheDocument();
    expect(await within(dialog).findByText('149%')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Back' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(await within(dialog).findByText('Lifecycle')).toBeInTheDocument();
  });

  it('the Order window shows the lifecycle, costs and manifest without Edit (Dash Update #191)', async () => {
    serve();
    wrap(<ObjectLink type="order" id={12} label="CSTCO-12" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'CSTCO-12' }));
    const dialog = await screen.findByRole('dialog');
    // Lifecycle: the five dates, Shipped not set, then the later steps; the last step done is current.
    const life = (await within(dialog).findByText('Lifecycle')).closest('section')!;
    for (const step of ['Ordered', 'Paid', 'Shipped', 'Expected', 'Delivered']) expect(within(life).getByText(step)).toBeInTheDocument();
    expect(within(life).getByText('Delivered').textContent).toContain('Current');
    // Costs with margin: (10440 - 2005.65) / 10440.
    const costs = within(dialog).getByText('Costs').closest('section')!;
    expect(within(costs).getByText('$31.65')).toBeInTheDocument();
    expect(within(costs).getByText('80.8%')).toBeInTheDocument();
    // Manifest: file, rows, categories, value, and its preview.
    const manifest = within(dialog).getByText('Manifest', { selector: 'h3' }).closest('section')!;
    expect(within(manifest).getByRole('button', { name: 'costco-12.csv' })).toBeInTheDocument();
    expect(within(manifest).getByText('103')).toBeInTheDocument();
    expect(within(manifest).getByText('7')).toBeInTheDocument();
    expect(within(manifest).getByText('$10,440')).toBeInTheDocument();
    // The edit view's step buttons work from the window.
    expect(within(dialog).getByRole('button', { name: 'Start Preprocessing' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Finish truck' })).toBeEnabled();
    // The intake drawer and its undo/delete are gone (Bill, 2026-11-20); staff read, never edit.
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Intake timeline' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(costs).queryByRole('button', { name: /Purchase/ })).toBeNull();
    expect(within(dialog).getByText('CST')).toBeInTheDocument();
  });

  it('without a manifest the Order window says so; Preprocessing waits for it', async () => {
    serve({ ...ORDER, status: 'paid', status_label: 'Paid', units: { ...ORDER.units, manifest_lines: 0, manifest_units: 0 } },
      { ...SURFACE, status: 'paid', delivered_date: null, has_manifest: false, manifest_filename: null, manifest_uploaded_at: null,
        manifest_row_count: null, manifest_category_count: null });
    wrap(<ObjectLink type="order" id={12} label="CSTCO-12" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'CSTCO-12' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('No manifest yet.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Upload manifest' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Start Preprocessing' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Start Processing' })).toBeDisabled();
    expect(within(dialog).getByText('Paid', { selector: 'p' }).textContent).toContain('Current');
  });

  it('the owner drops a manifest file on the empty Manifest card and it uploads (Bill, 2026-11-20)', async () => {
    serve(ORDER, { ...SURFACE, has_manifest: false, manifest_filename: null });
    client.post.mockResolvedValue({ data: {} });
    auth.user = { id: 1, is_superuser: true, view_as: null };
    try {
      wrap(<ObjectLink type="order" id={12} label="CSTCO-12" />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'CSTCO-12' }));
      const dialog = await screen.findByRole('dialog');
      const zone = await within(dialog).findByTestId('order-manifest-drop');
      const file = new File(['Qty,Title', '1,Lamp'], 'manifest.csv', { type: 'text/csv' });
      fireEvent.drop(zone, { dataTransfer: { files: [file] } });
      await vi.waitFor(() => expect(client.post).toHaveBeenCalled(), { timeout: 2000 });
      expect(String(client.post.mock.calls[0][0])).toContain('/inventory/orders/12/upload-manifest/');
    } finally {
      auth.user = { id: 2, is_superuser: false, view_as: null };
    }
  });

  it('All dates opens every recorded date and time inside Lifecycle', async () => {
    serve(ORDER, { ...SURFACE, standardized_at: '2026-10-15T16:00:00Z', receiving_started_at: '2026-10-20T14:00:00Z' });
    const user = userEvent.setup();
    wrap(<ObjectLink type="order" id={12} label="CSTCO-12" />);
    await user.click(screen.getByRole('button', { name: 'CSTCO-12' }));
    const dialog = await screen.findByRole('dialog');
    const life = (await within(dialog).findByText('Lifecycle')).closest('section')!;
    expect(within(life).queryByText('Manifest standardized')).toBeNull();
    await user.click(within(life).getByRole('button', { name: 'All dates' }));
    expect(within(life).getByText('Manifest standardized')).toBeInTheDocument();
    expect(within(life).getByText('Created in Dash')).toBeInTheDocument();
    expect(within(life).getByText('Last changed')).toBeInTheDocument();
    expect(within(life).getByRole('button', { name: 'All dates' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('the owner changes a field in place and it saves itself; read and edit look the same (Bill, 2026-11-20)', async () => {
    serve(ORDER, { ...SURFACE, has_manifest: false, manifest_filename: null });
    client.patch.mockResolvedValue({ data: SURFACE });
    auth.user = { id: 1, is_superuser: true, view_as: null };
    try {
      const user = userEvent.setup();
      wrap(<ObjectLink type="order" id={12} label="CSTCO-12" />);
      await user.click(screen.getByRole('button', { name: 'CSTCO-12' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(await within(dialog).findByRole('button', { name: 'Upload manifest' })).toBeEnabled();
      await user.click(within(dialog).getByRole('button', { name: 'Fees: $31.65' }));
      const input = within(dialog).getByRole('textbox', { name: 'Fees' });
      await user.clear(input);
      await user.type(input, '45{Enter}');
      await vi.waitFor(() => expect(client.patch).toHaveBeenCalledWith('/inventory/orders/12/', { fees: '45' }), { timeout: 2000 });
    } finally {
      auth.user = { id: 2, is_superuser: false, view_as: null };
    }
  });
});
