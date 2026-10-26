import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupplyCountPage from './SupplyCountPage';

const api = vi.hoisted(() => ({ getSupplyCount: vi.fn(), submitSupplyCount: vi.fn() }));
vi.mock('../../api/supplies.api', () => api);

const item = (id: number, name: string, last: number | null) => ({
  id, list: 1, name, description: '', vendor: '', vendor_url: '', url: '', vendor_item_id: '', pack_size: 1,
  unit: 'roll', min_qty: 1, max_qty: 5, price: null, sort_order: id, last_count: last, this_count: null,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/supplies/count/1']}>
          <Routes>
            <Route path="/supplies/count/:id" element={<SupplyCountPage />} />
            <Route path="/supplies" element={<div data-testid="lists" />} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('SupplyCountPage', () => {
  beforeEach(() => {
    api.getSupplyCount.mockResolvedValue({
      list: { id: 1, name: 'Processing' },
      cycle: { week_start: '2026-11-02', deadline: '2026-11-02T21:00:00Z' },
      count: null,
      last_count_week: '2026-10-26',
      items: [item(10, 'Tape', 7), item(11, 'Labels', null)],
    });
    api.submitSupplyCount.mockResolvedValue({});
  });

  it('shows last week greyed but never fills it in, and needs every item', async () => {
    renderPage();
    const tape = await screen.findByLabelText('Tape on hand');
    expect(tape).toHaveValue('');
    expect(screen.getByText('7')).toBeInTheDocument();
    await userEvent.type(tape, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Save count' }));
    expect(api.submitSupplyCount).not.toHaveBeenCalled();
    expect(screen.getByText('1 of 2 left')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Labels on hand'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save count' }));
    await waitFor(() => expect(api.submitSupplyCount).toHaveBeenCalledWith(1, [
      { item: 10, on_hand: 3 }, { item: 11, on_hand: 0 },
    ]));
    expect(await screen.findByTestId('lists')).toBeInTheDocument();
  });
});
