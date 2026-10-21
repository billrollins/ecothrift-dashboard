import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThriftPendingPerson } from '../../api/thriftplusRegister.api';
import type { Cart, ThriftPlusCartBlock } from '../../types/pos.types';
import ThriftMemberDialog from './ThriftMemberDialog';

/** Find -> pick -> on the sale -> their card -> Finalize (the ID check) -> Add a 2nd person (owner 2026-10-20). */
const m = vi.hoisted(() => ({
  searches: [] as string[],
  found: [] as unknown[],
  member: undefined as unknown,
  attached: [] as Array<[number, number]>,
  scanned: [] as Array<[number, string]>,
  detached: [] as number[],
  finished: [] as Array<Record<string, unknown>>,
  added: [] as unknown[],
  attachError: null as unknown,
}));

const ANA = vi.hoisted<ThriftPendingPerson>(() => ({
  person_id: 5, account_id: 1, first_name: 'Ana', last_name: 'Bell', email: 'ana@example.com', joined_at: '2026-10-19T15:00:00Z',
  code_last4: '0008', code_display: '1000 0000 0008', status: 'active', photo_url: '/media/ana.jpg', phone_last4: '0101',
}));
const CY = vi.hoisted<ThriftPendingPerson>(() => ({
  person_id: 9, account_id: 2, first_name: 'Cy', last_name: 'Lee', email: 'cy@example.com', joined_at: '2026-10-20T15:00:00Z',
  code_last4: '1111', code_display: '1000 0000 1111', status: 'pending', photo_url: '/media/cy.jpg', selfie: true, signed: true,
}));

function cardFor(person: ThriftPendingPerson, standing: 'member' | 'pending', people = 1) {
  return {
    person: { ...person, name: `${person.first_name} ${person.last_name}`, standing, role: 'primary', practice: false, verified_18: true },
    rewards: { collected: '10.00', used: '0.00', balance: '10.00', usable_today: '10.00', use_by: '2026-11-19', credit: '0.00' },
    trips: [],
    people: Array.from({ length: people }, (_, i) => ({
      person_id: person.person_id + i, first_name: i ? 'Ben' : person.first_name, name: i ? 'Ben Bell' : `${person.first_name} ${person.last_name}`,
      role: i ? 'secondary' : 'primary', photo_url: null, verified_18: true,
    })),
  };
}

vi.mock('../../api/thriftplusRegister.api', () => ({
  findPendingOrMember: async (q: string) => {
    m.searches.push(q);
    return { people: m.found, member: m.member };
  },
  attachThriftCard: async (cartId: number, code: string) => {
    m.scanned.push([cartId, code]);
    return { id: cartId, status: 'open', thrift_plus: { member: { name: 'Ana Bell', person_id: 5, here: true } } };
  },
  attachThriftMember: async (cartId: number, personId: number) => {
    m.attached.push([cartId, personId]);
    if (m.attachError) throw m.attachError;
    return { id: cartId, status: 'open', thrift_plus: { member: { name: 'Ana Bell', person_id: personId } } };
  },
  detachThriftCard: async (cartId: number) => {
    m.detached.push(cartId);
    return { id: cartId, status: 'open', thrift_plus: { member: null } };
  },
  getMemberCard: async (id: number) => (id === 9 ? cardFor(CY, 'pending') : cardFor(ANA, 'member')),
  finishThriftJoin: async (body: Record<string, unknown>) => {
    m.finished.push(body);
    return {
      person_id: 9, account_id: 2, first_name: 'Cy', last_name: 'Lee', status: 'active',
      cart: body.cart ? { id: body.cart, status: 'open', thrift_plus: { member: { name: 'Cy Lee', person_id: 9 } } } : null,
    };
  },
  pendingFromError: (err: { response?: { data?: { code?: string } } }) => (err?.response?.data?.code === 'MEMBER_PENDING' ? CY : null),
  thriftErrorMessage: (err: { response?: { data?: { detail?: string } } }, fallback = 'error') => err?.response?.data?.detail ?? fallback,
}));
vi.mock('../../api/thriftplus.api', () => ({
  addSecondAdult: async (account: number, body: unknown) => {
    m.added.push([account, body]);
    return {};
  },
}));
vi.mock('../../services/receiving/receivingClient', () => ({ compressImageToJpeg: async (f: File) => f }));

