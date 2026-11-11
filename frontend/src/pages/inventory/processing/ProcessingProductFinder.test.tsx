import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FoundProductDTO } from '../../../api/productFind.api';
import { ProcessingProductFinder, codesLine, storeLine } from './ProcessingProductFinder';

const client = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../api/client', () => ({ default: client }));

function product(over: Partial<FoundProductDTO>): FoundProductDTO {
  return {
    id: 1, product_number: 'PRD-1', title: 'VTech Bluey Hooray Drum Set', brand: 'VTech', model: '', upc: '3417765734007',
    category: 'Toys & games', items: 3, on_shelf: 1, sold: 2, avg_sold: '14.78', last_price: '15.99', why: 'Same code',
    ...over,
  };
}

const LIKELY = [product({}), product({ id: 2, title: 'VTech KidiBeats Drum Set', why: 'Most words', upc: '', items: 0, sold: 0, on_shelf: 0 })];
const FOUND = [product({ id: 3, title: 'Kids Mini Toy Drum', why: 'Most words' }), product({ id: 1, on_this_row: true, why: 'All words' })];

function serve() {
  client.get.mockImplementation((url: string) => Promise.resolve({
    data: url.includes('likely-products') ? { results: LIKELY, took_ms: 40 } : { q: 'drum', results: FOUND, took_ms: 20 },
  }));
}

function show(attached: number[] = [], onUse = vi.fn()) {
  serve();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProcessingProductFinder processingRowId={9} attachedProductIds={new Set(attached)} onUse={onUse} />
    </QueryClientProvider>,
  );
  return onUse;
}

describe('the product finder in a manifest row (#98)', () => {
  it('shows the likely products the moment a row with no product opens, each with enough to choose it', async () => {
    const onUse = show();
    expect(await screen.findByText('VTech Bluey Hooray Drum Set')).toBeInTheDocument();
    expect(screen.getByText('VTech · UPC 3417765734007 · #PRD-1 · Toys & games')).toBeInTheDocument();
    expect(screen.getByText('2 sold, about $14.78 · 1 on the shelf')).toBeInTheDocument();
    expect(screen.getByText('Never checked in')).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/inventory/processing-rows/9/likely-products/');
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Use' })[0]);
    expect(onUse).toHaveBeenCalledWith(1);
  });

  it('keeps the likely list folded on a row that already has its product', async () => {
    show([5]);
    expect(await screen.findByText('Likely products (2)')).toBeInTheDocument();
    expect(screen.queryByText('VTech Bluey Hooray Drum Set')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText('VTech Bluey Hooray Drum Set')).toBeInTheDocument();
  });

  it('has a clear Search products button; a product already on the row is marked, not offered', async () => {
    show();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Search products' }), 'drum');
    await user.click(screen.getByRole('button', { name: 'Search products' }));
    expect(await screen.findByText('Products for "drum"')).toBeInTheDocument();
    expect(screen.getByText('Kids Mini Toy Drum')).toBeInTheDocument();
    const onRow = screen.getByText('On this row');
    expect(within(onRow.parentElement as HTMLElement).queryByRole('button', { name: 'Use' })).not.toBeInTheDocument();
  });

  it('says the store history in plain words', () => {
    expect(storeLine(product({ items: 0 }))).toBe('Never checked in');
    expect(storeLine(product({ sold: 0, on_shelf: 0, items: 2 }))).toBe('2 checked in, tag up to $15.99');
    expect(codesLine(product({ model: '', upc: '', category: '' }))).toBe('VTech · #PRD-1');
  });
});
