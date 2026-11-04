import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObjectLink, ObjectModalProvider } from '../../objects/ObjectModal';
import { historyKey, parseHistoryKey } from './historyScope';

const client = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../api/client', () => ({ default: client }));
const auth = vi.hoisted(() => ({ language: 'en' as 'en' | 'es' }));
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { language: auth.language }, hasRole: () => false }),
}));

const TODAY = '2026-11-02';
const CARD = {
  id: 3, name: 'Register 1', code: 'POS-1', location: 'Store', is_active: true, is_training: false,
  starting_cash: '200.00', status: 'open', today: TODAY,
  drawer: {
    id: 70, status: 'open', cashier: 'Carrie Cash', covered_by: null, opened_by: 'Carrie Cash',
    opened_at: `${TODAY}T14:00:00Z`, opening_total: '200.00', closed_by: null, closed_at: null, variance: null,
  },
  last_drawer: null,
  sales: { count: 2, total: '40.00', average: '20.00', by_method: { card: '30.00' }, voided: 0, thrift_count: 1,
    practice: 0, last_sale_at: `${TODAY}T16:00:00Z` },
  last_sales: [{ id: 501, receipt: 'R-0501', status: 'completed', at: `${TODAY}T16:00:00Z`, cashier: 'Carrie Cash',
    payment_method: 'card', total: '30.00' }],
  journey: [{ kind: 'drop', at: `${TODAY}T15:00:00Z`, who: 'Carrie Cash', amount: '100.00' },
    { kind: 'opened', at: `${TODAY}T14:00:00Z`, who: 'Carrie Cash', amount: '200.00' }],
};
const SALES = {
  count: 1, next: null, previous: null,
  results: [{ id: 501, status: 'completed', completed_at: `${TODAY}T16:00:00Z`, created_at: `${TODAY}T16:00:00Z`,
    receipt: { receipt_number: 'R-0501' }, cashier_name: 'Carrie Cash', payment_method: 'card', total: '30.00',
    thrift_row: { member: 'Ana Ruiz' } }],
};
const DRAWER = {
  id: 70, register: { id: 3, name: 'Register 1', code: 'POS-1', is_training: false }, date: TODAY, status: 'open',
  blind: false, cashier: 'Carrie Cash', covered_by: null, opened_by: 'Carrie Cash', opened_at: `${TODAY}T14:00:00Z`,
  opening_total: '200.00', closed_by: null, closed_at: null, variance: null,
  cash_now: { count: { twenties: 3, ones: 12 }, total: '72.00' },
  counts: [
    { kind: 'opening', at: `${TODAY}T14:00:00Z`, who: 'Carrie Cash', bills_only: false, counted_total: '200.00',
      expected_total: '200.00', difference: '0.00', rows: [{ key: 'tens', label: '$10', counted: 20, expected: 20, difference: 0 }] },
    { kind: 'handoff', at: `${TODAY}T17:00:00Z`, who: 'Ana Ruiz', from: 'Carrie Cash', bills_only: true,
      counted_total: '60.00', expected_total: '61.00', difference: '-1.00',
      rows: [{ key: 'twenties', label: '$20', counted: 3, expected: 3, difference: 0 },
        { key: 'ones', label: '$1', counted: 0, expected: 1, difference: -1 }] },
  ],
  sales: CARD.sales,
  journey: CARD.journey,
};
const SUMMARY = { count: 1, total: '30.00', average: '30.00', voided_count: 0, thrift_count: 1, by_method: {} };

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter>
          <ObjectModalProvider>{ui}</ObjectModalProvider>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

let drawer: typeof DRAWER = DRAWER;

function serve() {
  client.get.mockImplementation((url: string) => Promise.resolve({
    data: url.endsWith('/registers/3/card/') ? CARD : url.endsWith('/drawers/70/card/') ? drawer : url.endsWith('/carts/summary/') ? SUMMARY : SALES,
  }));
}

