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

  it('a blind drawer shows what was counted, never what was expected', async () => {
    drawer = {
      ...DRAWER, blind: true,
      counts: DRAWER.counts.map((c) => ({ ...c, expected_total: null, difference: null,
        rows: c.rows.map(({ key, label, counted }) => ({ key, label, counted })) })),
    } as unknown as typeof DRAWER;
    serve();
    wrap(<ObjectLink type="drawer" id={70} label="Drawer 70" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Drawer 70' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByTestId('count-handoff')).toHaveTextContent('Counted $60.00');
    expect(within(dialog).queryByText(/Expected \$/)).not.toBeInTheDocument();
    expect(within(dialog).getByText('Expected shows when the drawer closes.')).toBeInTheDocument();
  });

  it('a history scope travels as one string', () => {
    const scope = { member: 12, from: '', to: '', title: 'Ana Ruiz' };
    expect(parseHistoryKey(historyKey(scope))).toMatchObject({ member: 12, title: 'Ana Ruiz' });
  });
});
