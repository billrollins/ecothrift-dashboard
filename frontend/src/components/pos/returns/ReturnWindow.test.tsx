import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReturnsDone, ReturnsFind, ReturnsReceipt, ReturnsSummary } from '../../../api/thriftplusReturns.api';
import { PrintFailedError } from '../../../services/localPrintService';
import ReturnWindow from './ReturnWindow';

const api = vi.hoisted(() => ({
  findReturns: vi.fn(),
  getReturnsReceipt: vi.fn(),
  previewReturn: vi.fn(),
  confirmReturn: vi.fn(),
}));
vi.mock('../../../api/thriftplusReturns.api', async (orig) => ({
  ...(await orig<typeof import('../../../api/thriftplusReturns.api')>()),
  ...api,
}));
// No paper in a test: the print server is a stub that remembers what it was sent.
const printer = vi.hoisted(() => ({ printReceipt: vi.fn() }));
vi.mock('../../../services/localPrintService', async (orig) => ({
  ...(await orig<typeof import('../../../services/localPrintService')>()),
  localPrintService: printer,
}));
const openObject = vi.hoisted(() => vi.fn());
vi.mock('../../objects/ObjectModal', () => ({ useObjectModal: () => ({ openObject }), useOptionalObjectModal: () => ({ openObject }) }));
const onClose = vi.hoisted(() => vi.fn());

const REASONS = [
  { value: 'not_working', label: 'Does not work' }, { value: 'damaged', label: 'Broken or damaged' },
  { value: 'missing_parts', label: 'Missing parts' }, { value: 'not_as_described', label: 'Not as described' },
  { value: 'changed_mind', label: 'Changed mind' }, { value: 'other', label: 'Other' },
];
const LAMP = { cart_line: 11, sku: 'ITM100', title: 'Brass lamp', quantity: 1, price: '80.00', mark: '3-day return', refund: '68.48',
  bucks_back: '0.00', bucks_take: '28.00', photos: [], state: 'returnable' as const, late: false, why: '' };
const VASE = { ...LAMP, cart_line: 12, sku: 'ITM200', title: 'Glass vase', price: '50.00', refund: '53.50', bucks_take: '10.00' };
const MUG = { ...LAMP, cart_line: 13, sku: 'ITM300', title: 'Coffee mug', price: '9.00', refund: '0.00', mark: 'AS IS',
  state: 'as_is' as const, why: '$10.00 or less after ThriftBucks: sold AS IS.' };

function receipt(over: Partial<ReturnsReceipt> = {}): ReturnsReceipt {
  return {
    cart: 5, practice: false, receipt_number: 'R-20261020-014', completed_at: '2026-10-20T15:00:00Z', total: '150.00', tax: '9.82',
    cashier: 'Pat Clerk', deadline: '2026-10-23', late: false, closed_note: '', payment_method: 'cash', return_reasons: REASONS,
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
    late: false, ok: true, owner_signed_in: false,
    reasons: [{ value: 'told_wrong', label: 'Cashier told them wrong' }, { value: 'closed', label: 'Store was closed' }, { value: 'owner', label: "Owner's choice" }],
    ...over,
  };
}

/** What the server answers to Confirm: the totals, the member, and the return receipt to print. */
const SLIP = { receipt_number: 'RETURN R-20261020-014', kind: 'return', total: 68.48, items: [{ name: 'Brass lamp. Reason: Does not work', line_total: 68.48 }] };
function finished(over: Partial<ReturnsDone> = {}): ReturnsDone {
  return { totals: { credit: '68.48', bucks_back: '0.00', bucks_taken: '28.00', shortfall: '0.00' }, training: false, person_id: 7, account_id: 3,
    credit: '68.48', receipt: SLIP, ...over };
}