// The Item link's hover card asks matchMedia (desk or phone); jsdom has none.
window.matchMedia = ((query: string) => ({
  matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {},
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

afterEach(() => {
  client.get.mockReset();
  auth.language = 'en';
  drawer = DRAWER;
});

describe('retail windows', () => {
  it('the Register window: who is on it, today, last sales; All today opens its Transactions', async () => {
    serve();
    const user = userEvent.setup();
    wrap(<ObjectLink type="register" id={3} label="Register 1" />);
    await user.click(screen.getByRole('button', { name: 'Register 1' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('heading', { name: 'Register 1' })).toBeInTheDocument();
    expect(within(dialog).getByText('POS-1')).toBeInTheDocument();
    expect(within(dialog).getByText('$40.00')).toBeInTheDocument();
    expect(within(dialog).getByText('Cash drop')).toBeInTheDocument();
    expect(within(dialog).getByText(/R-0501/)).toBeInTheDocument();

    await user.click(within(dialog).getAllByRole('button', { name: 'All today' })[0]);
    expect(await within(dialog).findByText('Ana Ruiz')).toBeInTheDocument();
    const [, params] = client.get.mock.calls.find(([u]) => u === '/pos/carts/')!;
    expect(params.params).toMatchObject({ register: 3, date_from: TODAY, date_to: TODAY, status: 'all' });
    expect(within(dialog).getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('speaks Spanish', async () => {
    auth.language = 'es';
    serve();
    const user = userEvent.setup();
    wrap(<ObjectLink type="register" id={3} label="Register 1" />);
    await user.click(screen.getByRole('button', { name: 'Register 1' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Caja')).toBeInTheDocument();
    expect(within(dialog).getByText('Retiro de efectivo')).toBeInTheDocument();
    expect(within(dialog).getByText('Tarjeta')).toBeInTheDocument();
  });

  it('the Drawer window opens from the Register window: cash now by bill, counts with what was expected', async () => {
    serve();
    const user = userEvent.setup();
    wrap(<ObjectLink type="register" id={3} label="Register 1" />);
    await user.click(screen.getByRole('button', { name: 'Register 1' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByTestId('register-drawer-link'));
    expect(await within(dialog).findByText('Cash now')).toBeInTheDocument();
    expect(within(dialog).getByTestId('drawer-twenties')).toHaveTextContent('× 3');
    const handoff = within(dialog).getByTestId('count-handoff');
    expect(handoff).toHaveTextContent('Handover count (bills)');
    expect(handoff).toHaveTextContent('Carrie Cash → Ana Ruiz');
    expect(handoff).toHaveTextContent('Expected $61.00 · Off -$1.00');
    expect(within(dialog).getByTestId('count-opening')).toHaveTextContent('Expected $200.00 ✓');
    await user.click(handoff);
    expect(within(dialog).getByTestId('count-rows-handoff')).toHaveTextContent('$1');
    expect(within(dialog).getByRole('button', { name: "This drawer's sales" })).toBeInTheDocument();
  });

  it('a blind drawer shows what was counted, never the cash now or what was expected', async () => {
    drawer = {
      ...DRAWER, blind: true, cash_now: null,
      counts: DRAWER.counts.map((c) => ({ ...c, expected_total: null, difference: null,
        rows: c.rows.map(({ key, label, counted }) => ({ key, label, counted })) })),
    } as unknown as typeof DRAWER;
    serve();
    wrap(<ObjectLink type="drawer" id={70} label="Drawer 70" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Drawer 70' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByTestId('count-handoff')).toHaveTextContent('Counted $60.00');
    expect(within(dialog).queryByText(/Expected \$/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Cash now')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Cash now and expected show when the drawer closes.')).toBeInTheDocument();
  });

  it('the Transaction window: lines with SKU links, the returned line, history and links', async () => {
    const SALE = {
      id: 501, status: 'completed', total: '30.00', subtotal: '28.04', tax_amount: '1.96', payment_method: 'card',
      completed_at: `${TODAY}T16:00:00Z`, created_at: `${TODAY}T15:58:00Z`, cashier_name: 'Carrie Cash',
      receipt: { receipt_number: 'R-0501' }, savings: { total: '0', lines: [] },
      lines: [{ id: 9, description: 'Stand mixer', quantity: 1, line_total: '28.04', line_kind: 'item', tax_exempt: false }],
    };
    const CARD = {
      id: 501, register: { id: 3, name: 'Register 1', is_training: false }, drawer: 70,
      member: { person_id: 12, name: 'Ana Ruiz' }, items: { 9: { id: 44, sku: 'ITM0044' } },
      returns: [{ line: 9, description: 'Stand mixer', at: `${TODAY}T18:00:00Z`, credit: '22.43', bucks_taken: '0.00', status: 'open', by: 'Carrie Cash' }],
      journey: [{ kind: 'returned', at: `${TODAY}T18:00:00Z`, who: 'Carrie Cash', note: 'Stand mixer' },
        { kind: 'completed', at: `${TODAY}T16:00:00Z`, who: 'Carrie Cash' }],
    };
    client.get.mockImplementation((url: string) => Promise.resolve({ data: url.endsWith('/card/') ? CARD : SALE }));
    const user = userEvent.setup();
    wrap(<ObjectLink type="sale" id={501} label="R-0501" />);
    await user.click(screen.getByRole('button', { name: 'R-0501' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('button', { name: 'ITM0044' })).toBeInTheDocument();
    expect(within(dialog).getAllByText('Returned').length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/\$22\.43 credit/)).toBeInTheDocument();
    expect(within(dialog).getByText('Paid')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Register 1' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Thrift\+ member: Ana Ruiz/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Reprint receipt' })).toBeInTheDocument();
  });

  it('the Member window: standing, ThriftBucks, trips open the sale, the other adult opens their own window', async () => {
    const person = (id: number, first: string, role: string) => ({ person_id: id, first_name: first, name: `${first} Ruiz`, role, photo_url: null, verified_18: true });
    const DATA = {
      person: { ...person(12, 'Ana', 'primary'), last_name: 'Ruiz', account_id: 4, email: '', joined_at: '', code_last4: null, code_display: '1234 5678 9012', standing: 'member', practice: false },
      rewards: { collected: '45.00', used: '5.00', balance: '40.00', usable_today: '40.00', use_by: '2026-12-01', credit: '5.00' },
      trips: [{ cart_id: 501, ticket: 'R-0501', date: TODAY, items: 2, total: '30.00' }],
      people: [person(12, 'Ana', 'primary'), person(13, 'Ben', 'secondary')],
      window: { joined_at: '2026-10-16T15:00:00Z', trip_count: 7, returns: [], history: [{ action: 'finished_joining', at: '2026-10-16T15:00:00Z', person: 'Ana', by: 'Carrie Cash' }] },
    };
    client.get.mockImplementation((url: string, cfg?: { params?: { person?: number } }) =>
      Promise.resolve({ data: url.includes('/thriftplus/register/member/') ? { ...DATA, person: { ...DATA.person, person_id: cfg?.params?.person ?? 12 } } : SALES }));
    const user = userEvent.setup();
    wrap(<ObjectLink type="member" id={12} label="Ana" />);
    await user.click(screen.getByRole('button', { name: 'Ana' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('heading', { name: 'Ana Ruiz' })).toBeInTheDocument();
    expect(within(dialog).getByText('1234 5678 9012')).toBeInTheDocument();
    expect(within(dialog).getByText('Member')).toBeInTheDocument();
    expect(within(dialog).getByText('7')).toBeInTheDocument();
    expect(within(dialog).getByText('ID checked, joining finished')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Ben Ruiz/ }));
    await within(dialog).findByRole('button', { name: 'Back' });
    expect(client.get).toHaveBeenLastCalledWith('/thriftplus/register/member/', { params: { person: 13, window: 1 } });
  });

  it('a history scope travels as one string', () => {
    const scope = { member: 12, from: '', to: '', title: 'Ana Ruiz' };
    expect(parseHistoryKey(historyKey(scope))).toMatchObject({ member: 12, title: 'Ana Ruiz' });
  });
});
