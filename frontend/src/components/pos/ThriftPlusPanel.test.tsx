import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cart, ThriftPlusCartBlock } from '../../types/pos.types';
import ThriftPlusPanel from './ThriftPlusPanel';
import ThriftPlusReturnDialog from './ThriftPlusReturnDialog';
import ThriftPlusSignupDialog from './ThriftPlusSignupDialog';

const calls = vi.hoisted(() => ({
  choice: [] as string[],
  bucks: [] as Array<[number, boolean]>,
  returned: [] as unknown[],
  lookups: [] as unknown[],
  phones: [] as string[],
  attached: [] as Array<[number, number]>,
  rerung: [] as Array<[number, number]>,
  created: [] as unknown[],
  training: false,
}));

/** Two adults on one membership share a phone (owner 2026-10-14: find them by phone, pick by the photo). */
const PEOPLE = vi.hoisted(() => [
  { person_id: 5, account_id: 1, first_name: 'Ana', last_initial: 'D', role: 'primary', photo_url: '/media/ana.jpg',
    verified_18: true, practice: false, account_status: 'active' },
  { person_id: 6, account_id: 1, first_name: 'Ben', last_initial: 'D', role: 'secondary', photo_url: null,
    verified_18: false, practice: false, account_status: 'active' },
]);

vi.mock('../../api/thriftplus.api', () => ({
  fetchEmailNote: async () => ({ note: "We'll email your receipts and Thrift+ updates." }),
  createMember: async (body: unknown) => {
    calls.created.push(body);
    return { id: 1, status: 'active', notes: '', revoked_at: null, revoked_reason: '', created_at: '', people: [{ id: 9, cards: [] }] };
  },
}));

vi.mock('../../api/thriftplusRegister.api', () => ({
  findThriftMembers: async (phone: string) => {
    calls.phones.push(phone);
    return phone.replace(/\D/g, '').endsWith('5550101') ? PEOPLE : [];
  },
  attachThriftMember: async (cartId: number, personId: number) => {
    calls.attached.push([cartId, personId]);
    return {};
  },
  reringThriftMember: async (cartId: number, personId: number) => {
    calls.rerung.push([cartId, personId]);
    return { thrift_plus: { collected: '35.00', use_by: '2026-11-19', member: { name: 'Cy Lee' } } };
  },
  detachThriftCard: async () => ({}),
  refreshCart: async () => ({}),
  uploadThriftSalePhoto: async () => undefined,
  setThriftChoice: async (_id: number, choice: string) => {
    calls.choice.push(choice);
    return {};
  },
  useThriftBucks: async (id: number, use: boolean) => {
    calls.bucks.push([id, use]);
    return {};
  },
  thriftErrorMessage: () => 'error',
  lookupThriftReturns: async (who: unknown) => {
    calls.lookups.push(who);
    return {
    member: { name: 'Ana', account_id: 1, photo_url: null, banked: '0.00', credit: '0.00' },
    lines: [
      {
        cart_line: 7, cart: 3, sku: 'ITM1', title: 'Brass lamp', mark: '3-day return', refund: '68.48', bucks_back: '0.00',
        bucks_take: '28.00', sold_at: '2026-10-21T15:00:00Z', deadline: '2026-10-24', photos: [], ok: true, problem: '',
      },
      {
        cart_line: 8, cart: 3, sku: 'ITM2', title: 'Wool sweater', mark: 'AS IS', refund: '0.00', bucks_back: '0.00',
        bucks_take: '0.00', sold_at: '2026-10-21T15:00:00Z', deadline: '2026-10-24', photos: [], ok: false,
        problem: 'Sold AS IS: no 3-day return.',
      },
    ],
    };
  },
  returnThriftItem: async (body: unknown) => {
    calls.returned.push(body);
    return { id: calls.training ? null : 1, credit: '68.48', bucks_back: '0.00', bucks_taken: '28.00', shortfall: '0.00', training: calls.training };
  },
}));

