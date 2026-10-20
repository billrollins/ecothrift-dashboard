import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReturnsFind, ReturnsReceipt, ReturnsSummary } from '../../api/thriftplusReturns.api';
import ReturnsPage from './ReturnsPage';

const api = vi.hoisted(() => ({
  findReturns: vi.fn(),
  getReturnsReceipt: vi.fn(),
  previewReturn: vi.fn(),
  confirmReturn: vi.fn(),
  fetchLateReturns: vi.fn(),
}));
vi.mock('../../api/thriftplusReturns.api', async (orig) => ({
  ...(await orig<typeof import('../../api/thriftplusReturns.api')>()),
  ...api,
}));
const auth = vi.hoisted(() => ({ user: { role: 'Employee', is_superuser: false } as { role: string; is_superuser: boolean } }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('../../hooks/useDeviceConfig', () => ({ useDeviceConfig: () => ({ config: { registerCode: 'R1' } }) }));

const LAMP = { cart_line: 11, sku: 'ITM100', title: 'Brass lamp', quantity: 1, price: '80.00', mark: '3-day return', refund: '68.48',
  bucks_back: '0.00', bucks_take: '28.00', photos: [], state: 'returnable' as const, late: false, why: '' };
const VASE = { ...LAMP, cart_line: 12, sku: 'ITM200', title: 'Glass vase', price: '50.00', refund: '53.50', bucks_take: '10.00' };
const MUG = { ...LAMP, cart_line: 13, sku: 'ITM300', title: 'Coffee mug', price: '9.00', refund: '0.00', mark: 'AS IS',
  state: 'as_is' as const, why: '$10.00 or less after ThriftBucks: sold AS IS.' };

function receipt(over: Partial<ReturnsReceipt> = {}): ReturnsReceipt {
  return {
    cart: 5, practice: false, receipt_number: 'R-20261020-014', completed_at: '2026-10-20T15:00:00Z', total: '150.00', tax: '9.82',
    cashier: 'Pat Clerk', deadline: '2026-10-23', late: false, closed_note: '',
    member: { person_id: 7, account_id: 3, name: 'Ana Member', photo_url: null, credit: '0.00' },
    lines: [LAMP, VASE, MUG], ...over,
  };
}

function summary(over: Partial<ReturnsSummary> = {}): ReturnsSummary {
  return {
    lines: [
      { cart_line: 11, sku: 'ITM100', title: 'Brass lamp', refund: '68.48', credit: '68.48', bucks_back: '0.00', bucks_taken: '28.00', shortfall: '0.00', late: false, problems: [] },
      { cart_line: 12, sku: 'ITM200', title: 'Glass vase', refund: '53.50', credit: '53.50', bucks_back: '0.00', bucks_taken: '10.00', shortfall: '0.00', late: false, problems: [] },
    ],
    totals: { credit: '121.98', bucks_back: '0.00', bucks_taken: '38.00', shortfall: '0.00' },
    late: false, ok: true, pin_set: true, owner_signed_in: false,
    reasons: [{ value: 'told_wrong', label: 'Cashier told them wrong' }, { value: 'closed', label: 'Store was closed' }, { value: 'owner', label: "Owner's choice" }],
    ...over,
  };
}

const TICKETS: ReturnsFind = {
  kind: 'person', people: [], message: '', receipt: null,
  person: { person_id: 7, account_id: 3, first_name: 'Ana', last_name: 'Member', name: 'Ana Member', photo_url: null, status: 'active', role: 'primary', phone_last4: '0101', contact: '••0101' },
  tickets: [
    { cart: 5, receipt_number: 'R-20261020-014', completed_at: '2026-10-20T15:00:00Z', items: 3, total: '150.00', member: 'Ana Member', practice: false },
    { cart: 4, receipt_number: 'R-20261019-002', completed_at: '2026-10-19T15:00:00Z', items: 1, total: '10.70', member: 'Ana Member', practice: false },
  ],
};

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}{l.search}</div>;
}

