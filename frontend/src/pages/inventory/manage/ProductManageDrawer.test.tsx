import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../../../types/inventory.types';
import { ProductManagePanel, rowDetailsToProductEditorDraft } from './ProductManageDrawer';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() }));
vi.mock('../../../api/client', () => ({ default: client }));

const CATEGORIES = [{ id: 5, name: 'Electronics', parent: null, full_path: 'Electronics' }];
const SUGGESTION = {
  suggestions: { title: 'Energizer MAX AA Batteries 12-Pack' },
  low_confidence: false,
  low_confidence_reason: '',
  usage: { input_tokens: 1, output_tokens: 1 },
  examples_used: 3,
  timing: { db_ms: 1, api_ms: 1, total_ms: 2 },
};

function serve() {
  client.get.mockReset();
  client.post.mockReset();
  client.get.mockImplementation((url: string) =>
    Promise.resolve({ data: url.includes('categories') ? { results: CATEGORIES } : { results: [], count: 0 } }),
  );
  client.post.mockResolvedValue({ data: SUGGESTION });
}

const SEED = rowDetailsToProductEditorDraft({ title: 'Energizer MAX AA Batteries 8-Pack', brand: 'Energizer', category: 'Electronics' });

const PRODUCT = {
  id: 44,
  product_number: 'PRD-44',
  title: 'Energizer MAX AA Batteries 8-Pack',
  brand: 'Energizer',
  model: 'E91',
  category: 5,
  category_name: 'Electronics',
  identifiers: { upc: '039800011329' },
  specifications: {},
  tags: ['batteries'],
  is_active: true,
  created_at: '2026-11-20T10:00:00Z',
  updated_at: '2026-11-20T10:00:00Z',
} as unknown as Product;

function show(props: Partial<React.ComponentProps<typeof ProductManagePanel>> = {}) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SnackbarProvider>
          <ProductManagePanel
            open
            initialProduct={null}
            rowDetailsSeed={SEED}
            rowDetailsSeedKey={7}
            onClose={vi.fn()}
            pagePaste={{ processingRowId: 7 }}
            {...props}
          />
        </SnackbarProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const follows = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const suggestCall = () => client.post.mock.calls.find(([url]) => url === '/inventory/products/suggest/');

describe('the product window (#230)', () => {
  beforeEach(serve);

  it('puts the product details first, then one AI block, then the pasted page', async () => {
    show();
    const details = await screen.findByTestId('product-details');
    const ai = screen.getByTestId('product-ai-block');
    const page = screen.getByTestId('page-paste-box');
    expect(follows(details, ai)).toBe(true);
    expect(follows(ai, page)).toBe(true);
    // The AI buttons are together, Duplicate with them.
    for (const name of ['Suggest', 'Duplicate', 'Original', 'AI values']) {
      expect(ai).toContainElement(screen.getByRole('button', { name }));
    }
    expect(ai).toContainElement(screen.getByRole('textbox', { name: 'AI request' }));
  });

  it('Clear empties the product details', async () => {
    show();
    const title = await screen.findByRole('textbox', { name: /Title/ });
    expect(title).toHaveValue('Energizer MAX AA Batteries 8-Pack');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear the product details' }));
    expect(title).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /Brand/ })).toHaveValue('');
  });

  it('Suggest sends the AI request in the person’s own words; Enter in the box asks too, without saving', async () => {
    show();
    const request = await screen.findByRole('textbox', { name: 'AI request' });
    const user = userEvent.setup();
    await user.type(request, 'this is the 12-pack{Enter}');
    await waitFor(() => expect(suggestCall()).toBeTruthy());
    expect(suggestCall()?.[1]).toMatchObject({ instruction: 'this is the 12-pack' });
    expect(suggestCall()?.[1]).not.toHaveProperty('duplicate');
    // Nothing was saved: Enter in this box is not "create the product".
    expect(client.post.mock.calls.every(([url]) => url === '/inventory/products/suggest/')).toBe(true);
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Title/ })).toHaveValue('Energizer MAX AA Batteries 12-Pack'));
  });

  it('Suggest with an empty box is the plain suggest', async () => {
    show();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Suggest' }));
    await waitFor(() => expect(suggestCall()).toBeTruthy());
    expect(suggestCall()?.[1]).not.toHaveProperty('instruction');
  });

  it('Duplicate with words in the AI box copies the product and has the AI change the copy', async () => {
    show({ initialProduct: PRODUCT, rowDetailsSeed: undefined, rowDetailsSeedKey: undefined, pagePaste: undefined });
    const request = await screen.findByRole('textbox', { name: 'AI request' });
    fireEvent.change(request, { target: { value: 'the 12-pack' } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(suggestCall()).toBeTruthy());
    expect(suggestCall()?.[1]).toMatchObject({ instruction: 'the 12-pack', duplicate: true });
    // It is a new product now: the heading says create.
    expect(await screen.findByText('Create product details')).toBeInTheDocument();
  });

  it('Duplicate with an empty box is the plain copy: no AI call', async () => {
    show({ initialProduct: PRODUCT, rowDetailsSeed: undefined, rowDetailsSeedKey: undefined, pagePaste: undefined });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Duplicate' }));
    expect(await screen.findByText('Create product details')).toBeInTheDocument();
    expect(suggestCall()).toBeUndefined();
    expect(screen.getByRole('textbox', { name: /Title/ })).toHaveValue('Energizer MAX AA Batteries 8-Pack');
  });
});