const TICKETS: ReturnsFind = {
  kind: 'person', people: [], message: '', receipt: null,
  person: { person_id: 7, account_id: 3, first_name: 'Ana', last_name: 'Member', name: 'Ana Member', photo_url: null, status: 'active', role: 'primary', phone_last4: '0101', contact: '••0101' },
  tickets: [
    { cart: 5, receipt_number: 'R-20261020-014', completed_at: '2026-10-20T15:00:00Z', items: 3, total: '150.00', member: 'Ana Member', practice: false },
    { cart: 4, receipt_number: 'R-20261019-002', completed_at: '2026-10-19T15:00:00Z', items: 1, total: '10.70', member: 'Ana Member', practice: false },
  ],
};
const ONE_TICKET: ReturnsFind = { kind: 'ticket', people: [], person: null, tickets: [TICKETS.tickets[0]], message: '', receipt: receipt() };

let client: QueryClient;
const invalidated = () => vi.mocked(client.invalidateQueries).mock.calls.map(([f]) => (f as { queryKey: unknown }).queryKey);

/** The Return window as the Register opens it: register R1, or the training register (TRAIN) for practice. */
function renderWindow({ practice = false }: { practice?: boolean } = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(client, 'invalidateQueries');
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <ReturnWindow open onClose={onClose} registerCode={practice ? 'TRAIN' : 'R1'} practice={practice} />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  printer.printReceipt.mockReset();
  printer.printReceipt.mockResolvedValue({ success: true, message: 'Receipt sent' });
  onClose.mockReset();
  openObject.mockReset();
  api.findReturns.mockResolvedValue(TICKETS);
  api.getReturnsReceipt.mockResolvedValue(receipt());
  api.previewReturn.mockResolvedValue(summary());
  api.confirmReturn.mockResolvedValue(finished());
});

const search = () => screen.getByTestId('returns-search');
type User = ReturnType<typeof userEvent.setup>;

/** Say why a ticked line is coming back. */
async function why(user: User, line: number, label: string) {
  await user.click(within(screen.getByTestId(`reason-${line}`)).getByRole('button', { name: label }));
}

/** One ticket straight open (found by its number), the lamp ticked with a reason, on to Check. */
async function toCheck(user: User, find: ReturnsFind = ONE_TICKET) {
  api.findReturns.mockResolvedValue(find);
  await user.type(search(), '14{Enter}');
  await user.click(await screen.findByTestId('line-11'));
  await why(user, 11, 'Does not work');
  await user.click(screen.getByTestId('returns-next'));
}

