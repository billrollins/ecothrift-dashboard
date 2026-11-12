/**
 * Dash Update #107: search boxes dropped a typed space ("a b" came out "ab") because the box's own text was trimmed on
 * every keystroke, or written trimmed to the URL and read back. Each box here is typed into key by key, with a pause
 * after the space long enough for the debounce to write the URL, and must still read "a b".
 */
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { scanBoxText } from './scanCode';

const inventoryApi = vi.hoisted(() => ({
  searchInventory: vi.fn(async () => ({ data: { results: [], count: 0, page: 1, page_size: 50, q: '' } })),
  getSimilarProducts: vi.fn(),
}));
vi.mock('../api/inventorySearch.api', () => inventoryApi);
const addItemApi = vi.hoisted(() => ({ findAddItemProducts: vi.fn(async () => ({ results: [], q: '', fuzzy: false })) }));
vi.mock('../api/addItem.api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...addItemApi }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'Manager', roles: ['Manager'] }, hasRole: () => true }) }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'Manager' }, hasRole: () => true }) }));
vi.mock('../hooks/useDelivery', () => ({
  useDeliveryDayMutations: () => ({ create: { mutateAsync: vi.fn() }, update: { mutateAsync: vi.fn() }, archive: { mutateAsync: vi.fn() } }),
  useDeliveryDays: () => ({ data: { count: 0, results: [] }, isLoading: false, isError: false }),
  useDeliveriesSearch: () => ({ data: { count: 0, results: [] }, isLoading: false }),
  useDeliveryMutations: () => ({ archive: { mutateAsync: vi.fn() }, restore: { mutateAsync: vi.fn() }, create: { mutateAsync: vi.fn() } }),
}));
vi.mock('../hooks/usePOS', () => ({ useDeliveryAvailabilities: () => ({ data: [] }) }));
vi.mock('@mui/x-data-grid', () => ({ DataGrid: () => <div data-testid="data-grid-stub" /> }));

function wrap(ui: ReactNode, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

/** Types "a b" one key at a time, pausing after the space past every box's debounce (200-300 ms). */
async function typeAB(box: HTMLElement) {
  const user = userEvent.setup();
  await user.click(box);
  await user.keyboard('a');
  await user.keyboard(' ');
  await act(() => new Promise((r) => window.setTimeout(r, 450)));
  await user.keyboard('b');
  expect(box).toHaveValue('a b');
}

describe('search boxes keep a typed space (#107)', () => {
  it('scanBoxText keeps text as typed, key by key, and still turns a whole tag link into its SKU', () => {
    expect([...'a b'].reduce((text, key) => scanBoxText(text + key), '')).toBe('a b');
    expect(scanBoxText('lamp ')).toBe('lamp ');
    expect(scanBoxText('HTTPS://ECOTHRIFT.US/I/ITM0226342')).toBe('ITM0226342');
  });

  it('Inventory search', async () => {
    const { default: InventorySearchPage } = await import('../pages/inventory/InventorySearchPage');
    wrap(<InventorySearchPage />, '/inventory/search');
    await typeAB(screen.getByRole('textbox', { name: 'Search inventory' }));
    await act(() => new Promise((r) => window.setTimeout(r, 300)));
    expect(inventoryApi.searchInventory).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'a b' }), expect.anything());
  });

  it('Add item search', async () => {
    const { AddItemFindStep } = await import('../pages/inventory/addItem/AddItemFindStep');
    wrap(<AddItemFindStep initialQuery="" onUse={vi.fn()} onCopy={vi.fn()} onAiFill={vi.fn()} onTypeIt={vi.fn()} />, '/');
    await typeAB(screen.getByRole('textbox', { name: 'Find the product' }));
  });

  it('Deliveries desk: Days', async () => {
    const { default: DeskDaysPage } = await import('../pages/pos/deliveries/desk/DeskDaysPage');
    wrap(<DeskDaysPage />, '/pos/deliveries/desk/days');
    await typeAB(screen.getAllByRole('textbox')[0]);
  });

  it('Deliveries desk: Total deliveries', async () => {
    const { default: DeskTotalDeliveriesPage } = await import('../pages/pos/deliveries/desk/DeskTotalDeliveriesPage');
    wrap(<DeskTotalDeliveriesPage />, '/pos/deliveries/desk/total');
    await typeAB(screen.getAllByRole('textbox')[0]);
  });
});
