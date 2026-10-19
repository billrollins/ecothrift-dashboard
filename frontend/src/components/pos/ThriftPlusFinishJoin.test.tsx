import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThriftPendingPerson } from '../../api/thriftplusRegister.api';
import type { Cart, ThriftPlusCartBlock } from '../../types/pos.types';
import ThriftPlusFinishJoinDialog, { phoneDigits, phoneReadBack } from './ThriftPlusFinishJoinDialog';
import ThriftPlusPanel from './ThriftPlusPanel';
import ThriftPlusSignupDialog from './ThriftPlusSignupDialog';

/** Owner 2026-10-15 (J8): joined online with a name and email; the register finishes joining. */
const CARA = vi.hoisted<ThriftPendingPerson>(() => ({
  person_id: 21, account_id: 8, first_name: 'Cara', last_name: 'Joyner', email: 'cara@example.com',
  joined_at: '2026-10-15T15:00:00Z', code_last4: '8904',
}));

const calls = vi.hoisted(() => ({
  finds: [] as string[],
  finished: [] as unknown[],
  rerung: [] as Array<[number, number]>,
}));

vi.mock('../../api/thriftplus.api', () => ({
  fetchEmailNote: async () => ({ note: "We'll email your receipts and Thrift+ updates." }),
  createMember: async () => ({ people: [{ id: 9 }] }),
}));

vi.mock('../../api/thriftplusRegister.api', () => ({
  findPendingJoins: async (q: string) => {
    calls.finds.push(q);
    return !q || 'cara joyner cara@example.com'.includes(q.toLowerCase()) ? [CARA] : [];
  },
  finishThriftJoin: async (body: { phone?: string; cart?: number | null }) => {
    calls.finished.push(body);
    if (body.phone === '4025550101') {
      const err = { response: { data: { code: 'PHONE_TAKEN', detail: 'That phone number is on another membership. Check the ID and ask a manager.' } } };
      throw err;
    }
    return {
      person_id: 21, account_id: 8, first_name: 'Cara', last_name: 'Joyner', status: 'active',
      cart: body.cart ? { id: body.cart, status: 'open', thrift_plus: { member: { name: 'Cara Joyner' } } } : null,
    };
  },
  reringThriftMember: async (cartId: number, personId: number) => {
    calls.rerung.push([cartId, personId]);
    return { thrift_plus: { collected: '12.00', use_by: '2026-11-19', member: { name: 'Cara Joyner' } } };
  },
  attachThriftMember: async () => {
    throw { response: { data: { code: 'MEMBER_PENDING' } } };
  },
  findThriftMembers: async () => [
    { person_id: 21, account_id: 8, first_name: 'Cara', last_initial: 'J', role: 'primary', photo_url: null, verified_18: false,
      practice: false, account_status: 'active' },
  ],
  detachThriftCard: async () => ({}),
  refreshCart: async () => ({}),
  setThriftChoice: async () => ({}),
  uploadThriftSalePhoto: async () => undefined,
  useThriftBucks: async () => ({}),
  pendingFromError: (err: { response?: { data?: { code?: string } } }) => (err?.response?.data?.code === 'MEMBER_PENDING' ? CARA : null),
  thriftErrorMessage: (err: { response?: { data?: { detail?: string } } }, fallback = 'error') => err?.response?.data?.detail ?? fallback,
}));

beforeEach(() => {
  calls.finds = [];
  calls.finished = [];
  calls.rerung = [];
});

function block(over: Partial<ThriftPlusCartBlock> = {}): ThriftPlusCartBlock {
  return {
    live: true, member: null, instant_offered: false, instant_reason: '', instant_share: '0.50', collected: '12.00',
    use_by: null, instant_bucks: '0.00', instant_off: '0.00', bucks_auto: true, bucks_available: '0.00', bucks_used: '0.00',
    credit_available: '0.00', credit_used: '0.00', balances: { bucks: '0.00', bucks_use_by: null, credit: '0.00' },
    guest_line: '', lines: {}, bucks_line_id: null, restricted_line_ids: [], amount_due: '42.80', ...over,
  };
}

