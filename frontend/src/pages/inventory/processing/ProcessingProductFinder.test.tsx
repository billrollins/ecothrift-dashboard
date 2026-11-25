import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { describe, expect, it, vi } from 'vitest';
import type { FoundProductDTO } from '../../../api/productFind.api';
import {
  ProcessingLikelyProducts,
  ProcessingProductSearch,
  bandCounts,
  bandOf,
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
  product({ kind: 'is', confidence: 97, band: 'yes' }),
  product({ id: 2, title: 'VTech KidiBeats Drum Set', why: 'Most words', upc: '', items: 0, sold: 0, on_shelf: 0, kind: 'like', confidence: 71, band: 'maybe' }),
  product({ id: 4, title: 'Band in a Box Hand Drums', brand: 'Melissa & Doug', why: 'Most words', upc: '', items: 0, sold: 0, on_shelf: 0, kind: 'like', confidence: 38, band: 'no' }),
];
const FOUND = [product({ id: 3, title: 'Kids Mini Toy Drum', why: 'Most words', photo: 'https://img.test/drum.jpg' }), product({ id: 1, on_this_row: true, why: 'All words' })];

function serve(likely: FoundProductDTO[] = LIKELY) {
  client.get.mockReset();
  client.post.mockReset();
  client.get.mockImplementation((url: string) => Promise.resolve({
    data: url.includes('likely-products') ? { results: likely, took_ms: 40, not_product_ids: [] } : { q: 'drum', results: FOUND, took_ms: 20 },
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

describe('likely products on a manifest row (#223, always open since #229)', () => {
  it('is always open: every likely product is on screen, green / yellow / grey, with the counts on top', async () => {
    serve();
    const onUse = vi.fn();
    render(wrap(<ProcessingLikelyProducts processingRowId={9} attachedProductIds={new Set()} onUse={onUse} />));
    // No click to open anything: all three are there.
    expect(await screen.findByText('VTech Bluey Hooray Drum Set')).toBeInTheDocument();
    expect(screen.getByText('VTech KidiBeats Drum Set')).toBeInTheDocument();
    expect(screen.getByText('Band in a Box Hand Drums')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open all likely/ })).not.toBeInTheDocument();
    expect(screen.getByText('Yes · 97%')).toBeInTheDocument();
    expect(screen.getByText('Maybe · 71%')).toBeInTheDocument();
    expect(screen.getByText('Probably not · 38%')).toBeInTheDocument();
    expect(screen.getAllByTestId('likely-row').map((r) => r.dataset.band)).toEqual(['yes', 'maybe', 'no']);
    expect(screen.getByTestId('likely-count-yes')).toHaveTextContent('1 yes');
    expect(screen.getByTestId('likely-count-maybe')).toHaveTextContent('1 maybe');
    expect(screen.getByTestId('likely-count-no')).toHaveTextContent('1 probably not');
    expect(client.get).toHaveBeenCalledWith('/inventory/processing-rows/9/likely-products/', expect.anything());

    await userEvent.setup().click(screen.getByRole('button', { name: 'Use VTech KidiBeats Drum Set' }));
    expect(onUse).toHaveBeenCalledWith(2);
  });

  it('the X says "not this product" and is remembered on the row', async () => {
    serve();
    render(wrap(<ProcessingLikelyProducts processingRowId={9} attachedProductIds={new Set()} onUse={vi.fn()} />));
    await screen.findByText('VTech Bluey Hooray Drum Set');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Not this product: VTech Bluey Hooray Drum Set' }));
    expect(client.post).toHaveBeenCalledWith('/inventory/processing-rows/9/not-product/', { product_id: 1, undo: false });
  });

  it('leaves out products already attached to the row, and the counts follow', async () => {
    serve();
    render(wrap(<ProcessingLikelyProducts processingRowId={9} attachedProductIds={new Set([1])} onUse={vi.fn()} />));
    expect(await screen.findByText('VTech KidiBeats Drum Set')).toBeInTheDocument();
    expect(screen.queryByText('VTech Bluey Hooray Drum Set')).not.toBeInTheDocument();
    expect(screen.getByTestId('likely-count-yes')).toHaveTextContent('0 yes');
  });

  it('keeps its place with nothing likely: the pane and its three counts are still there', async () => {
    serve([]);
    render(wrap(<ProcessingLikelyProducts processingRowId={9} attachedProductIds={new Set()} onUse={vi.fn()} />));
    expect(await screen.findByText('No likely products.')).toBeInTheDocument();
    expect(screen.getByTestId('likely-pane')).toBeInTheDocument();
    expect(screen.getByTestId('likely-count-yes')).toHaveTextContent('0 yes');
    expect(screen.getByTestId('likely-count-no')).toHaveTextContent('0 probably not');
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

  it('a photo that will not load reads NO PHOTO, never a broken image', async () => {
    serve();
    render(wrap(<ProcessingProductSearch processingRowId={9} attachedProductIds={new Set()} onUse={vi.fn()} />));
    await userEvent.setup().type(screen.getByRole('combobox', { name: 'Search products' }), 'drum{Enter}');
    const img = await screen.findByRole('img', { name: 'Kids Mini Toy Drum' });
    fireEvent.error(img);
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Kids Mini Toy Drum' })).not.toBeInTheDocument());
    expect(screen.getAllByText('NO PHOTO').length).toBeGreaterThan(0);
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
    expect(matchLabel({ band: 'yes', confidence: 98 })).toBe('Yes · 98%');
    expect(matchLabel({ band: 'maybe', confidence: 84 })).toBe('Maybe · 84%');
    expect(matchLabel({ band: 'no', confidence: 40 })).toBe('Probably not · 40%');
    expect(matchLabel({})).toBe('');
  });

  it('reads the colour from an answer with no band (an older server)', () => {
    expect(bandOf({ kind: 'is', confidence: 97 })).toBe('yes');
    expect(bandOf({ kind: 'like', confidence: 71 })).toBe('maybe');
    expect(bandOf({ kind: 'like', confidence: 59 })).toBe('no');
    // The server's band wins: alike in words but another size is only "maybe".
    expect(bandOf({ kind: 'like', confidence: 84, band: 'maybe' })).toBe('maybe');
    expect(bandCounts([{ band: 'yes' }, { band: 'no' }, { band: 'no' }])).toEqual({ yes: 1, maybe: 0, no: 2 });
  });
});
