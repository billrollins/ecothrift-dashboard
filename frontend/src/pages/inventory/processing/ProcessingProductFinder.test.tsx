import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { describe, expect, it, vi } from 'vitest';
import type { FoundProductDTO } from '../../../api/productFind.api';
import {
  ProcessingLikelyProducts,
  ProcessingProductSearch,
  codesLine,
  matchLabel,
  storeLine,
} from './ProcessingProductFinder';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../api/client', () => ({ default: client }));

function product(over: Partial<FoundProductDTO>): FoundProductDTO {
  return {
    id: 1, product_number: 'PRD-1', title: 'VTech Bluey Hooray Drum Set', brand: 'VTech', model: '', upc: '3417765734007',
    category: 'Toys & games', items: 3, on_shelf: 1, sold: 2, avg_sold: '14.78', last_price: '15.99', why: 'Same code',
    ...over,
  };
}

const LIKELY = [
  product({ kind: 'is', confidence: 97 }),
  product({ id: 2, title: 'VTech KidiBeats Drum Set', why: 'Most words', upc: '', items: 0, sold: 0, on_shelf: 0, kind: 'like', confidence: 71 }),
];
const FOUND = [product({ id: 3, title: 'Kids Mini Toy Drum', why: 'Most words', photo: 'https://img.test/drum.jpg' }), product({ id: 1, on_this_row: true, why: 'All words' })];

function serve() {
  client.get.mockReset();
  client.post.mockReset();
  client.get.mockImplementation((url: string) => Promise.resolve({
    data: url.includes('likely-products') ? { results: LIKELY, took_ms: 40, not_product_ids: [] } : { q: 'drum', results: FOUND, took_ms: 20 },
  }));
  client.post.mockResolvedValue({ data: { not_product_ids: [1] } });
}

function wrap(node: React.ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>{node}</SnackbarProvider>
    </QueryClientProvider>
  );
}

describe('likely products on a manifest row (#223)', () => {
  it('stays one folded line: the best guess, whether it IS the product or only LIKE it, and how sure', async () => {
    serve();
    const onUse = vi.fn();
    render(wrap(<ProcessingLikelyProducts processingRowId={9} attachedProductIds={new Set()} onUse={onUse} />));
    expect(await screen.findByText('VTech Bluey Hooray Drum Set')).toBeInTheDocument();
    expect(screen.getByText('Is this · 97%')).toBeInTheDocument();
    // The second one is not on screen until "Open all likely".
    expect(screen.queryByText('VTech KidiBeats Drum Set')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open all likely (2)' }));
    expect(screen.getByText('VTech KidiBeats Drum Set')).toBeInTheDocument();
    expect(screen.getByText('Like this · 71%')).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/inventory/processing-rows/9/likely-products/', expect.anything());
  });

  it('the X says "not this product" and is remembered on the row', async () => {
    serve();
    render(wrap(<ProcessingLikelyProducts processingRowId={9} attachedProductIds={new Set()} onUse={vi.fn()} />));
    await screen.findByText('VTech Bluey Hooray Drum Set');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Not this product: VTech Bluey Hooray Drum Set' }));
    expect(client.post).toHaveBeenCalledWith('/inventory/processing-rows/9/not-product/', { product_id: 1, undo: false });
  });

  it('leaves out products already attached to the row', async () => {
    serve();
    render(wrap(<ProcessingLikelyProducts processingRowId={9} attachedProductIds={new Set([1])} onUse={vi.fn()} />));
    expect(await screen.findByText('VTech KidiBeats Drum Set')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open all likely (1)' })).toBeInTheDocument();
  });
});

describe('product search on a manifest row (#223)', () => {
  it('shows photo, title and brand at a glance; a product already on the row is marked, not offered', async () => {
    serve();
    render(wrap(<ProcessingProductSearch processingRowId={9} attachedProductIds={new Set()} onUse={vi.fn()} />));
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox', { name: 'Search products' }), 'drum{Enter}');
    expect(await screen.findByText('Kids Mini Toy Drum')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Kids Mini Toy Drum' })).toHaveAttribute('src', 'https://img.test/drum.jpg');
    expect(screen.getByText('On this row')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Use' })).toHaveLength(1);
  });

  it('is keyboard friendly: arrows move, Enter uses the highlighted product', async () => {
    serve();
    const onUse = vi.fn();
    render(wrap(<ProcessingProductSearch processingRowId={9} attachedProductIds={new Set()} onUse={onUse} />));
    const user = userEvent.setup();
    const box = screen.getByRole('combobox', { name: 'Search products' });
    await user.type(box, 'drum');
    await screen.findByText('Kids Mini Toy Drum');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onUse).toHaveBeenCalledWith(3));
  });

  it('cancels a stale search: each request carries a signal', async () => {
    serve();
    render(wrap(<ProcessingProductSearch processingRowId={9} attachedProductIds={new Set()} onUse={vi.fn()} />));
    await userEvent.setup().type(screen.getByRole('combobox', { name: 'Search products' }), 'drum{Enter}');
    await screen.findByText('Kids Mini Toy Drum');
    const call = client.get.mock.calls.find(([url]) => url === '/inventory/product-find/');
    expect(call?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('plain words', () => {
  it('says the store history and the match in plain words', () => {
    expect(storeLine(product({ items: 0 }))).toBe('Never checked in');
    expect(storeLine(product({ sold: 0, on_shelf: 0, items: 2 }))).toBe('2 checked in, tag up to $15.99');
    expect(codesLine(product({ model: '', upc: '', category: '' }))).toBe('VTech · #PRD-1');
    expect(matchLabel({ kind: 'is', confidence: 98 })).toBe('Is this · 98%');
    expect(matchLabel({ kind: 'like', confidence: 80 })).toBe('Like this · 80%');
    expect(matchLabel({})).toBe('');
  });
});
