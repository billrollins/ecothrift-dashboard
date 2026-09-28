import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Cart, ThriftPlusCartBlock } from '../../types/pos.types';
import ThriftPlusPanel from './ThriftPlusPanel';
import ThriftPlusReturnDialog from './ThriftPlusReturnDialog';

const calls = vi.hoisted(() => ({ choice: [] as string[], returned: [] as unknown[] }));

vi.mock('../../api/thriftplusRegister.api', () => ({
  detachThriftCard: async () => ({}),
  refreshCart: async () => ({}),
  spendThriftBalance: async () => ({}),
  uploadThriftSalePhoto: async () => undefined,
  setThriftChoice: async (_id: number, choice: string) => {
    calls.choice.push(choice);
    return {};
  },
  thriftErrorMessage: () => 'error',
  lookupThriftReturns: async () => ({
    member: { name: 'Ana', account_id: 1, photo_url: null, banked: '0.00', credit: '0.00' },
    lines: [
      { cart_line: 7, cart: 3, sku: 'ITM1', title: 'Brass lamp', paid: '82.65', sold_at: '2026-10-21T15:00:00Z', deadline: '2026-10-24', photos: [], ok: true, problems: [] },
      { cart_line: 8, cart: 3, sku: 'ITM2', title: 'Wool sweater', paid: '10.70', sold_at: '2026-10-21T15:00:00Z', deadline: '2026-10-24', photos: [], ok: false, problems: ['Apparel & accessories is final sale.'] },
    ],
  }),
  returnThriftItem: async (body: unknown) => {
    calls.returned.push(body);
    return { id: 1, credit: '82.65' };
  },
}));

const totals = {
  item_count: 1, price_total: '90.00', reward_total: '13.00', to_cover: '10.00', savings: '3.00', to_bank: '0.00', member_total: '87.00',
};

function cartWith(block: ThriftPlusCartBlock): Cart {
  return {
    id: 3, drawer: 1, cashier: 1, cashier_name: 'Pat', customer: null, status: 'open', subtotal: '87.00', tax_rate: '0.0700',
    tax_amount: '6.09', total: '93.09', payment_method: 'cash', cash_tendered: null, change_given: null, card_amount: null,
    completed_at: null, created_at: '2026-10-21T15:00:00Z', lines: [], thrift_credit: '0.00', thrift_plus: block,
  };
}

function wrap(node: ReactNode) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <SnackbarProvider>{node}</SnackbarProvider>
    </ThemeProvider>,
  );
}

describe('Thrift+ at the register', () => {
  it('asks a guest for a card and shows what they would lose', () => {
    wrap(
      <ThriftPlusPanel
        cart={cartWith({ live: true, member: null, guest_line: 'No Thrift+ card today. You lost $3.00', totals, lines: {}, restricted_line_ids: [], amount_due: '93.09' })}
        onCart={() => undefined}
      />,
    );
    expect(screen.getByText(/Do you have a card yet/)).toBeInTheDocument();
    expect(screen.getByText('No Thrift+ card today. You lost $3.00')).toBeInTheDocument();
  });

  it('shows the member, their cover, and switches to banking', async () => {
    const user = userEvent.setup();
    wrap(
      <ThriftPlusPanel
        cart={cartWith({
          live: true,
          member: {
            account_id: 1, person_id: 1, name: 'Ana', role: 'primary', photo_url: null, verified_18: true, card_last4: '0008',
            choice: 'instant', rering: false, banked: '0.00', credit: '0.00',
            cover: { month: '2026-10', amount: '10.00', covered: '4.00', remaining: '6.00', is_covered: false, resets_on: '2026-11-01' },
          },
          guest_line: '', totals, lines: {}, restricted_line_ids: [], amount_due: '93.09',
        })}
        onCart={() => undefined}
      />,
    );
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('18+ verified')).toBeInTheDocument();
    expect(screen.getByText(/Cover this month: \$4\.00 of \$10\.00/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Bank/ }));
    expect(calls.choice).toEqual(['bank']);
  });

  it('takes a member return: scan, pick an item that can come back, confirm, credit', async () => {
    const user = userEvent.setup();
    wrap(<ThriftPlusReturnDialog open onClose={() => undefined} />);
    await user.type(screen.getByLabelText("Scan the member's card"), 'TP100000000008');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Apparel & accessories is final sale.')).toBeInTheDocument();
    await user.click(screen.getByText(/Brass lamp/));
    const give = screen.getByRole('button', { name: /Give \$82\.65 store credit/ });
    expect(give).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(give);
    expect(calls.returned).toEqual([{ code: '100000000008', cart_line: 7, confirmed: true, note: '' }]);
  });
});
