import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { describe, expect, it, vi } from 'vitest';
import SafeCard from './SafeCard';

const m = vi.hoisted(() => ({ swap: vi.fn(), deposit: vi.fn(), change: vi.fn(), data: null as unknown }));
vi.mock('../../hooks/useSafe', async (orig) => ({
  ...(await orig<typeof import('../../hooks/useSafe')>()),
  useSafe: () => ({ data: m.data, isLoading: false }),
  safeSwap: m.swap,
  recordDeposit: m.deposit,
  recordChange: m.change,
  useBankDeposits: () => ({ data: {
    bags: [
      { kind: 'drop', ref: 5, at: '2026-11-02T15:00:00Z', register: 'Register 1', total: '200.00', count: { hundreds: 2 }, note: '' },
      { kind: 'close_out', ref: 9, at: '2026-11-01T23:00:00Z', register: 'Register 2', total: '60.00', count: { twenties: 3 }, note: '' },
    ],
    pending: [{ id: 4, at: '2026-11-01T12:00:00Z', who: 'Carrie', total: '350.00', status: 'pending', source: 'office',
      bags_total: '350.00', difference: '0.00', bags: 2 }],
  } }),
}));

const DATA = {
  owner: false,
  safe: { balance: { ones: 200, quarters: 400 }, total: '300.00', last_counted_at: null, last_counted_by: null },
  office: { balance: { twenties: 30, ones: 10 }, total: '610.00' },
  target: { count: { twenties: 10, ones: 50 }, total: '250.00', cap: '500.00' },
  needs_swap: true,
  short: { ones: 40 },
  over_cap: true,
  suggested: { take_from_safe: { ones: 40 }, put_in_safe: { twenties: 20 } },
  lines: [],
};

describe('The safe on the Cash page (Retail 5, 2026-11-02)', () => {
  it('says why the office needs a swap and opens the swap with Dash\'s suggestion', async () => {
    m.data = DATA;
    m.swap.mockResolvedValue({ data: { ...DATA, needs_swap: false } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SnackbarProvider><SafeCard /></SnackbarProvider>
      </QueryClientProvider>,
    );
    const alert = screen.getByTestId('safe-needs-swap');
    expect(alert).toHaveTextContent('Short: 40 × $1');
    expect(alert).toHaveTextContent('Over the cap of $500.00');
    expect(screen.queryByRole('button', { name: 'What the office should hold' })).toBeNull(); // the owner's
    await user.click(screen.getByRole('button', { name: 'Swap with the safe' }));
    const win = await screen.findByTestId('safe-swap');
    const submit = within(win).getByTestId('safe-swap-submit');
    expect(submit).toHaveTextContent('out $40.00 · in $400.00');
    await user.click(submit);
    await waitFor(() => expect(m.swap).toHaveBeenCalledWith({ twenties: 20 }, { ones: 40 }));
  });

  it('a deposit: tick the bags, the count follows their bills, then record it from the office', async () => {
    m.data = { ...DATA, needs_swap: false };
    m.deposit.mockResolvedValue({ data: { bags: [], pending: [] } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SnackbarProvider><SafeCard /></SnackbarProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('deposit-pending')).toHaveTextContent('Deposit waiting for the bank: $350.00');
    await user.click(screen.getByTestId('deposit-open'));
    const win = await screen.findByTestId('deposit-window');
    await user.click(within(win).getByLabelText(/Register 1 · drop/));
    await user.click(within(win).getByLabelText(/Register 2 · close-out/));
    expect(within(win).getByTestId('deposit-vs-bags')).toHaveTextContent('The bags say $260.00 · Counted $260.00 ✓');
    await user.click(within(win).getByTestId('deposit-submit'));
    await waitFor(() => expect(m.deposit).toHaveBeenCalledWith(
      [{ kind: 'drop', ref: 5 }, { kind: 'close_out', ref: 9 }], { hundreds: 2, twenties: 3 }, 'office', '',
    ));
  });

  it('change from the bank goes into the safe unless the office is picked', async () => {
    m.data = { ...DATA, needs_swap: false };
    m.change.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SnackbarProvider><SafeCard /></SnackbarProvider>
      </QueryClientProvider>,
    );
    await user.click(screen.getByTestId('change-open'));
    const win = await screen.findByTestId('count-window');
    await user.click(within(win).getByRole('button', { name: 'Office' }));
    await user.type(within(win).getByTestId('count-quarters'), '80');
    expect(within(win).getByTestId('count-submit')).toHaveTextContent('Record change · $20.00');
    await user.click(within(win).getByTestId('count-submit'));
    await waitFor(() => expect(m.change).toHaveBeenCalledWith({ quarters: 80 }, 'office'));
  });
});
