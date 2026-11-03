import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupplyListPage from './SupplyListPage';
import { unitCostText } from './supplyBits';

const api = vi.hoisted(() => ({
  getSupplyList: vi.fn(),
  addSupplyItem: vi.fn(),
  aiFillSupply: vi.fn(),
  downloadSupplyTemplate: vi.fn(),
  importSupplyCsv: vi.fn(),
  removeSupplyItem: vi.fn(),
  updateSupplyItem: vi.fn(),
  updateSupplyList: vi.fn(),
}));
vi.mock('../../api/supplies.api', () => api);

const LIST = {
  id: 1, name: 'Processing', department: null, department_name: 'Processing', is_active: true, sort_order: 0,
  items: [], can_edit: true, count: null, cycle: { deadline: '2026-11-09T22:00:00Z' },
};
const FILL = {
  name: 'Tape gun', description: '2 in, pistol grip', vendor: 'Uline', vendor_url: 'https://www.uline.com',
  url: 'https://www.uline.com/Product/Detail/H-150', vendor_item_id: 'H-150', price: '24.00', unit_cost: '4.00',
  pack_size: 6, unit: 'each', model: 'm', price_found: true,
  ai_fields: ['name', 'description', 'vendor', 'vendor_url', 'url', 'vendor_item_id', 'price', 'pack_size', 'unit'],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/supplies/lists/1']}>
          <Routes><Route path="/supplies/lists/:id" element={<SupplyListPage />} /></Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

async function openPaste() {
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: 'Add item' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Paste the product page'), { target: { value: 'H-150 Tape gun ... $24.00' } });
  return dialog;
}

describe('SupplyListPage paste the product page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getSupplyList.mockResolvedValue(LIST);
    api.addSupplyItem.mockResolvedValue({});
  });

  it('fills from page text alone, marks AI fields, and saves only on Save', async () => {
    api.aiFillSupply.mockResolvedValue(FILL);
    const dialog = await openPaste();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fill with AI' }));
    await waitFor(() => expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Tape gun'));
    expect(api.aiFillSupply).toHaveBeenCalledWith({ url: '', page_text: 'H-150 Tape gun ... $24.00' });
    expect(api.addSupplyItem).not.toHaveBeenCalled();
    expect(within(dialog).getAllByText('AI')).toHaveLength(9);
    expect(within(dialog).getByText('$4.00 a unit')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/^Name/), ' 2');
    expect(within(dialog).getAllByText('AI')).toHaveLength(8);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.addSupplyItem).toHaveBeenCalledWith(1, expect.objectContaining({
      name: 'Tape gun 2', vendor: 'Uline', vendor_item_id: 'H-150', pack_size: 6, price: '24.00',
    })));
  });

  it('shows the plain message for junk', async () => {
    api.aiFillSupply.mockRejectedValue({ isAxiosError: true, response: { data: { detail: "That doesn't look like a product page." } } });
    const dialog = await openPaste();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fill with AI' }));
    expect(await within(dialog).findByText(/doesn't look like a product page/)).toBeInTheDocument();
  });
});

describe('unitCostText', () => {
  it('spreads the pack price', () => {
    expect(unitCostText('$18.50', '6')).toBe('$3.08 a unit');
    expect(unitCostText('', '6')).toBe('');
    expect(unitCostText('abc', '6')).toBe('');
  });
});