beforeEach(() => {
  calls.choice = [];
  calls.bucks = [];
  calls.returned = [];
  calls.lookups = [];
  calls.phones = [];
  calls.attached = [];
  calls.rerung = [];
  calls.created = [];
  calls.training = false;
});

/** Owner 2026-10-14: there is no Thrift+ card. No Thrift+ screen at the register says "card". */
const CARD = /\bcards?\b/i;

function expectNoCardWords() {
  expect(document.body.textContent ?? '').not.toMatch(CARD);
  document.body.querySelectorAll('input').forEach((input) => {
    const label = input.labels?.[0]?.textContent ?? '';
    expect(`${label} ${input.placeholder}`).not.toMatch(CARD);
  });
}

const MEMBER = {
  account_id: 1, person_id: 1, name: 'Ana', role: 'primary' as const, photo_url: null, verified_18: true, card_last4: '0008',
  practice: false, choice: 'bank' as const, rering: false,
};

/** F3 / B14: $80 tag, 35 ThriftBucks collected, 7% tax. */
function block(over: Partial<ThriftPlusCartBlock> = {}): ThriftPlusCartBlock {
  return {
    live: true,
    member: MEMBER,
    instant_offered: true,
    instant_reason: '',
    instant_share: '0.50',
    collected: '35.00',
    use_by: '2026-11-19',
    instant_bucks: '0.00',
    instant_off: '0.00',
    bucks_auto: true,
    bucks_available: '0.00',
    bucks_used: '0.00',
    credit_available: '0.00',
    credit_used: '0.00',
    balances: { bucks: '0.00', bucks_use_by: null, credit: '0.00' },
    guest_line: '',
    lines: {},
    bucks_line_id: null,
    restricted_line_ids: [],
    amount_due: '85.60',
    ...over,
  };
}

function cartWith(b: ThriftPlusCartBlock): Cart {
  return {
    id: 3, drawer: 1, cashier: 1, cashier_name: 'Pat', customer: null, status: 'open', subtotal: '80.00', tax_rate: '0.0700',
    tax_amount: '5.60', total: '85.60', payment_method: 'cash', cash_tendered: null, change_given: null, card_amount: null,
    completed_at: null, created_at: '2026-10-21T15:00:00Z', lines: [], thrift_credit: b.credit_used, thrift_plus: b,
  };
}

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

