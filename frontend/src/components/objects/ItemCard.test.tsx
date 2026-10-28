import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObjectLink, ObjectModalProvider } from './ObjectModal';
import { ItemPeek } from './ItemPeek';
import { itemCardSpecs, itemCardWhere } from './itemCardData';

const client = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../api/client', () => ({ default: client }));

const LITE = {
  id: 9, sku: 'ITM0009', title: 'KitchenAid Stand Mixer 5qt', brand: 'KitchenAid', model: 'KSM150',
  product_id: 3, product_number: 'P-3', category: 'Kitchen', photo_url: null, status: 'on_shelf',
  status_label: 'On Shelf', condition: 'very_good', condition_label: 'Very Good', location: 'Aisle 4',
  price: '89.00', retail: '279.99', tag_retail: '279.99', specifications: { color: 'Red', watts: 325 },
  notes: 'Bowl has a light scratch', order: { id: 12, order_number: 'PO-12', vendor: 'Target' },
  checked_in_at: '2026-10-20T15:00:00Z', checked_in_by: 'Ana Tester', sold_at: null, sold_for: null,
  last_scan_at: null, restoration: null,
};
const FULL = {
  ...LITE, photos: [], upc: '0123', source: 'purchased', source_label: 'Purchased', retail_check: 'passed',
  retail_source: 'manifest', cost: '18.00', sold_net: null, thriftbucks_at_sale: null, sale_channel: '',
  sale_channel_label: '', listed_at: null, label_printed_at: '2026-10-20T16:00:00Z', created_at: null,
  updated_at: null, manifest_line: null, check_in_id: 44, pallet: '', parent_item: null, dispute: null,
  last_scan_source: '', scan_count: 0,
  journey: [
    { at: '2026-10-20T15:00:00Z', kind: 'check_in', label: 'Checked in at Processing', detail: '', who: 'Ana Tester' },
    { at: '2026-10-20T16:00:00Z', kind: 'tag', label: 'Tag printed', detail: '$89.00', who: '' },
  ],
};

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter>
          <ObjectModalProvider>{ui}</ObjectModalProvider>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  client.get.mockReset();
});

describe('universal Item modal', () => {
  it('opens from the SKU link with every section, read-only, and Edit swaps in the editor', async () => {
    client.get.mockImplementation((url: string, cfg?: { params?: { lite?: number } }) =>
      Promise.resolve({ data: url.endsWith('/card/') && !cfg?.params?.lite ? FULL : LITE }));
    const user = userEvent.setup();
    wrap(<ObjectLink type="item" id={9} label="ITM0009" />);
    await user.click(screen.getByRole('button', { name: 'ITM0009' }));

    expect(await screen.findByRole('heading', { name: 'KitchenAid Stand Mixer 5qt' })).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/inventory/items/9/card/');
    for (const title of ['Overview', 'Where it is', 'Money', 'Journey', 'Links']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(screen.queryByRole('heading', { name: 'Restoration' })).not.toBeInTheDocument();
    expect(screen.getByText('Tag printed', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('$18.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Order PO-12' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('hover card loads the lite card and shows the full title and key facts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes('hover: hover'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    }));
    client.get.mockResolvedValue({ data: LITE });
    wrap(<ItemPeek itemId={9}><span>Mixer</span></ItemPeek>);
    fireEvent.mouseEnter(screen.getByText('Mixer').parentElement!);
    expect(client.get).toHaveBeenCalledWith('/inventory/items/9/card/', { params: { lite: 1 } });
    await act(async () => { vi.advanceTimersByTime(400); });
    const card = await screen.findByRole('dialog', { name: 'Item details' });
    expect(card).toHaveTextContent('KitchenAid Stand Mixer 5qt');
    expect(card).toHaveTextContent('Aisle 4');
    expect(card).toHaveTextContent('Red');
    expect(card).toHaveTextContent('$89.00');
  });
});

describe('item card helpers', () => {
  it('keeps plain specs and says where the item is', () => {
    expect(itemCardSpecs({ color: 'Red', nested: { a: 1 }, blank: '', battery_type: 'AA' })).toEqual([
      ['Color', 'Red'], ['Battery type', 'AA'],
    ]);
    expect(itemCardWhere({ status_label: 'Processing', location: 'restoration', restoration: {
      job_id: 1, stage: 'bench', stage_label: 'Bench', scale: '', starting_grade: '', final_grade: '', bench_owner: '',
      intended_destination: '', bench_disposition: '',
    } })).toBe('Processing · Restoration · Bench');
    expect(itemCardWhere({ status_label: 'On Shelf', location: 'Aisle 4', restoration: null })).toBe('On Shelf · Aisle 4');
  });
});