function renderPage(url = '/pos/returns') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/pos/returns" element={<ReturnsPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.findReturns.mockResolvedValue(TICKETS);
  api.getReturnsReceipt.mockResolvedValue(receipt());
  api.previewReturn.mockResolvedValue(summary());
  api.confirmReturn.mockResolvedValue({ totals: { credit: '121.98', bucks_back: '0.00', bucks_taken: '38.00', shortfall: '0.00' }, training: false, person_id: 7, account_id: 3 });
  api.fetchLateReturns.mockResolvedValue([]);
  auth.user = { role: 'Employee', is_superuser: false };
});

const search = () => screen.getByTestId('returns-search');

describe('Returns page (owner 2026-10-20)', () => {
  it('opens with the search box focused; Enter finds the member and lists their tickets newest first', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(search()).toHaveFocus();
    await user.type(search(), 'ana{Enter}');
    expect(api.findReturns).toHaveBeenCalledWith('ana', { register: 'R1' });
    const rows = await within(await screen.findByTestId('returns-tickets')).findAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('R-20261020-014 · $150.00');
    expect(rows[0]).toHaveTextContent('3 items');
    expect(rows[1]).toHaveTextContent('R-20261019-002');
    expect(screen.getByText('Ana Member')).toBeInTheDocument();
  });

  it('a ticket opens split into Returnable and AS IS; multi-select, a scan ticks a line, one request per step', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(search(), 'ana{Enter}');
    await user.click((await screen.findAllByText(/R-20261020-014/))[0]);
    expect(api.getReturnsReceipt).toHaveBeenCalledWith(5, 'R1');
    expect(await screen.findByTestId('receipt-head')).toHaveTextContent('R-20261020-014');
    expect(screen.getByText('Returns through Fri Oct 23.')).toBeInTheDocument();
    expect(screen.getByTestId('returns-scan')).toHaveFocus();
    const asIs = screen.getByTestId('returns-as-is');
    expect(within(asIs).getByText('Coffee mug')).toBeInTheDocument();
    expect(within(asIs).getByText(/\$10.00 or less after ThriftBucks/)).toBeInTheDocument();
    expect(screen.getByTestId('returns-next')).toBeDisabled();

    await user.click(screen.getByTestId('line-11'));
    await user.type(screen.getByTestId('returns-scan'), 'itm200{Enter}'); // the vase's tag
    expect(screen.getByRole('checkbox', { name: 'Return Brass lamp' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Return Glass vase' })).toBeChecked();
    expect(screen.getByTestId('returns-next')).toHaveTextContent('2 items, $121.98');

    await user.type(screen.getByTestId('returns-scan'), 'itm300{Enter}');
    expect(screen.getByTestId('returns-scan-note')).toHaveTextContent('Coffee mug: $10.00 or less after ThriftBucks');
    await user.type(screen.getByTestId('returns-scan'), 'zzz9{Enter}');
    expect(screen.getByTestId('returns-scan-note')).toHaveTextContent('zzz9 is not on this ticket.');

    await user.click(screen.getByTestId('returns-next'));
    expect(api.previewReturn).toHaveBeenCalledWith(5, [11, 12], 'R1');
    expect(await screen.findByTestId('summary-credit')).toHaveTextContent('Thrift+ credit $121.98');
    expect(screen.getByTestId('summary-bucks')).toHaveTextContent('taken back 38.00');
    expect(screen.getByText(/Glance: not broken or heavily used since the sale. Don't ask why./)).toBeInTheDocument();
    expect(screen.queryByTestId('returns-late-box')).not.toBeInTheDocument();
    expect(screen.getByTestId('summary-line-11')).toHaveTextContent('Brass lamp');
  });

  it('a single ticket comes back open: scan the tag, Enter on an empty box goes to the summary, Confirm opens the member card', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValue({ kind: 'item', people: [], person: null, tickets: [TICKETS.tickets[0]], message: '', receipt: receipt() });
    renderPage();
    await user.type(search(), 'ITM100{Enter}');
    await screen.findByTestId('receipt-head');
    expect(api.getReturnsReceipt).not.toHaveBeenCalled(); // no second request
    await user.type(screen.getByTestId('returns-scan'), 'ITM100{Enter}');
    await user.type(screen.getByTestId('returns-scan'), '{Enter}'); // nothing typed: on to the summary
    await user.click(await screen.findByTestId('returns-confirm'));
    expect(api.confirmReturn).toHaveBeenCalledWith({ cart: 5, cart_lines: [11], register: 'R1' });
    expect(await screen.findByTestId('where')).toHaveTextContent('/pos/members?person=7');
  });

  it('past the 3 days the summary asks for a reason and the owner PIN, and a wrong PIN says how many tries are left', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValue({ kind: 'ticket', people: [], person: null, tickets: [TICKETS.tickets[0]], message: '',
      receipt: receipt({ late: true, lines: [{ ...LAMP, late: true }, MUG] }) });
    api.previewReturn.mockResolvedValue(summary({ late: true, lines: [{ ...summary().lines[0], late: true }] }));
    api.confirmReturn.mockRejectedValueOnce({ response: { data: { code: 'PIN_WRONG', detail: 'That PIN is wrong.', tries_left: 4 } } });
    renderPage();
    await user.type(search(), 'R-20261020-014{Enter}');
    expect(await screen.findByTestId('receipt-late')).toHaveTextContent('needs the owner (PIN)');
    expect(screen.getByText('LATE', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByTestId('line-11'));
    await user.click(screen.getByTestId('returns-next'));
    await screen.findByTestId('returns-late-box');
    const confirm = screen.getByTestId('returns-confirm');
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Store was closed' }));
    expect(confirm).toBeDisabled(); // a reason is not enough: the PIN too
    await user.type(screen.getByTestId('owner-pin-input'), '0000');
    expect(screen.getByTestId('owner-pin-input')).toHaveAttribute('type', 'password');
    await user.type(screen.getByLabelText('Note (optional)'), 'Closed Sun and Mon');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(await screen.findByTestId('returns-error')).toHaveTextContent('That PIN is wrong. 4 tries left.');
    expect(screen.getByTestId('owner-pin-input')).toHaveValue(''); // cleared for another try

    api.confirmReturn.mockResolvedValueOnce({ totals: { credit: '68.48', bucks_back: '0.00', bucks_taken: '28.00', shortfall: '0.00' }, training: false, person_id: 7, account_id: 3 });
    await user.type(screen.getByTestId('owner-pin-input'), '4821{Enter}');
    await waitFor(() => expect(api.confirmReturn).toHaveBeenLastCalledWith({
      cart: 5, cart_lines: [11], register: 'R1', late: { reason: 'closed', note: 'Closed Sun and Mon' }, pin: '4821',
    }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/pos/members?person=7');
  });

  it('the owner signed in needs no PIN; with no PIN set anyone else is told so', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValue({ kind: 'ticket', people: [], person: null, tickets: [TICKETS.tickets[0]], message: '',
      receipt: receipt({ late: true, lines: [{ ...LAMP, late: true }] }) });
    api.previewReturn.mockResolvedValue(summary({ late: true, owner_signed_in: true }));
    renderPage();
    await user.type(search(), '14{Enter}');
    await user.click(await screen.findByTestId('line-11'));
    await user.click(screen.getByTestId('returns-next'));
    await screen.findByTestId('returns-late-box');
    expect(screen.queryByTestId('owner-pin-input')).not.toBeInTheDocument();
    expect(screen.getByText(/no PIN needed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Owner's choice" }));
    await user.click(screen.getByTestId('returns-confirm'));
    expect(api.confirmReturn).toHaveBeenCalledWith({ cart: 5, cart_lines: [11], register: 'R1', late: { reason: 'owner', note: '' } });
  });

  it('with no owner PIN set a late return says so and cannot be confirmed', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValue({ kind: 'ticket', people: [], person: null, tickets: [TICKETS.tickets[0]], message: '',
      receipt: receipt({ late: true, lines: [{ ...LAMP, late: true }] }) });
    api.previewReturn.mockResolvedValue(summary({ late: true, pin_set: false }));
    renderPage();
    await user.type(search(), '14{Enter}');
    await user.click(await screen.findByTestId('line-11'));
    await user.click(screen.getByTestId('returns-next'));
    expect(await screen.findByText(/There is no owner PIN yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Store was closed' }));
    expect(screen.getByTestId('returns-confirm')).toBeDisabled();
  });

  it('practice (?practice=1) uses the training register, asks for no PIN and stays on the page', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValue({ kind: 'ticket', people: [], person: null, tickets: [TICKETS.tickets[0]], message: '',
      receipt: receipt({ practice: true, late: true, lines: [{ ...LAMP, late: true }] }) });
    api.previewReturn.mockResolvedValue(summary({ late: true }));
    api.confirmReturn.mockResolvedValue({ totals: { credit: '68.48', bucks_back: '0.00', bucks_taken: '28.00', shortfall: '0.00' }, training: true, person_id: 7, account_id: 3 });
    renderPage('/pos/returns?practice=1');
    expect(screen.getByText('Returns (practice)')).toBeInTheDocument();
    await user.type(search(), '14{Enter}');
    expect(api.findReturns).toHaveBeenCalledWith('14', { register: 'TRAIN' });
    await user.click(await screen.findByTestId('line-11'));
    await user.click(screen.getByTestId('returns-next'));
    await screen.findByTestId('returns-late-box');
    expect(screen.queryByTestId('owner-pin-input')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Store was closed' }));
    await user.click(screen.getByTestId('returns-confirm'));
    await waitFor(() => expect(search()).toBeInTheDocument());
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
  });

  it('several people for a name wait to be picked, then their tickets show', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValueOnce({ kind: 'people', tickets: [], person: null, message: '', receipt: null,
      people: [TICKETS.person!, { ...TICKETS.person!, person_id: 8, account_id: 4, name: 'Ana Moss', first_name: 'Ana', last_name: 'Moss' }] });
    renderPage();
    await user.type(search(), 'ana{Enter}');
    await user.click(await screen.findByText('Ana Moss'));
    expect(api.findReturns).toHaveBeenLastCalledWith('', { person: 8, register: 'R1' });
  });

  it('shows the message when nothing is found, and Late returns only to managers and the owner', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValue({ kind: 'none', people: [], person: null, tickets: [], receipt: null, message: 'No ticket R-20200101-001. Check the number on the receipt.' });
    renderPage();
    expect(screen.queryByRole('tab', { name: 'Late returns' })).not.toBeInTheDocument();
    await user.type(search(), 'R-20200101-001{Enter}');
    expect(await screen.findByTestId('returns-message')).toHaveTextContent('No ticket R-20200101-001');
  });

  it('managers see the Late returns list, newest first, with the mark against Retail', async () => {
    const user = userEvent.setup();
    auth.user = { role: 'Manager', is_superuser: false };
    api.fetchLateReturns.mockResolvedValue([
      { id: 2, created_at: '2026-10-21T15:00:00Z', department: 'retail', receipt_number: 'R-20261016-003', cart: 9, sold_at: '2026-10-16T15:00:00Z', days_late: 2,
        sku: 'ITM100', title: 'Brass lamp', member: 'Ana Member', credit: '68.48', cashier: 'Pat Clerk', reason: 'closed', reason_label: 'Store was closed',
        note: 'storm', entered_by: 'Sam Lee', by_pin: true },
    ]);
    renderPage();
    await user.click(screen.getByRole('tab', { name: 'Late returns' }));
    const table = await screen.findByTestId('late-returns-table');
    expect(within(table).getByText('Retail: Pat Clerk')).toBeInTheDocument();
    expect(within(table).getByText('Store was closed')).toBeInTheDocument();
    expect(within(table).getByText('Sam Lee')).toBeInTheDocument();
    expect(within(table).getByText('$68.48')).toBeInTheDocument();
  });
});