const openCart: Cart = {
  id: 3, drawer: 1, cashier: 1, cashier_name: 'Pat', customer: null, status: 'open', subtotal: '40.00', tax_rate: '0.0700',
  tax_amount: '2.80', total: '42.80', payment_method: 'cash', cash_tendered: null, change_given: null, card_amount: null,
  completed_at: null, created_at: '2026-10-21T15:00:00Z', lines: [], thrift_credit: '0.00', thrift_plus: block(),
};

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

describe('Joined online? at the register (owner 2026-10-15, J8)', () => {
  it('finds the person by name or email in the Thrift+ panel and opens Finish joining', async () => {
    const user = userEvent.setup();
    const onFinishJoin = vi.fn();
    wrap(<ThriftPlusPanel cart={openCart} onCart={() => undefined} onFinishJoin={onFinishJoin} />);
    await user.click(screen.getByRole('button', { name: 'Joined online?' }));
    expect(screen.getByText('Joined online? Find them by name or email, or scan the QR in their Thrift+ app.')).toBeInTheDocument();
    expect(await screen.findByText('Cara Joyner')).toBeInTheDocument(); // the newest joins, before anything is typed
    expect(calls.finds).toEqual(['']);
    await user.type(screen.getByLabelText('Name or email'), 'cara@example{Enter}');
    expect(calls.finds).toEqual(['', 'cara@example']);
    const people = await screen.findByTestId('thrift-pending-people');
    expect(within(people).getByText(/cara@example\.com · joined/)).toBeInTheDocument();
    await user.click(within(people).getByText('Cara Joyner'));
    expect(onFinishJoin).toHaveBeenCalledWith(CARA);
  });

  it('says so when no one by that name joined online', async () => {
    const user = userEvent.setup();
    wrap(<ThriftPlusPanel cart={openCart} onCart={() => undefined} onFinishJoin={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Joined online?' }));
    await user.type(screen.getByLabelText('Name or email'), 'zed{Enter}');
    expect(await screen.findByText('No one who joined online by that name or email.')).toBeInTheDocument();
  });

  it('opens Finish joining, not an error, when the register answers MEMBER_PENDING', async () => {
    const user = userEvent.setup();
    const onFinishJoin = vi.fn();
    const onCart = vi.fn();
    wrap(<ThriftPlusPanel cart={openCart} onCart={onCart} onFinishJoin={onFinishJoin} />);
    await user.type(screen.getByLabelText('Phone number'), '402-555-0177{Enter}');
    await user.click(await screen.findByText('Cara J.')); // attach answers MEMBER_PENDING
    expect(onFinishJoin).toHaveBeenCalledWith(CARA);
    expect(onCart).not.toHaveBeenCalled();
  });

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

describe('Finish joining', () => {
  it("says they need to finalize and shows their QR big, for the Finalize phone to scan off the screen", () => {
    wrap(
      <ThriftPlusFinishJoinDialog
        open
        person={{ ...CARA, qr: 'TP402155831907', code_last4: '1907' }}
        onClose={() => undefined}
        cart={openCart}
        lastSale={null}
        onCart={() => undefined}
      />,
    );
    expect(screen.getByText('Needs to finalize Thrift+')).toBeInTheDocument();
    expect(screen.getByTestId('thrift-finish-qr')).toHaveTextContent('Open Finalize and scan this QR. Or finish here below.');
    expect(screen.getByRole('img', { name: "Cara Joyner's member QR" })).toBeInTheDocument();
    expect(screen.getByText('Member code ending 1907')).toBeInTheDocument();
  });

  it('reads the phone back, then the ID and photo, and puts them on the sale', async () => {
    const user = userEvent.setup();
    const onCart = vi.fn();
    wrap(<ThriftPlusFinishJoinDialog open person={CARA} onClose={() => undefined} cart={openCart} lastSale={null} onCart={onCart} />);
    expect(screen.getByText('Cara Joyner')).toBeInTheDocument();
    expect(screen.getByText('Joined online with cara@example.com.')).toBeInTheDocument();
    expect(screen.getByText("Ask their phone number. It's optional: leave it blank to skip.")).toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Next' });
    await user.type(screen.getByLabelText('Phone number (optional)'), '555-0123');
    expect(next).toBeDisabled(); // the whole number: 10 digits
    expect(screen.getByText('The whole number: 10 digits.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Phone number (optional)'));
    await user.type(screen.getByLabelText('Phone number (optional)'), '402 555 0123');
    await user.click(next);
    expect(screen.getByTestId('thrift-finish-readback')).toHaveTextContent('(402) 555-0123 — read it back to them');
    await user.click(screen.getByRole('button', { name: 'Change it' }));
    expect(screen.getByLabelText('Phone number (optional)')).toHaveValue('402 555 0123');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: "That's right" }));
    expect(screen.getByText(/Without an ID check they still collect ThriftBucks/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'The ID shows 18 or older' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Checked a photo ID (the name matches)' }));
    await user.click(screen.getByRole('checkbox', { name: 'The ID shows 18 or older' }));
    expect(screen.getByText('Take or add a photo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish joining' }));
    const done = await screen.findByTestId('thrift-finish-done');
    expect(calls.finished).toEqual([{ person: 21, phone: '4025550123', id_checked: true, verified_18: true, photo: null, cart: 3 }]);
    expect(onCart).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(done).toHaveTextContent('Welcome, Cara.');
    expect(done).toHaveTextContent('They are on this sale.');
    expect(done).toHaveTextContent('show their member QR, or give their phone number');
    expect(document.body.textContent ?? '').not.toMatch(/\bcards?\b/i);
  });

  it('a phone on another membership goes back to the phone with the message', async () => {
    const user = userEvent.setup();
    wrap(<ThriftPlusFinishJoinDialog open person={CARA} onClose={() => undefined} cart={openCart} lastSale={null} onCart={() => undefined} />);
    await user.type(screen.getByLabelText('Phone number (optional)'), '(402) 555-0101{Enter}');
    await user.click(screen.getByRole('button', { name: "That's right" }));
    await user.click(screen.getByRole('button', { name: 'Finish joining' }));
    expect(await screen.findByTestId('thrift-finish-phone-error')).toHaveTextContent(
      'That phone number is on another membership. Check the ID and ask a manager.',
    );
    expect(screen.getByLabelText('Phone number (optional)')).toBeInTheDocument();
  });

  it('re-rings the last sale when there is no open sale', async () => {
    const user = userEvent.setup();
    const onRerung = vi.fn();
    wrap(
      <ThriftPlusFinishJoinDialog
        open person={CARA} onClose={() => undefined} cart={null} lastSale={{ id: 41, total: '42.80' }}
        onCart={() => undefined} onRerung={onRerung}
      />,
    );
    await user.type(screen.getByLabelText('Phone number (optional)'), '4025550123{Enter}');
    await user.click(screen.getByRole('button', { name: "That's right" }));
    expect(screen.getByRole('checkbox', { name: 'Re-ring the last sale ($42.80) for them' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Finish joining' }));
    expect(await screen.findByTestId('thrift-finish-done')).toHaveTextContent('Re-rung for Cara: 12.00 ThriftBucks kept');
    expect(calls.rerung).toEqual([[41, 21]]);
    expect(onRerung).toHaveBeenCalled();
  });

  it('the training register cannot finish a real membership', () => {
    wrap(<ThriftPlusFinishJoinDialog open training person={CARA} onClose={() => undefined} cart={openCart} lastSale={null} onCart={() => undefined} />);
    expect(screen.getByText('This is the training register. Finish joining on a real register.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Phone number/)).not.toBeInTheDocument();
  });

  it('the phone is optional: left blank, Next goes straight to the ID and no phone is sent (Join v2)', async () => {
    const user = userEvent.setup();
    wrap(<ThriftPlusFinishJoinDialog open person={CARA} onClose={() => undefined} cart={openCart} lastSale={null} onCart={() => undefined} />);
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeEnabled();
    await user.click(next);
    expect(screen.queryByTestId('thrift-finish-readback')).not.toBeInTheDocument();
    expect(screen.getByText('Check their photo ID and take the photo.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Phone number (optional)')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('checkbox', { name: 'Checked a photo ID (the name matches)' }));
    await user.click(screen.getByRole('button', { name: 'Finish joining' }));
    const done = await screen.findByTestId('thrift-finish-done');
    expect(calls.finished).toEqual([{ person: 21, id_checked: true, verified_18: false, photo: null, cart: 3 }]);
    expect(done).toHaveTextContent('show their member QR.');
    expect(done).not.toHaveTextContent('give their phone number');
  });

  it('formats the phone for the read-back', () => {
    expect(phoneDigits('+1 (402) 555-0123')).toBe('4025550123');
    expect(phoneDigits('555-0123')).toBe('');
    expect(phoneReadBack('4025550123')).toBe('(402) 555-0123');
  });
});

describe('Finish joining, the selfie path (Join v2, owner 2026-10-19)', () => {
  const READY: ThriftPendingPerson = {
    ...CARA, status: 'pending', selfie: true, signed: true, photo_url: '/media/cara-selfie.jpg', contact: 'c***@example.com',
    qr: 'TP402155831907',
  };

  it('a selfie and a signature from the app: the selfie, the three checks and Verified; no phone, photo or signature', async () => {
    const user = userEvent.setup();
    const onCart = vi.fn();
    wrap(<ThriftPlusFinishJoinDialog open person={READY} onClose={() => undefined} cart={openCart} lastSale={null} onCart={onCart} />);
    expect(screen.getByRole('img', { name: "Cara Joyner's selfie" })).toHaveAttribute('src', '/media/cara-selfie.jpg');
    expect(screen.getByTestId('thrift-finish-verify')).toHaveTextContent('c***@example.com');
    expect(screen.getByText('Check their photo ID')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Phone number/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('thrift-finish-qr')).not.toBeInTheDocument();
    expect(screen.queryByTestId('thrift-finish-signature')).not.toBeInTheDocument();
    expect(screen.queryByText('Take or add a photo')).not.toBeInTheDocument();
    const verified = screen.getByRole('button', { name: 'Verified' });
    expect(verified).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '18 or older' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Name matches' }));
    expect(verified).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Face matches the photo' }));
    expect(verified).toBeEnabled();
    await user.click(screen.getByRole('checkbox', { name: '18 or older' }));
    await user.click(verified);
    const done = await screen.findByTestId('thrift-finish-done');
    expect(calls.finished).toEqual([{ person: 21, id_checked: true, face_matches: true, verified_18: true, finalize: true, cart: 3 }]);
    expect(onCart).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(done).toHaveTextContent('Welcome, Cara.');
    expect(document.body.textContent ?? '').not.toMatch(/\bcards?\b/i);
  });

  it('Retake photo sends the new photo with Verified, and the last sale can be re-rung', async () => {
    const user = userEvent.setup();
    wrap(
      <ThriftPlusFinishJoinDialog
        open person={READY} onClose={() => undefined} cart={null} lastSale={{ id: 41, total: '42.80' }} onCart={() => undefined}
      />,
    );
    const photo = new File(['jpg'], 'new.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByTestId('selfie-check-retake-input'), photo);
    expect(await screen.findByRole('img', { name: 'The new photo' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Re-ring the last sale ($42.80) for them' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Name matches' }));
    await user.click(screen.getByRole('checkbox', { name: 'Face matches the photo' }));
    await user.click(screen.getByRole('button', { name: 'Verified' }));
    expect(await screen.findByTestId('thrift-finish-done')).toHaveTextContent('Re-rung for Cara');
    expect(calls.finished).toEqual([
      { person: 21, id_checked: true, face_matches: true, verified_18: false, finalize: true, cart: null, photo },
    ]);
    expect(calls.rerung).toEqual([[41, 21]]);
  });

  it('a selfie without a signature keeps the register path (phone optional, ID, photo, signature)', () => {
    wrap(
      <ThriftPlusFinishJoinDialog
        open person={{ ...READY, signed: false }} onClose={() => undefined} cart={openCart} lastSale={null} onCart={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Phone number (optional)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verified' })).not.toBeInTheDocument();
  });
});