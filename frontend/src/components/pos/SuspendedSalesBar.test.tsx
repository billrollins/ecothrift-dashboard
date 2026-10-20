import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SuspendedSalesBar, { tabDetail, tabLabel } from './SuspendedSalesBar';
import type { Cart, SuspendedSaleTab } from '../../types/pos.types';

const api = vi.hoisted(() => ({
  getSuspendedCarts: vi.fn(),
  suspendCart: vi.fn(),
  resumeCart: vi.fn(),
  deleteSuspendedCart: vi.fn(),
}));
vi.mock('../../api/pos.api', () => api);

const ana: SuspendedSaleTab = {
  id: 11,
  member_first_name: 'Ana',
  item_count: 3,
  total: '45.50',
  suspended_at: '2026-10-20T14:14:00',
  cashier_name: 'Pat',
};
const guest: SuspendedSaleTab = { ...ana, id: 12, member_first_name: '', item_count: 1, total: '9.00' };

function renderBar(props: Partial<React.ComponentProps<typeof SuspendedSalesBar>> = {}) {
  const onSuspended = vi.fn();
  const onResumed = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <SuspendedSalesBar
          drawerId={5}
          cart={{ id: 99, lines: [{ id: 1 }] }}
          onSuspended={onSuspended}
          onResumed={onResumed}
          {...props}
        />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return { onSuspended, onResumed };
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getSuspendedCarts.mockResolvedValue({ data: { results: [ana, guest] } });
});

describe('Suspend bar (owner 2026-10-20)', () => {
  it('labels a tab with the member first name, or Sale for a guest, with items, total and time', async () => {
    renderBar();
    const tab = await screen.findByTestId('suspended-tab-11');
    expect(tab).toHaveTextContent('Ana');
    expect(tab).toHaveTextContent('3 items · $45.50');
    expect(screen.getByTestId('suspended-tab-12')).toHaveTextContent('Sale');
    expect(screen.getByTestId('suspended-tab-12')).toHaveTextContent('1 item · $9.00');
    expect(tabLabel(guest)).toBe('Sale');
    expect(tabDetail(ana)).toMatch(/^3 items · \$45\.50 · \d{1,2}:\d{2} (AM|PM)$/);
  });

  it('Suspend sets the sale on screen aside and tells the page to start a new one', async () => {
    api.suspendCart.mockResolvedValue({ data: ana });
    const user = userEvent.setup();
    const { onSuspended } = renderBar();
    await user.click(screen.getByRole('button', { name: /suspend/i }));
    await waitFor(() => expect(onSuspended).toHaveBeenCalled());
    expect(api.suspendCart).toHaveBeenCalledWith(99);
  });

  it('Suspend is off while the sale is empty', async () => {
    renderBar({ cart: { id: 99, lines: [] } });
    expect(screen.getByRole('button', { name: /suspend/i })).toBeDisabled();
    renderBar({ cart: null });
  });

  it('a tab click brings the sale back, setting the sale on screen aside in its place', async () => {
    const fresh = { id: 11, status: 'open', lines: [{ id: 7 }] } as unknown as Cart;
    api.resumeCart.mockResolvedValue({ data: fresh });
    const user = userEvent.setup();
    const { onResumed } = renderBar();
    await user.click(await screen.findByTestId('suspended-tab-11'));
    await waitFor(() => expect(onResumed).toHaveBeenCalledWith(fresh));
    expect(api.resumeCart).toHaveBeenCalledWith(11, 99);
  });

  it('right-click offers Delete suspended sale, and only a confirm deletes it', async () => {
    api.deleteSuspendedCart.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderBar();
    const tab = await screen.findByTestId('suspended-tab-11');

    await user.pointer({ keys: '[MouseRight]', target: tab });
    await user.click(await screen.findByRole('menuitem', { name: 'Delete suspended sale' }));
    expect(await screen.findByText('Delete suspended sale?')).toBeInTheDocument();
    expect(api.deleteSuspendedCart).not.toHaveBeenCalled();

    // Cancel keeps it.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Delete suspended sale?')).not.toBeInTheDocument());
    expect(api.deleteSuspendedCart).not.toHaveBeenCalled();
    expect(api.resumeCart).not.toHaveBeenCalled(); // a right-click never brings the sale back

    // Confirm deletes it.
    await user.pointer({ keys: '[MouseRight]', target: tab });
    await user.click(await screen.findByRole('menuitem', { name: 'Delete suspended sale' }));
    await user.click(await screen.findByRole('button', { name: 'Delete suspended sale' }));
    await waitFor(() => expect(api.deleteSuspendedCart).toHaveBeenCalledWith(11));
  });

  it('shows no bar without a drawer', () => {
    renderBar({ drawerId: null });
    expect(screen.queryByTestId('suspended-sales-bar')).not.toBeInTheDocument();
  });
});