describe('Step 1, Start a return (#90: a real first screen, not a search bar)', () => {
  it('opens on "Start a return" with four big ways in, and the box has the cursor so a scan works with no tap', async () => {
    const user = userEvent.setup();
    renderWindow();
    expect(screen.getByTestId('return-start-head')).toHaveTextContent('Start a return');
    expect(screen.getByTestId('return-steps')).toHaveAccessibleName('Step 1 of 4: Start a return');
    const ways = within(screen.getByRole('group', { name: 'Ways to find the sale' })).getAllByRole('button');
    expect(ways.map((w) => w.textContent)).toEqual([
      expect.stringContaining("Scan an item's tag"), expect.stringContaining('Scan their Thrift+ QR'),
      expect.stringContaining('Find the member'), expect.stringContaining('Type the ticket number'),
    ]);
    expect(search()).toHaveFocus();
    expect(screen.getByTestId('return-start-hint')).toHaveTextContent('Ready to scan.');
    expect(screen.getByTestId('return-start-more')).toHaveTextContent(/the day of the sale .* its total .* words from the item/); // the rest of what it finds
    await user.keyboard('ITM100{Enter}'); // the scanner types and presses Enter: nothing was tapped first
    expect(api.findReturns).toHaveBeenCalledWith('ITM100', { register: 'R1' });
  });

  it('a way says what to do and readies the box; the box still finds anything', async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(screen.getByTestId('return-way-ticket'));
    expect(screen.getByTestId('return-way-ticket')).toHaveAttribute('aria-pressed', 'true');
    expect(search()).toHaveFocus(); // the cursor is back in the box
    expect(screen.getByLabelText('Ticket number')).toBe(search());
    expect(screen.getByTestId('return-start-hint')).toHaveTextContent('The ticket number is at the top of the receipt.');
    await user.click(screen.getByTestId('return-way-member'));
    expect(screen.getByLabelText("Member's name or phone")).toBe(search());
    await user.keyboard('ana{Enter}');
    expect(api.findReturns).toHaveBeenCalledWith('ana', { register: 'R1' });
    const rows = await within(await screen.findByTestId('returns-tickets')).findAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('R-20261020-014 · $150.00');
    expect(rows[0]).toHaveTextContent('3 items');
    expect(rows[1]).toHaveTextContent('R-20261019-002');
    expect(screen.getByText('Ana Member')).toBeInTheDocument();
    expect(screen.getByTestId('return-start-head')).toBeInTheDocument(); // the same screen: nothing jumped away
  });

  it('several people for a name wait to be picked, then their tickets show', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValueOnce({ kind: 'people', tickets: [], person: null, message: '', receipt: null,
      people: [TICKETS.person!, { ...TICKETS.person!, person_id: 8, account_id: 4, name: 'Ana Moss', first_name: 'Ana', last_name: 'Moss' }] });
    renderWindow();
    await user.type(search(), 'ana{Enter}');
    await user.click(await screen.findByText('Ana Moss'));
    expect(api.findReturns).toHaveBeenLastCalledWith('', { person: 8, register: 'R1' });
  });

  it('shows the message when nothing is found; late returns are listed in Transactions, not here', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValue({ kind: 'none', people: [], person: null, tickets: [], receipt: null, message: 'No ticket R-20200101-001. Check the number on the receipt.' });
    renderWindow();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    await user.type(search(), 'R-20200101-001{Enter}');
    expect(await screen.findByTestId('returns-message')).toHaveTextContent('No ticket R-20200101-001');
    expect(screen.getByTestId('return-way-tag')).toBeInTheDocument(); // the ways in are still there to try another
  });

  it('the X closes it', async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Step 2, The ticket (#90: pick what is coming back; each picked item asks its reason)', () => {
  it('shows the sale as the customer knows it, split into what can come back and what cannot', async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.type(search(), 'ana{Enter}');
    await user.click((await screen.findAllByText(/R-20261020-014/))[0]);
    expect(api.getReturnsReceipt).toHaveBeenCalledWith(5, 'R1');
    expect(await screen.findByTestId('receipt-head')).toHaveTextContent('Ticket R-20261020-014');
    expect(screen.getByTestId('return-steps')).toHaveAccessibleName('Step 2 of 4: The ticket');
    expect(screen.getByTestId('ticket-sale')).toHaveTextContent(/3 items · paid \$150\.00 \(cash\)/);
    expect(screen.getByTestId('ticket-card')).toHaveTextContent('Ana Member · rung by Pat Clerk');
    expect(screen.getByText('Returns through Fri Oct 23.')).toBeInTheDocument();
    expect(screen.getByTestId('returns-scan')).toHaveFocus();
    expect(screen.getByTestId('line-11')).toHaveTextContent('sold for $80.00');
    expect(screen.getByTestId('line-11')).toHaveTextContent('back $68.48 Thrift+ credit');
    const asIs = screen.getByTestId('returns-as-is');
    expect(within(asIs).getByText('Coffee mug')).toBeInTheDocument();
    expect(screen.getByText(/\$10.00 or less after ThriftBucks/)).toBeInTheDocument(); // why it cannot, in plain words, said once
    expect(screen.getByTestId('returns-next')).toBeDisabled();
    expect(screen.getByTestId('returns-next')).toHaveTextContent('Tap the items coming back');
  });

  it('a picked item asks why; Next waits until every picked item has its reason; a scan ticks a line', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValue(ONE_TICKET);
    renderWindow();
    await user.type(search(), '14{Enter}');
    await screen.findByTestId('receipt-head');
    expect(screen.queryByTestId('reason-11')).not.toBeInTheDocument(); // not asked until it is picked

    await user.click(screen.getByTestId('line-11'));
    const lamp = within(screen.getByTestId('reason-11'));
    expect(lamp.getByText('Why is it coming back?')).toBeInTheDocument();
    expect(lamp.getAllByRole('button').map((b) => b.textContent)).toEqual(REASONS.map((r) => r.label));
    expect(screen.getByTestId('returns-next')).toBeDisabled();
    expect(screen.getByTestId('returns-next')).toHaveTextContent('Pick a reason for Brass lamp');

    await user.type(screen.getByTestId('returns-scan'), 'itm200{Enter}'); // the vase's tag
    expect(screen.getByRole('checkbox', { name: 'Return Glass vase' })).toBeChecked();
    expect(screen.getByTestId('returns-next')).toHaveTextContent('Pick a reason for 2 items');
    await user.type(screen.getByTestId('returns-scan'), '{Enter}'); // Enter does not skip the reasons
    expect(screen.getByTestId('returns-scan-note')).toHaveTextContent('Pick a reason for Brass lamp first.');
    expect(api.previewReturn).not.toHaveBeenCalled();

    await why(user, 11, 'Does not work');
    expect(lamp.getByRole('button', { name: 'Does not work' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('returns-scan')).toHaveFocus(); // the next scan still lands in the box
    await user.type(screen.getByLabelText('Note for Brass lamp'), 'Buzzes when on');
    expect(screen.getByTestId('returns-next')).toHaveTextContent('Pick a reason for Glass vase');
    await why(user, 12, 'Changed mind');
    expect(screen.getByTestId('returns-next')).toBeEnabled();
    expect(screen.getByTestId('returns-next')).toHaveTextContent('Next: check the return (2 items, $121.98)');

    await user.type(screen.getByTestId('returns-scan'), 'itm200{Enter}'); // the scanner reads it twice
    expect(screen.getByRole('checkbox', { name: 'Return Glass vase' })).toBeChecked(); // still ticked
    expect(screen.getByTestId('returns-scan-note')).toHaveTextContent('Already ticked: Glass vase');
    await user.type(screen.getByTestId('returns-scan'), 'itm300{Enter}');
    expect(screen.getByTestId('returns-scan-note')).toHaveTextContent('Cannot come back (sold AS IS): Coffee mug');
    await user.type(screen.getByTestId('returns-scan'), 'zzz9{Enter}');
    expect(screen.getByTestId('returns-scan-note')).toHaveTextContent('Not on this ticket: zzz9');
  });

  it('several of one thing for one reason: "Same reason for the other N" puts the reason picked last on the rest', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValue(ONE_TICKET);
    renderWindow();
    await user.type(search(), '14{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Tick all' }));
    expect(screen.queryByTestId('returns-same-reason')).not.toBeInTheDocument(); // nothing to copy yet
    await why(user, 12, 'Not as described');
    await user.type(screen.getByLabelText('Note for Glass vase'), 'Chipped rim');
    await user.click(screen.getByRole('button', { name: 'Same reason for the other 1' }));
    expect(within(screen.getByTestId('reason-11')).getByRole('button', { name: 'Not as described' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Note for Brass lamp')).toHaveValue('Chipped rim');
    expect(screen.queryByTestId('returns-same-reason')).not.toBeInTheDocument(); // every item has its reason
    expect(screen.getByTestId('returns-next')).toBeEnabled();
    expect(screen.getByTestId('returns-scan')).toHaveFocus();
  });

  it('a scan warning takes the hint line, so the list never moves; a ticket with nothing to return says so', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValue(ONE_TICKET);
    renderWindow();
    await user.type(search(), '14{Enter}');
    const hint = await screen.findByText('Scan or tap each item coming back.');
    await user.type(screen.getByTestId('returns-scan'), 'zzz9{Enter}');
    expect(screen.getByTestId('returns-scan-note')).toBe(hint); // the same line, new words
    expect(screen.getByText('Coffee mug')).toBeInTheDocument();

    api.findReturns.mockResolvedValue({ ...ONE_TICKET, receipt: receipt({ lines: [MUG, { ...MUG, cart_line: 14 }] }) });
    await user.click(screen.getByRole('button', { name: 'Find another ticket' }));
    expect(screen.getByTestId('return-start-head')).toBeInTheDocument(); // back at Start a return
    await user.type(search(), '14{Enter}');
    expect(await screen.findByTestId('receipt-none')).toHaveTextContent('Nothing on this ticket can come back.');
    expect(screen.queryByText(/Returns through/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('returns-scan')).not.toBeInTheDocument();
    expect(screen.getByText('Coffee mug × 2')).toBeInTheDocument(); // the same item once, with a count
  });
});

