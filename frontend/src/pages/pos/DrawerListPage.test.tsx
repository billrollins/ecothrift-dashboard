import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import DrawerListPage from './DrawerListPage';

function apiError(data: Record<string, unknown>) {
  return Object.assign(new Error('http'), { response: { data } });
}

const m = vi.hoisted(() => ({
  manager: false,
  close: vi.fn(),
  handoff: vi.fn(),
  drop: vi.fn(),
  move: vi.fn(),
}));

const DRAWER = {
  id: 7, register: 1, register_name: 'Front', register_code: 'R1', date: '2026-10-22', status: 'open',
  current_cashier: 3, current_cashier_name: 'Cara Cashier', opened_by: 3, opened_by_name: 'Cara Cashier',
  opened_at: '2026-10-22T14:00:00Z', opening_count: {}, opening_total: '150.00', closed_by: null, closed_by_name: null,
  closed_at: null, closing_count: null, closing_total: null, cash_sales_total: '212.40', expected_cash: null,
  variance: null, handoffs: [], drops: [], movements: [],
};

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3 }, hasRole: (r: string) => m.manager && (r === 'Manager' || r === 'Admin') }),
}));
vi.mock('../../hooks/useDeviceConfig', () => ({
  useDeviceConfig: () => ({ config: { deviceType: 'register', registerId: 1 } }),
}));
vi.mock('../../hooks/useEmployees', () => ({
  useUsers: () => ({ data: { results: [{ id: 3, full_name: 'Cara Cashier' }, { id: 4, full_name: 'Dee Next' }] } }),
}));
vi.mock('../../hooks/usePOS', () => {
  const mutation = (fn: (args: unknown) => unknown) => ({ mutateAsync: fn, isPending: false });
  return {
    useRegisters: () => ({ data: { results: [{ id: 1, name: 'Front', code: 'R1' }] }, isLoading: false }),
    useDrawers: () => ({ data: { results: [DRAWER] }, isLoading: false }),
    useOpenDrawer: () => mutation(vi.fn()),
    useCloseDrawer: () => mutation(m.close),
    useReopenDrawer: () => mutation(vi.fn()),
    useDrawerHandoff: () => mutation(m.handoff),
  };
});
vi.mock('../../hooks/useCashManagement', () => ({
  useCashDrop: () => ({ mutateAsync: m.drop, isPending: false }),
}));
vi.mock('../../api/pos.api', () => ({ moveDrawerCash: m.move }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={createTheme()}>
        <SnackbarProvider>
          <MemoryRouter>
            <DrawerListPage />
          </MemoryRouter>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

/** The DenominationCounter field for one bill or coin, by its label ("$20", "25¢"...). */
function qty(dialog: HTMLElement, label: string) {
  return within(dialog).getByLabelText(label);
}

describe('Drawers page: a drawer\'s life (2026-10-21)', () => {
  it('a cashier does not see the running cash total (counts are blind)', () => {
    m.manager = false;
    renderPage();
    expect(screen.getByText(/Opening: \$150\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/Cash sales/)).toBeNull();
  });

  it('close: bills by hand, the coin counter total, a note asked for when far off, then the difference after', async () => {
    m.manager = false;
    const user = userEvent.setup();
    m.close.mockReset();
    m.close
      .mockRejectedValueOnce(apiError({ code: 'NOTE_REQUIRED', detail: 'The count is more than $5.00 off. Add a note saying why.' }))
      .mockResolvedValueOnce({
        ...DRAWER, status: 'closed',
        count_check: {
          rows: [{ key: 'twenties', label: '$20', counted: 10, expected: 11, difference: -1 }],
          counted_total: '342.40', expected_total: '362.40', difference_total: '-20.00',
        },
      });
    renderPage();
    await user.click(screen.getByRole('button', { name: /Close drawer/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/Expected/)).toBeNull();
    await user.clear(qty(dialog, '$20'));
    await user.type(qty(dialog, '$20'), '10');
    await user.click(within(dialog).getByLabelText('Coin counter total'));
    await user.type(within(dialog).getByRole('textbox', { name: 'Coin counter total' }), '12.40');
    await user.click(within(dialog).getByRole('button', { name: 'Close drawer' }));

    expect(await within(dialog).findByTestId('close-note-needed')).toHaveTextContent('more than $5.00 off');
    const first = m.close.mock.calls[0][0] as { id: number; data: Record<string, unknown> };
    expect(first.id).toBe(7);
    expect(first.data.coins_total).toBe('12.40');
    expect((first.data.closing_count as Record<string, number>).twenties).toBe(10);
    expect((first.data.closing_count as Record<string, number>).quarters).toBe(0);
    expect(first.data.note).toBeUndefined();

    await user.type(within(dialog).getByLabelText('Note (needed)'), 'Gave a $20 too many in change');
    await user.click(within(dialog).getByRole('button', { name: 'Close drawer' }));
    const check = await screen.findByTestId('count-check');
    expect(check).toHaveTextContent('Short $20.00');
    expect(check).toHaveTextContent('Counted $342.40 · expected $362.40');
    expect((m.close.mock.calls[1][0] as { data: Record<string, unknown> }).data.note).toBe('Gave a $20 too many in change');
  });

  it('handoff counts the bills only', async () => {
    m.manager = true;
    const user = userEvent.setup();
    m.handoff.mockReset();
    m.handoff.mockResolvedValueOnce({
      id: 1, count_check: { rows: [], counted_total: '200.00', expected_total: '200.00', difference_total: '0.00' },
    });
    renderPage();
    await user.click(screen.getByRole('button', { name: /Handoff/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('25¢')).toBeNull();
    await user.type(qty(dialog, '$20'), '10');
    await user.click(within(dialog).getByRole('combobox', { name: 'Incoming cashier' }));
    await user.click(await screen.findByRole('option', { name: 'Dee Next' }));
    await user.click(within(dialog).getByRole('button', { name: 'Handoff' }));
    await waitFor(() => expect(m.handoff).toHaveBeenCalled());
    const sent = m.handoff.mock.calls[0][0] as { data: { incoming_cashier: number; count: Record<string, number> } };
    expect(sent.data.incoming_cashier).toBe(4);
    expect(sent.data.count.twenties).toBe(10);
    expect(sent.data.count.quarters).toBe(0);
    expect(await screen.findByTestId('count-check')).toHaveTextContent('Right on');
  });

  it('drops and paid out say why', async () => {
    m.manager = false;
    const user = userEvent.setup();
    m.drop.mockReset();
    m.move.mockReset();
    m.move.mockResolvedValue({ data: {} });
    m.drop.mockResolvedValue({});
    renderPage();

    await user.click(screen.getByRole('button', { name: /Cash drop/ }));
    let dialog = await screen.findByRole('dialog');
    await user.type(qty(dialog, '$100'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Drop' }));
    expect(m.drop).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Too much cash');
    await user.click(within(dialog).getByRole('button', { name: 'Drop' }));
    await waitFor(() => expect(m.drop).toHaveBeenCalledWith({
      drawerId: 7, data: expect.objectContaining({ total: '200.00', reason: 'Too much cash' }),
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Paid out' }));
    dialog = await screen.findByRole('dialog');
    await user.type(qty(dialog, '$5'), '1');
    await user.type(within(dialog).getByLabelText(/What it is for/), 'Paper towels');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.move).toHaveBeenCalledWith(7, 'paid-out', expect.objectContaining({
      total: '5.00', reason: 'Paper towels',
    })));
  });
});
