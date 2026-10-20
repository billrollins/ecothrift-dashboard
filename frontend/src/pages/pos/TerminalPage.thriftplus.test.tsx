import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cart, ThriftPlusCartBlock } from '../../types/pos.types';

/**
 * The register's Thrift+ pieces (owner 2026-10-20): the one "Thrift+ member" button, Refresh on the cart, and the
 * popup after a member's sale with a 3-day-return item. The terminal itself is real; its server calls are not.
 */
const m = vi.hoisted(() => ({
  refresh: vi.fn(),
  complete: vi.fn(),
  cart: null as unknown,
}));

vi.mock('../../hooks/usePOS', async (importOriginal) => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    ...(await importOriginal<typeof import('../../hooks/usePOS')>()),
    useRegisters: () => ({ data: { results: [{ id: 1, code: 'R1', name: 'Register 1' }] }, isLoading: false }),
    useDrawers: () => ({
      data: {
        results: [{
          id: 7, register: 1, register_code: 'R1', register_name: 'Register 1', status: 'open', current_cashier: 1,
          register_is_training: false,
        }],
      },
      isLoading: false,
    }),
    useCreateCart: mutation, useAddItemToCart: mutation, useAddManualLineToCart: mutation, useAddAssemblyToCart: mutation,
    useAddDiscountToCart: mutation, useAddDeliveryToCart: mutation, useAddResaleCopyToCart: mutation, useSetCartLineSale: mutation,
    useSyncCartSale: mutation, useSetLaborDayOverride: mutation, useUpdateCartLine: mutation, useRemoveCartLine: mutation,
    useVoidCart: mutation, useOpenDrawer: mutation, useOpenTrainingDrawer: mutation, useDrawerTakeover: mutation,
    useCompleteCart: () => ({ mutateAsync: m.complete, isPending: false }),
    useSaleMode: () => ({ data: undefined }),
    useDeliveryAvailabilities: () => ({ data: [], isFetching: false }),
  };
});

vi.mock('../../hooks/useDeviceConfig', () => ({
  useDeviceConfig: () => ({
    config: { deviceType: 'register', registerId: 1, registerName: 'Register 1', registerCode: 'R1', configuredAt: '2026-10-01T12:00:00Z' },
    isRegister: true,
    registerId: 1,
  }),
}));
vi.mock('../../hooks/useLocalPrintStatus', () => ({ useLocalPrintStatus: () => ({ online: false }) }));
vi.mock('../../hooks/useEmployees', () => ({ useLookupCustomer: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, is_superuser: false }, hasRole: () => false }) }));
vi.mock('../../components/routines/WorkCyclePill', () => ({ WorkCyclePill: () => null }));
vi.mock('./WorkCyclePromptDialog', () => ({ WorkCyclePromptDialog: () => null }));
vi.mock('../../services/localPrintService', () => ({
  localPrintService: { printReceipt: vi.fn(async () => ({ drawer_opened: true })), getHealth: vi.fn() },
}));
vi.mock('../../api/pos.api', () => ({
  updateCart: vi.fn(),
  getCarts: vi.fn(async () => ({ data: { results: [m.cart] } })),
  getCartCardPreview: vi.fn(),
  getStaffPurchaseSettings: vi.fn(async () => ({ data: { payroll_deduction: false } })),
  suggestDeliveryAddresses: vi.fn(),
}));
vi.mock('../../api/thriftplusRegister.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/thriftplusRegister.api')>()),
  getThriftRegisterStatus: async () => ({ live: true }),
  refreshCart: m.refresh,
  getMemberCard: async () => ({
    person: {
      person_id: 5, account_id: 1, first_name: 'Ana', last_name: 'Bell', name: 'Ana Bell', email: '', joined_at: '', code_last4: '0008',
      standing: 'member', role: 'primary', practice: false, verified_18: true,
    },
    rewards: { collected: '45.00', used: '0.00', balance: '45.00', usable_today: '45.00', use_by: '2026-11-19', credit: '5.00' },
    trips: [], people: [{ person_id: 5, first_name: 'Ana', name: 'Ana Bell', role: 'primary', photo_url: null, verified_18: true }],
  }),
}));

import TerminalPage from './TerminalPage';

function block(over: Partial<ThriftPlusCartBlock> = {}): ThriftPlusCartBlock {
  return {
    live: true,
    member: {
      account_id: 1, person_id: 5, name: 'Ana Bell', first_name: 'Ana', role: 'primary', photo_url: null, verified_18: true,
      card_last4: '0008', practice: false, choice: 'bank', rering: false,
    },
    instant_offered: true, instant_reason: '', instant_share: '0.50', collected: '35.00', use_by: '2026-11-19', instant_bucks: '0.00',
    instant_off: '0.00', bucks_auto: true, bucks_available: '0.00', bucks_used: '0.00', credit_available: '0.00', credit_used: '0.00',
    balances: { bucks: '10.00', bucks_use_by: '2026-11-02', credit: '0.00' }, guest_line: '', lines: {}, bucks_line_id: null,
    restricted_line_ids: [], amount_due: '85.60', ...over,
  };
}