describe('Step 3, Check, then confirm (#90: what is coming back, each reason, what the customer gets)', () => {
  it('lists each item with its reason and what they get; Confirm sends the reasons with the lines', async () => {
    const user = userEvent.setup();
    api.findReturns.mockResolvedValue({ ...ONE_TICKET, kind: 'item' });
    renderWindow();
    await user.type(search(), 'ITM100{Enter}');
    await screen.findByTestId('receipt-head');
    expect(api.getReturnsReceipt).not.toHaveBeenCalled(); // one ticket: no second request
    expect(screen.getByRole('checkbox', { name: 'Return Brass lamp' })).toBeChecked(); // found by its tag: already ticked
    await why(user, 11, 'Other');
    await user.type(screen.getByLabelText('Note for Brass lamp'), 'Too tall for the shelf');
    await user.click(screen.getByTestId('line-12'));
    await why(user, 12, 'Missing parts');
    await user.type(screen.getByTestId('returns-scan'), '{Enter}'); // nothing typed and every reason in: on to Check

    expect(api.previewReturn).toHaveBeenCalledWith(5, [11, 12], 'R1');
    expect(await screen.findByTestId('summary-credit')).toHaveTextContent('Thrift+ credit $121.98');
    expect(screen.getByTestId('return-steps')).toHaveAccessibleName('Step 3 of 4: Check');
    expect(screen.getByText('Check the return')).toBeInTheDocument();
    expect(screen.getByTestId('summary-who')).toHaveTextContent('For Ana Member · ticket R-20261020-014');
    expect(screen.getByTestId('summary-line-11')).toHaveTextContent('Brass lamp');
    expect(screen.getByTestId('summary-why-11')).toHaveTextContent('Other (Too tall for the shelf)');
    expect(screen.getByTestId('summary-why-12')).toHaveTextContent('Missing parts');
    expect(screen.getByTestId('summary-bucks')).toHaveTextContent('38.00 ThriftBucks come off their balance');
    expect(screen.getByTestId('summary-bucks')).not.toHaveTextContent('go back'); // nothing given back: not said
    expect(screen.getByText(/Glance: not broken or heavily used since the sale. Any reason is fine./)).toBeInTheDocument();
    expect(screen.queryByTestId('returns-late-box')).not.toBeInTheDocument();
    expect(screen.getByTestId('returns-confirm')).toHaveFocus(); // Enter finishes it
    await user.keyboard('{Enter}'); // a scanner's second Enter right away does not confirm a return unseen
    expect(api.confirmReturn).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('returns-confirm'));
    expect(api.confirmReturn).toHaveBeenCalledWith({
      cart: 5, cart_lines: [11, 12], register: 'R1',
      reasons: { 11: { reason: 'other', note: 'Too tall for the shelf' }, 12: { reason: 'missing_parts', note: '' } },
    });
  });

  it('Back from Check keeps the picks and their reasons', async () => {
    const user = userEvent.setup();
    renderWindow();
    await toCheck(user);
    await screen.findByTestId('summary-credit');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('checkbox', { name: 'Return Brass lamp' })).toBeChecked();
    expect(within(screen.getByTestId('reason-11')).getByRole('button', { name: 'Does not work' })).toHaveAttribute('aria-pressed', 'true');
  });

  it("past the 3 days Check asks for a reason and a manager's PIN, and a wrong PIN says how many tries are left", async () => {
    const user = userEvent.setup();
    api.previewReturn.mockResolvedValue(summary({ late: true, lines: [{ ...summary().lines[0], late: true }] }));
    api.confirmReturn.mockRejectedValueOnce({ response: { data: { code: 'PIN_WRONG', detail: 'That PIN is wrong.', tries_left: 4 } } });
    renderWindow();
    api.findReturns.mockResolvedValue({ ...ONE_TICKET, receipt: receipt({ late: true, lines: [{ ...LAMP, late: true }, MUG] }) });
    await user.type(search(), 'R-20261020-014{Enter}');
    expect(await screen.findByTestId('receipt-late')).toHaveTextContent("needs a manager's PIN");
    expect(screen.queryByText(/past the 3 days/)).not.toBeInTheDocument(); // the card says it once, not every line
    await user.click(screen.getByTestId('line-11'));
    await why(user, 11, 'Broken or damaged');
    await user.click(screen.getByTestId('returns-next'));
    await screen.findByTestId('returns-late-box');
    const confirm = screen.getByTestId('returns-confirm');
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveTextContent('Say why it is allowed first');
    expect(screen.getByTestId('returns-late-head')).toHaveFocus(); // on the question: no reason is picked for them
    await user.keyboard('{Enter}');
    expect(confirm).toHaveTextContent('Say why it is allowed first'); // a stray Enter records nothing
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Store was closed' })).toHaveFocus(); // arrows move between the reasons
    await user.click(screen.getByRole('button', { name: 'Store was closed' }));
    expect(screen.getByTestId('manager-pin-input')).toHaveFocus(); // then the PIN
    expect(confirm).toBeDisabled(); // a reason is not enough: the PIN too
    await user.type(screen.getByTestId('manager-pin-input'), '0000');
    expect(screen.getByTestId('manager-pin-input')).toHaveAttribute('type', 'password');
    await user.type(screen.getByLabelText('Note (optional)'), 'Closed Sun and Mon');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(await screen.findByTestId('returns-error')).toHaveTextContent('That PIN is wrong. 4 tries left.');
    expect(screen.getByTestId('manager-pin-input')).toHaveValue(''); // cleared for another try
    expect(screen.queryByTestId('return-complete')).not.toBeInTheDocument(); // nothing went through
    expect(printer.printReceipt).not.toHaveBeenCalled();

    await user.type(screen.getByTestId('manager-pin-input'), '4821{Enter}');
    await waitFor(() => expect(api.confirmReturn).toHaveBeenLastCalledWith({
      cart: 5, cart_lines: [11], register: 'R1', reasons: { 11: { reason: 'damaged', note: '' } },
      late: { reason: 'closed', note: 'Closed Sun and Mon' }, pin: '4821',
    }));
    expect(await screen.findByTestId('return-complete')).toBeInTheDocument();
  });

  it('the owner signed in needs no PIN', async () => {
    const user = userEvent.setup();
    api.previewReturn.mockResolvedValue(summary({ late: true, owner_signed_in: true }));
    renderWindow();
    await toCheck(user, { ...ONE_TICKET, receipt: receipt({ late: true, lines: [{ ...LAMP, late: true }] }) });
    await screen.findByTestId('returns-late-box');
    expect(screen.queryByTestId('manager-pin-input')).not.toBeInTheDocument();
    expect(screen.getByText(/no PIN needed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Owner's choice" }));
    await user.click(screen.getByTestId('returns-confirm'));
    expect(api.confirmReturn).toHaveBeenCalledWith({
      cart: 5, cart_lines: [11], register: 'R1', reasons: { 11: { reason: 'not_working', note: '' } }, late: { reason: 'owner', note: '' },
    });
  });

  it("a late return asks for a manager's own PIN (the shared owner PIN is retired) and waits for it", async () => {
    const user = userEvent.setup();
    api.previewReturn.mockResolvedValue(summary({ late: true }));
    renderWindow();
    await toCheck(user, { ...ONE_TICKET, receipt: receipt({ late: true, lines: [{ ...LAMP, late: true }] }) });
    expect(await screen.findByLabelText(/Manager PIN/)).toBeInTheDocument();
    expect(screen.queryByText(/owner PIN/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Store was closed' }));
    expect(screen.getByTestId('returns-confirm')).toBeDisabled();
  });
});

describe('Step 4, Return complete (#90: it says so, and the return receipt prints by itself)', () => {
  it('says the return went through and what the customer got, and prints one return receipt with no tap', async () => {
    const user = userEvent.setup();
    renderWindow();
    await toCheck(user);
    await user.click(await screen.findByTestId('returns-confirm'));

    expect(await screen.findByTestId('return-complete')).toHaveTextContent('Return complete');
    expect(screen.getByTestId('return-steps')).toHaveAccessibleName('Step 4 of 4: Return complete');
    expect(screen.getByTestId('return-got')).toHaveTextContent('Ana Member got $68.48 Thrift+ credit.');
    expect(screen.getByTestId('return-bucks')).toHaveTextContent('28.00 ThriftBucks came off their balance.');
    expect(screen.getByTestId('return-balance')).toHaveTextContent('Their Thrift+ credit is now $68.48.');
    const lines = within(screen.getByTestId('return-done-lines'));
    expect(screen.getByTestId('return-done-lines')).toHaveTextContent('From ticket R-20261020-014');
    expect(lines.getByText('Brass lamp')).toBeInTheDocument();
    expect(lines.getByText('Does not work')).toBeInTheDocument();
    // The receipt: by itself, once, the server's payload as it is, and the cash drawer stays shut.
    await waitFor(() => expect(screen.getByTestId('return-print')).toHaveTextContent('The return receipt printed.'));
    expect(printer.printReceipt).toHaveBeenCalledTimes(1);
    expect(printer.printReceipt).toHaveBeenCalledWith(SLIP, false);
    expect(invalidated()).toContainEqual(['member-window', 7]); // read again: the new credit, not the old
    expect(onClose).not.toHaveBeenCalled(); // it stays until the cashier has seen it
    expect(openObject).not.toHaveBeenCalled();
    expect(screen.getByTestId('return-done')).toHaveFocus();

    await user.click(screen.getByTestId('return-done'));
    expect(onClose).toHaveBeenCalledTimes(1); // back to the Register
  });

  it('a receipt that does not print is said on the done screen and never undoes the return; Print again prints it', async () => {
    const user = userEvent.setup();
    printer.printReceipt.mockRejectedValueOnce(new PrintFailedError('The receipt did not print. Receipt print failed: Printer is out of paper'));
    renderWindow();
    await toCheck(user);
    await user.click(await screen.findByTestId('returns-confirm'));

    expect(await screen.findByTestId('return-complete')).toHaveTextContent('Return complete'); // the return stands
    const failed = await screen.findByTestId('return-print-failed');
    expect(failed).toHaveTextContent('The return receipt did not print. Receipt print failed: Printer is out of paper. The return itself went through.');
    expect(api.confirmReturn).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('return-print-again'));
    await waitFor(() => expect(screen.getByTestId('return-print')).toHaveTextContent('The return receipt printed.'));
    expect(printer.printReceipt).toHaveBeenLastCalledWith(SLIP, false); // the first one never came out: this is the original
    expect(api.confirmReturn).toHaveBeenCalledTimes(1); // printing again never returns anything again

    await user.click(screen.getByTestId('return-print-again')); // one more, after a good print: a copy, and it says so
    await waitFor(() => expect(printer.printReceipt).toHaveBeenCalledTimes(3));
    expect(printer.printReceipt).toHaveBeenLastCalledWith({ ...SLIP, copy: true, receipt_number: 'RETURN R-20261020-014 COPY' }, false);
  });

  it('no print server at all: the same plain warning', async () => {
    const user = userEvent.setup();
    printer.printReceipt.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderWindow();
    await toCheck(user);
    await user.click(await screen.findByTestId('returns-confirm'));
    expect(await screen.findByTestId('return-print-failed')).toHaveTextContent('The print server did not answer. Is it running?');
    expect(screen.getByTestId('return-complete')).toBeInTheDocument();
  });

  it('a return whose receipt could not be made still says it went through', async () => {
    const user = userEvent.setup();
    api.confirmReturn.mockResolvedValue(finished({ receipt: null }));
    renderWindow();
    await toCheck(user);
    await user.click(await screen.findByTestId('returns-confirm'));
    expect(await screen.findByTestId('return-print-none')).toHaveTextContent('The return went through, but its receipt could not be made.');
    expect(printer.printReceipt).not.toHaveBeenCalled();
    expect(screen.getByTestId('return-print-again')).toBeDisabled();
  });

  it('"Another return for this customer" goes to their tickets; the next ticket is its own return with its own receipt', async () => {
    const user = userEvent.setup();
    renderWindow();
    await toCheck(user);
    await user.click(await screen.findByTestId('returns-confirm'));
    await screen.findByTestId('return-complete');

    api.findReturns.mockResolvedValue(TICKETS);
    await user.click(screen.getByTestId('return-another'));
    expect(api.findReturns).toHaveBeenLastCalledWith('', { person: 7, register: 'R1' }); // straight to this customer
    const rows = await within(await screen.findByTestId('returns-tickets')).findAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(screen.getByTestId('return-steps')).toHaveAccessibleName('Step 1 of 4: Start a return');

    // Their other ticket: one item, its own Confirm, its own receipt.
    const SECOND = { receipt_number: 'RETURN R-20261019-002', kind: 'return', total: 53.5 };
    api.getReturnsReceipt.mockResolvedValue(receipt({ cart: 4, receipt_number: 'R-20261019-002', lines: [VASE] }));
    api.previewReturn.mockResolvedValue(summary({ lines: [summary().lines[1]], totals: { credit: '53.50', bucks_back: '0.00', bucks_taken: '10.00', shortfall: '0.00' } }));
    api.confirmReturn.mockResolvedValue(finished({ totals: { credit: '53.50', bucks_back: '0.00', bucks_taken: '10.00', shortfall: '0.00' }, credit: '121.98', receipt: SECOND }));
    await user.click(rows[1]);
    expect(api.getReturnsReceipt).toHaveBeenCalledWith(4, 'R1');
    expect(await screen.findByTestId('receipt-head')).toHaveTextContent('Ticket R-20261019-002');
    expect(screen.queryByTestId('reason-12')).not.toBeInTheDocument(); // a clean ticket: nothing carried over
    await user.click(screen.getByTestId('line-12'));
    await why(user, 12, 'Changed mind');
    await user.click(screen.getByTestId('returns-next'));
    await user.click(await screen.findByTestId('returns-confirm'));
    expect(api.confirmReturn).toHaveBeenLastCalledWith({ cart: 4, cart_lines: [12], register: 'R1', reasons: { 12: { reason: 'changed_mind', note: '' } } });
    expect(await screen.findByTestId('return-got')).toHaveTextContent('Ana Member got $53.50 Thrift+ credit.');
    await waitFor(() => expect(printer.printReceipt).toHaveBeenCalledTimes(2)); // two tickets, two return receipts
    expect(printer.printReceipt.mock.calls.map(([slip]) => (slip as { receipt_number: string }).receipt_number))
      .toEqual(['RETURN R-20261020-014', 'RETURN R-20261019-002']);
  });

  it('their member window is one tap away, and closes the Return window', async () => {
    const user = userEvent.setup();
    renderWindow();
    await toCheck(user);
    await user.click(await screen.findByTestId('returns-confirm'));
    await user.click(await screen.findByTestId('return-member'));
    expect(onClose).toHaveBeenCalled();
    expect(openObject).toHaveBeenCalledWith({ type: 'member', id: 7 });
  });

  it('practice (the training register) asks for no PIN, gives nothing, says so, and still prints its practice receipt', async () => {
    const user = userEvent.setup();
    api.previewReturn.mockResolvedValue(summary({ late: true }));
    const practiceSlip = { ...SLIP, training: true };
    api.confirmReturn.mockResolvedValue(finished({ training: true, receipt: practiceSlip, credit: undefined }));
    renderWindow({ practice: true });
    expect(screen.getByText('Return (practice)')).toBeInTheDocument();
    await toCheck(user, { ...ONE_TICKET, receipt: receipt({ practice: true, late: true, lines: [{ ...LAMP, late: true }] }) });
    expect(api.findReturns).toHaveBeenCalledWith('14', { register: 'TRAIN' });
    await screen.findByTestId('returns-late-box');
    expect(screen.queryByTestId('manager-pin-input')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Store was closed' }));
    await user.click(screen.getByTestId('returns-confirm'));
    expect(await screen.findByTestId('return-complete')).toHaveTextContent('Practice return complete');
    expect(screen.getByTestId('return-got')).toHaveTextContent('Practice: nothing was given.');
    expect(screen.queryByTestId('return-balance')).not.toBeInTheDocument();
    await waitFor(() => expect(printer.printReceipt).toHaveBeenCalledWith(practiceSlip, false)); // the server bands it TRAINING
  });
});
