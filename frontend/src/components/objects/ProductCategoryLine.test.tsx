import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductCategoryLine, productCategoryText } from './ProductCategoryLine';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../api/client', () => ({ default: client }));

const TAXONOMY = [
  { name: 'Electronics', subcategories: ['Cables, chargers & power', 'Phones & tablets', 'Phone & tablet cases'] },
  { name: 'Mixed lots & uncategorized', subcategories: [] },
];

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider theme={createTheme()}>
        <SnackbarProvider>{ui}</SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  client.get.mockReset();
  client.post.mockReset();
});

describe('Edit category', () => {
  it('joins category and subcategory', () => {
    expect(productCategoryText('Electronics', 'Phones & tablets')).toBe('Electronics › Phones & tablets');
    expect(productCategoryText('Mixed lots & uncategorized', '')).toBe('Mixed lots & uncategorized');
  });

  it('shows the category and saves a new subcategory from the taxonomy', async () => {
    client.get.mockImplementation((url: string) => Promise.resolve({
      data: url.endsWith('/taxonomy/')
        ? { categories: TAXONOMY }
        : { product_id: 7, category: 'Electronics', subcategory: 'Phone & tablet cases' },
    }));
    client.post.mockResolvedValue({ data: { product_id: 7, category: 'Electronics', subcategory: 'Phones & tablets' } });
    const user = userEvent.setup();
    wrap(<ProductCategoryLine productId={7} label />);

    expect(await screen.findByText('Electronics › Phone & tablet cases')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit category' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Subcategory' })).toBeInTheDocument());
    await user.click(within(dialog).getByRole('combobox', { name: 'Subcategory' }));
    await user.click(await screen.findByRole('option', { name: 'Phones & tablets' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(client.post).toHaveBeenCalledWith(
      '/inventory/products/7/category/', { category: 'Electronics', subcategory: 'Phones & tablets' },
    ));
    expect(await screen.findByText('Electronics › Phones & tablets')).toBeInTheDocument();
  });

  it('shows the fallback while the product has no category', async () => {
    client.get.mockResolvedValue({ data: { product_id: 8, category: '', subcategory: '' } });
    wrap(<ProductCategoryLine productId={8} fallback="Kitchen" />);
    expect(await screen.findByText('Kitchen')).toBeInTheDocument();
  });
});
