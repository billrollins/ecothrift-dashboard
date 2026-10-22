import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ObjectModalProvider } from '../../components/objects/ObjectModal';
import { ProcessedItemsView } from './ProcessedItemsView';

const api = vi.hoisted(() => ({ getDashboardProcessedItems: vi.fn() }));
vi.mock('../../api/pos.api', () => api);

describe('ProcessedItemsView', () => {
  it('lists the items one person put on the floor, and goes back to the full search', async () => {
    api.getDashboardProcessedItems.mockResolvedValue({
      data: {
        user_id: 4, name: 'Ana Tester', start: '2026-10-19', end: '2026-10-22', count: 1,
        total_price: '30.00', total_retail: '60.00', page: 1, page_size: 100,
        results: [{
          id: 9, sku: 'ITM0001', title: 'Desk lamp', product_id: 3, status: 'on_shelf', status_label: 'On Shelf',
          price: '30.00', retail: '60.00', processed_on: '2026-10-20',
        }],
      },
    });
    const setParam = vi.fn();
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ThemeProvider theme={createTheme()}>
          <MemoryRouter>
            <ObjectModalProvider>
              <ProcessedItemsView user="4" from="2026-10-19" to="2026-10-22" page={1} setParam={setParam} />
            </ObjectModalProvider>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Put on the floor by Ana Tester')).toBeInTheDocument();
    expect(screen.getByText('Mon 10/19 - Thu 10/22 · 1 item · $30.00 at our price · $60.00 retail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ITM0001' })).toBeInTheDocument();
    expect(screen.getByText('Desk lamp')).toBeInTheDocument();
    expect(api.getDashboardProcessedItems).toHaveBeenCalledWith({ user: '4', start: '2026-10-19', end: '2026-10-22', page: 1 });

    await user.click(screen.getByRole('button', { name: 'Search all inventory' }));
    expect(setParam).toHaveBeenCalledWith({ processed_by: null, from: null, to: null, page: null });
  });
});