function cartWith(thrift: ThriftPlusCartBlock | null, over: Partial<Cart> = {}): Cart {
  return {
    id: 3, drawer: 7, cashier: 1, cashier_name: 'Pat', customer: null, status: 'open', subtotal: '80.00', tax_rate: '0.0700',
    tax_amount: '5.60', total: '85.60', payment_method: 'cash', cash_tendered: null, change_given: null, card_amount: null,
    completed_at: null, created_at: '2026-10-20T15:00:00Z', thrift_credit: '0.00', thrift_plus: thrift,
    lines: [{
      id: 11, cart: 3, item: 5, description: 'Brass lamp', quantity: 1, unit_price: '80.00', line_total: '80.00', line_kind: 'item',
      created_at: '2026-10-20T15:00:00Z',
    }],
    ...over,
  } as unknown as Cart;
}

function renderTerminal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={createTheme()}>
        <SnackbarProvider>
          <MemoryRouter>
            <TerminalPage />
          </MemoryRouter>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  m.refresh.mockReset();
  m.complete.mockReset();
  m.cart = cartWith(block());
});

describe('The register\'s Thrift+ button (owner 2026-10-20)', () => {
  it('has one Thrift+ member button, and no finish-joining or 3-day-return buttons', async () => {
    renderTerminal();
    expect(await screen.findByTestId('thrift-member-button')).toHaveTextContent('Thrift+ member');
    expect(screen.queryByRole('button', { name: /finish joining/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /3-day return/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Phone number')).not.toBeInTheDocument(); // no guest find boxes either
  });

  it('opens the member card for the member on the sale', async () => {
    const user = userEvent.setup();
    renderTerminal();
    await user.click(await screen.findByTestId('thrift-member-button'));
    const dialog = await screen.findByTestId('thrift-member-dialog');
    expect(await within(dialog).findByTestId('member-card-name')).toHaveTextContent('Ana Bell');
    expect(within(dialog).getByTestId('member-card-credit')).toHaveTextContent('$5.00');
    expect(within(dialog).getByTestId('member-card-add-person')).toBeInTheDocument();
  });

  it('tapping the member on the sale opens the same card', async () => {
    const user = userEvent.setup();
    renderTerminal();
    await user.click(await screen.findByTestId('thrift-member-open'));
    expect(await screen.findByTestId('member-card-name')).toHaveTextContent('Ana Bell');
  });
});

describe('Refresh on the cart (owner 2026-10-20)', () => {
  it('reloads the sale from the server with the member\'s ThriftBucks, credit and status of now', async () => {
    const user = userEvent.setup();
    m.refresh.mockResolvedValue(cartWith(block({
      balances: { bucks: '10.00', bucks_use_by: '2026-11-02', credit: '12.00' }, credit_available: '12.00',
    })));
    renderTerminal();
    expect(await screen.findByText(/Thrift\+ credit \$0\.00/)).toBeInTheDocument();
    await user.click(await screen.findByTestId('cart-refresh'));
    expect(m.refresh).toHaveBeenCalledWith(3);
    expect(await screen.findByText(/Thrift\+ credit \$12\.00/)).toBeInTheDocument();
  });

  it('says so when the server cannot be reached and keeps the sale as it was', async () => {
    const user = userEvent.setup();
    m.refresh.mockRejectedValue({ response: { data: { detail: 'Could not reach the server.' } } });
    renderTerminal();
    await user.click(await screen.findByTestId('cart-refresh'));
    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    expect(screen.getByText('Brass lamp')).toBeInTheDocument();
  });

  it('is only on a sale that exists', async () => {
    m.cart = undefined;
    renderTerminal();
    await screen.findByTestId('thrift-member-button');
    expect(screen.queryByTestId('cart-refresh')).not.toBeInTheDocument();
  });
});

describe('The popup after a member\'s sale with a 3-day-return item (owner 2026-10-20)', () => {
  async function pay(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText('Cash tendered'), '100');
    await user.click(screen.getByRole('button', { name: 'Complete sale' }));
  }

  it('tells the cashier what to say, with the server\'s date, and must be tapped through', async () => {
    const user = userEvent.setup();
    m.complete.mockResolvedValue(cartWith(block({ returns_until: '2026-10-23' }), { status: 'completed', completed_at: '2026-10-20T20:00:00Z' }));
    renderTerminal();
    await pay(user);
    const popup = await screen.findByTestId('returns-popup');
    expect(popup).toHaveTextContent('Say: Returns are valid through Fri Oct 23 and are 80% store credit.');
    expect(within(popup).queryByTestId('returns-popup-note')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('returns-popup')).toBeInTheDocument(); // Escape does not skip it
    await user.click(screen.getByRole('button', { name: 'I said it' }));
    await waitFor(() => expect(screen.queryByTestId('returns-popup')).not.toBeInTheDocument());
  });

  it('adds the closed-days note when the 3 days include a closed day', async () => {
    const user = userEvent.setup();
    const note = "Heads up: we're closed Sun Oct 25. Returns for today's items end Sat Oct 24.";
    m.complete.mockResolvedValue(cartWith(block({ returns_until: '2026-10-23', return_note: note }), { status: 'completed', completed_at: '2026-10-20T20:00:00Z' }));
    renderTerminal();
    await pay(user);
    expect(await screen.findByTestId('returns-popup-note')).toHaveTextContent(note);
  });

  it('shows nothing when the sale has no member or no 3-day-return item', async () => {
    const user = userEvent.setup();
    m.complete.mockResolvedValue(cartWith(block(), { status: 'completed', completed_at: '2026-10-20T20:00:00Z' })); // no returns_until
    renderTerminal();
    await pay(user);
    await waitFor(() => expect(m.complete).toHaveBeenCalled());
    await screen.findByText('Scan an item to begin a new sale.');
    expect(screen.queryByTestId('returns-popup')).not.toBeInTheDocument();
  });
});
