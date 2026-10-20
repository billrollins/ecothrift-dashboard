import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ThriftPendingPerson } from '../../api/thriftplusRegister.api';
import type { Cart } from '../../types/pos.types';
import ThriftPlusSignupDialog from './ThriftPlusSignupDialog';

/** Owner 2026-10-15 (J8): joined online with a name and email; the register finishes joining. */
const CARA = vi.hoisted<ThriftPendingPerson>(() => ({
  person_id: 21, account_id: 8, first_name: 'Cara', last_name: 'Joyner', email: 'cara@example.com',
  joined_at: '2026-10-15T15:00:00Z', code_last4: '8904',
}));

vi.mock('../../api/thriftplus.api', () => ({
  fetchEmailNote: async () => ({ note: "We'll email your receipts and Thrift+ updates." }),
  createMember: async () => ({ people: [{ id: 9 }] }),
}));

vi.mock('../../api/thriftplusRegister.api', () => ({
  findPendingJoins: async (q: string) => (!q || 'cara joyner cara@example.com'.includes(q.toLowerCase()) ? [CARA] : []),
  attachThriftMember: async () => ({}),
  reringThriftMember: async () => ({}),
  thriftErrorMessage: (_err: unknown, fallback = 'error') => fallback,
}));

const openCart = {
  id: 3, drawer: 1, cashier: 1, cashier_name: 'Pat', customer: null, status: 'open', subtotal: '40.00', tax_rate: '0.0700',
  tax_amount: '2.80', total: '42.80', payment_method: 'cash', cash_tendered: null, change_given: null, card_amount: null,
  completed_at: null, created_at: '2026-10-21T15:00:00Z', lines: [], thrift_credit: '0.00', thrift_plus: null,
} as unknown as Cart;

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={createTheme()}>
        <SnackbarProvider>{node}</SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('Thrift+ finish joining dialog (now the training register only; owner 2026-10-20)', () => {
  it('a real register signs no one up: it finds an online join to finish, or shows the Join QR (owner 2026-10-16)', async () => {
    const user = userEvent.setup();
    const onFinishJoin = vi.fn();
    const onClose = vi.fn();
    wrap(<ThriftPlusSignupDialog open onClose={onClose} cart={openCart} lastSale={null} onCart={() => undefined} onFinishJoin={onFinishJoin} />);
    expect(screen.getByText('Thrift+ finish joining')).toBeInTheDocument();
    expect(screen.getByText(/New members join on their phone at ecothrift.us\/join/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join QR' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign up' })).toBeNull();
    expect(screen.queryByLabelText(/First name/)).toBeNull();
    await user.click(await screen.findByText('Cara Joyner'));
    expect(onFinishJoin).toHaveBeenCalledWith(CARA);
    expect(onClose).toHaveBeenCalled();
  });
});