function block(member: ThriftPlusCartBlock['member']): ThriftPlusCartBlock {
  return {
    live: true, member, instant_offered: false, instant_reason: '', instant_share: '0.50', collected: '0.00', use_by: null,
    instant_bucks: '0.00', instant_off: '0.00', bucks_auto: true, bucks_available: '0.00', bucks_used: '0.00', credit_available: '0.00',
    credit_used: '0.00', balances: { bucks: '0.00', bucks_use_by: null, credit: '0.00' }, guest_line: '', lines: {}, bucks_line_id: null,
    restricted_line_ids: [], amount_due: '0.00',
  };
}

const MEMBER = {
  account_id: 1, person_id: 5, name: 'Ana Bell', role: 'primary' as const, photo_url: null, verified_18: true, card_last4: '0008',
  practice: false, choice: 'bank' as const, rering: false,
};

function cart(member: ThriftPlusCartBlock['member'] = null): Cart {
  return { id: 3, status: 'open', lines: [], thrift_plus: block(member) } as unknown as Cart;
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

function dialog(over: Partial<React.ComponentProps<typeof ThriftMemberDialog>> = {}) {
  const props = {
    open: true, onClose: vi.fn(), cart: cart(), ensureCart: vi.fn(async () => cart()), onCart: vi.fn(), ...over,
  };
  return { props, ...wrap(<ThriftMemberDialog {...props} />) };
}

beforeEach(() => {
  m.searches = [];
  m.found = [];
  m.member = undefined;
  m.attached = [];
  m.scanned = [];
  m.detached = [];
  m.finished = [];
  m.added = [];
  m.attachError = null;
});

describe('The register\'s Thrift+ member button: Find, pick, on the sale (owner 2026-10-20)', () => {
  it('finds by name, lists the matches and puts the one picked on the sale', async () => {
    const user = userEvent.setup();
    m.found = [ANA];
    const { props } = dialog();
    await user.type(screen.getByLabelText(/Scan a member QR, or type/), 'ana{Enter}');
    const list = await screen.findByTestId('member-find-people');
    expect(m.searches).toEqual(['ana']);
    expect(within(list).getByText('Ana Bell')).toBeInTheDocument();
    expect(within(list).getByText('Member')).toBeInTheDocument();
    await user.click(within(list).getByText('Ana Bell'));
    await waitFor(() => expect(m.attached).toEqual([[3, 5]]));
    expect(props.onCart).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('a scanned member QR with one match goes straight onto the sale, as a scan (they are here: 2026-10-21)', async () => {
    const user = userEvent.setup();
    m.found = [ANA];
    const { props } = dialog();
    await user.type(screen.getByLabelText(/Scan a member QR, or type/), 'TP100000000008{Enter}');
    await waitFor(() => expect(m.scanned).toHaveLength(1));
    expect(m.scanned[0][0]).toBe(3);
    expect(m.scanned[0][1]).toContain('100000000008');
    expect(m.attached).toEqual([]);
    expect(m.searches).toEqual(['TP100000000008']);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('starts the sale first when there is none yet', async () => {
    const user = userEvent.setup();
    m.found = [ANA];
    const { props } = dialog({ cart: null });
    await user.type(screen.getByLabelText(/Scan a member QR, or type/), 'ana{Enter}');
    await user.click(await screen.findByText('Ana Bell'));
    await waitFor(() => expect(m.attached).toEqual([[3, 5]]));
    expect(props.ensureCart).toHaveBeenCalledTimes(1);
  });

  it('says so when no one matches, and what a QR that is no pending join is', async () => {
    const user = userEvent.setup();
    dialog();
    await user.type(screen.getByLabelText(/Scan a member QR, or type/), 'zzz{Enter}');
    expect(await screen.findByTestId('member-find-note')).toHaveTextContent('No one by that name, phone, email or member number.');
    await user.clear(screen.getByLabelText(/Scan a member QR, or type/));
    await user.type(screen.getByLabelText(/Scan a member QR, or type/), 'TP100000000008{Enter}');
    expect(await screen.findByText(/isn't a Thrift\+ member code we know/)).toBeInTheDocument();
    expect(m.attached).toEqual([]);
  });

  it('shows the server\'s reason when the member cannot go on the sale', async () => {
    const user = userEvent.setup();
    m.found = [ANA];
    m.attachError = { response: { data: { detail: 'This is a practice member. Use the training register.' } } };
    const { props } = dialog();
    await user.type(screen.getByLabelText(/Scan a member QR, or type/), 'ana{Enter}');
    await user.click(await screen.findByText('Ana Bell'));
    expect(await screen.findByTestId('thrift-member-error')).toHaveTextContent('This is a practice member. Use the training register.');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('offers the Join QR for someone not joined yet, and a practice sign-up only on the training register', async () => {
    const user = userEvent.setup();
    const onPracticeSignup = vi.fn();
    const { unmount } = dialog();
    expect(screen.getByRole('button', { name: /Show the Join QR/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Practice sign-up' })).not.toBeInTheDocument();
    unmount();
    dialog({ onPracticeSignup });
    await user.click(screen.getByRole('button', { name: 'Practice sign-up' }));
    expect(onPracticeSignup).toHaveBeenCalled();
  });
});

describe('A member on the sale: tap them for their card (owner 2026-10-20)', () => {
  it('opens on the member\'s card with Add a 2nd person, and adds them', async () => {
    const user = userEvent.setup();
    dialog({ cart: cart(MEMBER) });
    expect(await screen.findByTestId('member-card-name')).toHaveTextContent('Ana Bell');
    await user.click(screen.getByTestId('member-card-add-person'));
    await user.type(screen.getByLabelText(/First name/), 'Ben');
    await user.type(screen.getByLabelText(/Last name/), 'Bell');
    await user.click(screen.getByLabelText(/Checked a photo ID/));
    await user.click(screen.getByLabelText(/Both are here, and Ana approves/));
    await user.upload(screen.getByTestId('add-person').querySelector('input[type="file"]') as HTMLInputElement, new File(['jpg'], 'ben.jpg', { type: 'image/jpeg' }));
    await user.click(screen.getByRole('button', { name: 'Add them' }));
    await waitFor(() => expect(m.added).toHaveLength(1));
    expect(m.added[0]).toMatchObject([1, { first_name: 'Ben', last_name: 'Bell' }]);
    expect(await screen.findByTestId('member-card-note')).toHaveTextContent('Ben Bell is on the membership.');
  });

  it('Remove from sale takes the member off, and Change member goes back to Find', async () => {
    const user = userEvent.setup();
    dialog({ cart: cart(MEMBER) });
    await screen.findByTestId('member-card-name');
    await user.click(screen.getByRole('button', { name: 'Change member' }));
    expect(screen.getByLabelText(/Scan a member QR, or type/)).toBeInTheDocument();
  });

  it('Remove from sale detaches the member', async () => {
    const user = userEvent.setup();
    const { props } = dialog({ cart: cart(MEMBER) });
    await user.click(await screen.findByRole('button', { name: 'Remove from sale' }));
    await waitFor(() => expect(m.detached).toEqual([3]));
    expect(props.onCart).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('Someone who joined online and is not finished: Finalize is the ID check (owner 2026-10-20)', () => {
  it('Find shows "To finish"; picking them opens their card, not the sale; Match finishes and attaches', async () => {
    const user = userEvent.setup();
    m.found = [CY];
    const { props } = dialog();
    await user.type(screen.getByLabelText(/Scan a member QR, or type/), 'cy{Enter}');
    expect(await screen.findByText('To finish')).toBeInTheDocument();
    await user.click(screen.getByText('Cy Lee'));
    expect(await screen.findByTestId('member-card-finalize')).toBeInTheDocument();
    expect(m.attached).toEqual([]);
    await user.click(screen.getByLabelText('Name matches'));
    await user.click(screen.getByLabelText('Photo matches'));
    await user.click(screen.getByLabelText('18 or older'));
    await user.click(screen.getByTestId('member-card-match'));
    await waitFor(() => expect(m.finished).toHaveLength(1));
    expect(m.finished[0]).toMatchObject({ person: 9, id_checked: true, face_matches: true, verified_18: true, finalize: true, cart: 3 });
    expect(props.onCart).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('a pending member\'s QR the server refuses (MEMBER_PENDING) opens the same card', async () => {
    const user = userEvent.setup();
    m.found = [{ ...CY, status: 'active' }]; // looked finished in the list, the sale says otherwise
    m.attachError = { response: { data: { code: 'MEMBER_PENDING' } } };
    dialog();
    await user.type(screen.getByLabelText(/Scan a member QR, or type/), 'cy{Enter}');
    await user.click(await screen.findByText('Cy Lee'));
    expect(await screen.findByTestId('member-card-finalize')).toBeInTheDocument();
  });

  it('opens straight on that person\'s card when a pending join\'s QR was scanned at the register', async () => {
    dialog({ personId: 9 });
    expect(await screen.findByTestId('member-card-finalize')).toBeInTheDocument();
  });
});