describe('Thrift+ at the register', () => {
  it('asks a guest for their app QR or phone, and shows what the trip would have collected', () => {
    const line = 'This trip would have collected 35.00 ThriftBucks.';
    wrap(<ThriftPlusPanel cart={cartWith(block({ member: null, instant_offered: false, guest_line: line }))} onCart={() => undefined} />);
    expect(screen.getByText('A Thrift+ member? Scan the QR in their Thrift+ app, or find them by phone.')).toBeInTheDocument();
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    expectNoCardWords();
  });

  it('finds a member by phone, shows both adults with their photos, and puts the one picked on the sale', async () => {
    const user = userEvent.setup();
    const onCart = vi.fn();
    wrap(<ThriftPlusPanel cart={cartWith(block({ member: null, instant_offered: false }))} onCart={onCart} />);
    const find = screen.getByRole('button', { name: 'Find' });
    await user.type(screen.getByLabelText('Phone number'), '555-01');
    expect(find).toBeDisabled(); // under 7 digits
    await user.type(screen.getByLabelText('Phone number'), '01');
    await user.click(find);
    const people = await screen.findByTestId('thrift-phone-people');
    expect(calls.phones).toEqual(['555-0101']);
    expect(within(people).getByText('Ana D.')).toBeInTheDocument();
    expect(within(people).getByText('Ben D.')).toBeInTheDocument();
    expect(within(people).getByAltText('Ana D.')).toHaveAttribute('src', '/media/ana.jpg');
    expect(within(people).getByText('Second adult')).toBeInTheDocument();
    expect(within(people).getByText('Not ID-checked')).toBeInTheDocument();
    expect(screen.getByText('Pick the person: check their face against the photo.')).toBeInTheDocument();
    expectNoCardWords();
    await user.click(within(people).getByText('Ben D.'));
    expect(calls.attached).toEqual([[3, 6]]);
    expect(onCart).toHaveBeenCalled();
  });

  it('says so when no member has that phone', async () => {
    const user = userEvent.setup();
    wrap(<ThriftPlusPanel cart={cartWith(block({ member: null, instant_offered: false }))} onCart={() => undefined} />);
    await user.type(screen.getByLabelText('Phone number'), '(402) 555-9999{Enter}');
    expect(await screen.findByText('No member with that phone number.')).toBeInTheDocument();
    expect(calls.attached).toEqual([]);
  });

  it('shows the member on the sale with no card and no last 4', () => {
    wrap(<ThriftPlusPanel cart={cartWith(block({ credit_used: '10.00', amount_due: '75.60' }))} onCart={() => undefined} />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText(/0008/)).not.toBeInTheDocument();
    expect(screen.getByText('Still to pay: $75.60.')).toBeInTheDocument();
    expectNoCardWords();
  });

  it('shows the V4 choice: keep (the Default) or redeem instantly, and switches to instant', async () => {
    const user = userEvent.setup();
    wrap(<ThriftPlusPanel cart={cartWith(block())} onCart={() => undefined} />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('18+ verified')).toBeInTheDocument();
    const keep = screen.getByRole('button', { name: 'Keep 35.00 ThriftBucks (Default)' });
    expect(keep).toHaveAttribute('aria-pressed', 'true');
    const instant = screen.getByRole('button', { name: 'or redeem instantly: $17.50 off today' });
    expect(instant).toBeEnabled();
    expect(screen.getByText(/use by Nov 19/)).toBeInTheDocument();
    await user.click(instant);
    expect(calls.choice).toEqual(['instant']);
  });

  it('shows instant redemption disabled, with the reason, when it is not offered', () => {
    wrap(
      <ThriftPlusPanel
        cart={cartWith(block({ instant_offered: false, instant_reason: 'Thrift+ credit and kept ThriftBucks cover this trip.' }))}
        onCart={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: /redeem instantly/ })).toBeDisabled();
    expect(screen.getByText('Thrift+ credit and kept ThriftBucks cover this trip.')).toBeInTheDocument();
  });

  it('uses Thrift+ credit first and kept ThriftBucks automatically, with a one-tap "don\'t use them today" (B14)', async () => {
    const user = userEvent.setup();
    const b = block({
      credit_available: '50.00', credit_used: '50.00', bucks_available: '35.00', bucks_used: '33.27', bucks_line_id: 99,
      instant_offered: false, instant_reason: 'Nothing is left to pay.', amount_due: '0.00',
      balances: { bucks: '35.00', bucks_use_by: '2026-11-02', credit: '50.00' },
    });
    wrap(<ThriftPlusPanel cart={cartWith(b)} onCart={() => undefined} />);
    expect(screen.getByText('Thrift+ credit $50.00 used first')).toBeInTheDocument();
    expect(screen.getByText(/^ThriftBucks used/)).toHaveTextContent('ThriftBucks used 33.27'); // a number, never "$"
    expect(screen.getByText(/^Your ThriftBucks/)).toHaveTextContent('Your ThriftBucks 35.00, use by Nov 2 · Thrift+ credit $50.00');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // no typed amounts any more
    await user.click(screen.getByRole('button', { name: "Don't use ThriftBucks today" }));
    expect(calls.bucks).toEqual([[3, false]]);
  });

  it('turns kept ThriftBucks back on after "don\'t use them today"', async () => {
    const user = userEvent.setup();
    wrap(<ThriftPlusPanel cart={cartWith(block({ bucks_auto: false, bucks_available: '35.00' }))} onCart={() => undefined} />);
    expect(screen.getByText('Not using ThriftBucks today')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use 35.00 ThriftBucks' }));
    expect(calls.bucks).toEqual([[3, true]]);
  });

  it('takes a Thrift+ 3-day return: no reason asked, 80% back as Thrift+ credit, the register code passed', async () => {
    const user = userEvent.setup();
    wrap(<ThriftPlusReturnDialog open onClose={() => undefined} registerCode="R1" />);
    expect(screen.getByText('Thrift+ 3-day return')).toBeInTheDocument();
    expectNoCardWords();
    await user.type(screen.getByLabelText('Scan the QR in their Thrift+ app'), 'TP100000000008');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Sold AS IS: no 3-day return.')).toBeInTheDocument();
    await user.click(screen.getByText(/Brass lamp/));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('ThriftBucks back 0.00 · taken back 28.00')).toBeInTheDocument();
    expectNoCardWords();
    await user.click(screen.getByRole('button', { name: 'Give $68.48 Thrift+ credit' }));
    expect(calls.lookups).toEqual([{ code: '100000000008' }]);
    expect(calls.returned).toEqual([{ code: '100000000008', cart_line: 7, register: 'R1' }]);
  });

  it('takes a return for a member found by phone', async () => {
    const user = userEvent.setup();
    wrap(<ThriftPlusReturnDialog open onClose={() => undefined} registerCode="R1" />);
    await user.type(screen.getByLabelText('Phone number'), '4025550101');
    await user.click(screen.getByRole('button', { name: 'Find' }));
    await user.click(within(await screen.findByTestId('thrift-phone-people')).getByText('Ana D.'));
    await user.click(await screen.findByText(/Brass lamp/));
    await user.click(screen.getByRole('button', { name: 'Give $68.48 Thrift+ credit' }));
    expect(calls.lookups).toEqual([{ person: 5 }]);
    expect(calls.returned).toEqual([{ person: 5, cart_line: 7, register: 'R1' }]);
  });

  it('shows the training result and gives nothing on the training register', async () => {
    calls.training = true;
    const user = userEvent.setup();
    wrap(<ThriftPlusReturnDialog open onClose={() => undefined} registerCode="TRAIN" training />);
    expect(screen.getByText('Thrift+ 3-day return (practice)')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Scan the QR in their Thrift+ app'), 'TP100000000008');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    await user.click(await screen.findByText(/Brass lamp/));
    await user.click(screen.getByRole('button', { name: 'Give $68.48 Thrift+ credit' }));
    const result = await screen.findByTestId('thrift-return-practice');
    expect(result).toHaveTextContent('THIS IS JUST A TEST: nothing was given.');
    expect(result).toHaveTextContent('Thrift+ credit $68.48');
    expect(result).toHaveTextContent('ThriftBucks taken back 28.00');
    expect(calls.returned).toEqual([{ code: '100000000008', cart_line: 7, register: 'TRAIN' }]);
  });
});

describe('Thrift+ sign up at the register (owner 2026-10-14: no card)', () => {
  const openCart = cartWith(block({ member: null, instant_offered: false }));

  // Owner 2026-10-16: a real register signs no one up (one way to join: ecothrift.us/join); practice only here.
  it('makes a practice member on the training register with no phone needed', async () => {
    const user = userEvent.setup();
    wrap(<ThriftPlusSignupDialog open training onClose={() => undefined} cart={openCart} lastSale={null} onCart={() => undefined} />);
    expectNoCardWords();
    await user.type(screen.getByLabelText(/First name/), 'Tia');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    await screen.findByTestId('thrift-signup-done');
    expect((calls.created[0] as { practice?: boolean }).practice).toBe(true);
    expect(calls.attached).toEqual([[3, 9]]);
  });
});
