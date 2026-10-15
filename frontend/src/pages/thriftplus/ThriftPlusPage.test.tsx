import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ItemRewardDetail, RewardPreview, ThriftPlusAccount } from '../../types/thriftplus.types';
import ThriftPlusPage from './ThriftPlusPage';

const created = vi.hoisted(() => ({ bodies: [] as unknown[] }));
const stopped = vi.hoisted(() => ({ calls: [] as [number, string][] }));
const links = vi.hoisted(() => ({ calls: [] as [number, string | undefined][], finds: [] as [string, string | undefined][] }));

/** Joined online with a name and email (owner 2026-10-15, J8): no phone, no ID check, no photo yet. */
const pendingAccount: ThriftPlusAccount = {
  id: 6,
  status: 'pending',
  notes: 'Joined online (name and email).',
  revoked_at: null,
  revoked_reason: '',
  created_at: '2026-10-15T15:00:00Z',
  people: [
    {
      id: 7, role: 'primary', first_name: 'Cara', last_name: 'Joyner', phone: '', photo_url: null, email: 'cara@example.com',
      id_checked: false, verified_18: false, verified_at: null, removed_at: null, created_at: '2026-10-15T15:00:00Z',
      email_verified_at: '2026-10-15T15:01:00Z', phone_verified_at: null, emails: { updates: true, news: true },
      cards: [{ id: 11, code: '512345678904', display: '5123 4567 8904', status: 'active', issued_at: '2026-10-15T15:00:00Z', dead_at: null, dead_reason: '' }],
    },
  ],
  events: [],
};

const account: ThriftPlusAccount = {
  id: 3,
  status: 'active',
  notes: '',
  revoked_at: null,
  revoked_reason: '',
  created_at: '2026-09-26T15:00:00Z',
  people: [
    {
      id: 5, role: 'primary', first_name: 'Ana', last_name: 'Diaz', phone: '4025550101', photo_url: null,
      id_checked: true, verified_18: true, verified_at: '2026-09-26T15:00:00Z', removed_at: null, created_at: '2026-09-26T15:00:00Z',
      cards: [{ id: 9, code: '712345678903', display: '7123 4567 8903', status: 'active', issued_at: '2026-09-26T15:00:00Z', dead_at: null, dead_reason: '' }],
    },
  ],
  events: [{ id: 1, action: 'card_issued', detail: {}, actor_name: 'Carrie R', person_name: 'Ana Diaz', card_code: '7123 4567 8903', created_at: '2026-09-26T15:00:00Z' }],
};

const row = {
  item_id: 11, sku: 'ITM0000011', title: 'Brass floor lamp', price: '90.00', reward: '13.00', member_price: '77.00',
  floor_price: '45.00', day: 20, status: 'climbing' as const, reason: 'one_unit', family: 'p4',
};

const preview: RewardPreview = {
  day: '2026-10-22',
  switch_on: false,
  rules: { floor_share: '0.50', start: null, wait_days: 7, horizon: 90, pace_window: 14 },
  totals: { units: 1200, with_reward: 800, tag_total: '24000.00', reward_total: '1234.50', member_total: '22765.50', pct_off_rewarded: '8.2' },
  by_status: { waiting: 400, climbing: 700, paused: 100 },
  bands: [{ band: 'Under $10', units: 600, with_reward: 400, reward_total: '300.00', pct_off_rewarded: '11.0' }],
  families: { paced: 30, on_pace: 12, linked: 4 },
  exit_list: { count: 1, tag_total: '9.00', rows: [{ ...row, item_id: 12, sku: 'ITM0000012', title: 'Old mug', day: 95, reason: 'reached_floor' }] },
  top: [row],
  to_close: 0,
  last_run: null,
};

const itemDetail: ItemRewardDetail = {
  item_id: 11, sku: 'ITM0000011', title: 'Brass floor lamp', price: '90.00', reward_now: '13.00', member_price_now: '77.00',
  state: {
    floor_date: '2026-10-02', starting_price: '90.00', floor_price: '45.00', grow_days: 13, reward: '13.00', status: 'climbing',
    reason: 'retag', day: 20, computed_on: '2026-10-21', exit_on: null, family_key: 'p4', scans: 0, adds: 0,
  },
  events: [{ on: '2026-10-15', day: 14, reward: '7.00', status: 'climbing', reason: 'retag', detail: {} }],
};

vi.mock('../../api/thriftplus.api', () => ({
  fetchRewardPreview: async () => preview,
  fetchMemberMoney: async () => ({
    banked: '3.00', available: '3.00', credit: '0.00',
    lots: [{ amount: '3.00', earned_on: '2026-10-20', use_by: '2026-11-19', past_due: false }],
    entries: [
      { id: 1, kind: 'bank', amount: '3.00', reason: 'sale', cart: 12, sku: 'ITM0000011', note: '', actor: '', created_at: '2026-10-20T15:00:00Z' },
    ],
  }),
  adjustMemberMoney: async () => ({}),
  fetchThriftOverview: async () => ({
    days: 30,
    members: { active: 42, revoked: 1, people: 50, verified_18: 40, signups: [{ day: '2026-10-20', n: 30 }], pending: 6, pending_new: 5 },
    sales: { member_sales: 120, member_revenue: '3400.00', guest_sales: 300, guest_revenue: '9100.00' },
    rewards: { instant: '210.00', banked: '380.00', used: '41.25', expired: '9.50', credit_from_returns: '12.00' },
    owed: { banked: '55.00', credit: '12.00' },
    returns: { count: 1, waiting: 1 },
    scanner: { scans: 200, adds: 50, passes: 150, add_rate: 0.25, items_scanned: 180, price_feedback: 7 },
  }),
  fetchItemReward: async () => itemDetail,
  findMembers: async (q: string, status?: string) => {
    links.finds.push([q, status]);
    return status === 'pending' ? [pendingAccount] : [account];
  },
  fetchMember: async (id: number) => (id === pendingAccount.id ? pendingAccount : account),
  sendMemberEmailLink: async (personId: number, email?: string) => {
    links.calls.push([personId, email]);
    const cara = personId === pendingAccount.people[0].id;
    return { ...(cara ? pendingAccount : account), sent: cara ? 'sign_in' : 'join', sent_to: cara ? 'c***@example.com' : 'a***@example.com' };
  },
  createMember: async (body: unknown) => {
    created.bodies.push(body);
    return { ...account, id: 4 };
  },
  addSecondAdult: async () => account,
  revokeMember: async () => account,
  verifyPerson: async () => account,
  setPersonPhoto: async () => account,
  removeSecondAdult: async () => account,
  killCard: async (id: number, reason: string) => {
    stopped.calls.push([id, reason]);
  },
  setPersonNews: async () => account,
  setPersonEmail: async () => account,
  fetchEmailNote: async () => ({ note: "We'll email your receipts and Thrift+ updates. Store news emails have an unsubscribe link." }),
}));

vi.mock('../../api/thriftplusRegister.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/thriftplusRegister.api')>()),
  fetchRestrictedProducts: async () => [],
  fetchThriftReturns: async () => [],
}));

function renderPage(entry = '/thrift-plus') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={createTheme()}>
      <QueryClientProvider client={client}>
        <SnackbarProvider>
          <MemoryRouter initialEntries={[entry]}>
            <ThriftPlusPage />
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Thrift+ page tabs', () => {
  it('has no Card batches tab: no physical card since 2026-10-14', () => {
    renderPage('/thrift-plus?tab=cards');
    expect(screen.queryByRole('tab', { name: /card/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Thrift+ member service', () => {
  it('finds a member and shows their member code (last 4), 18+ check and history', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Scan a member QR, or type a phone, email or name'), 'ana');
    await user.click(await screen.findByText('Ana Diaz'));
    expect(await screen.findByText('Membership #3')).toBeInTheDocument();
    expect(screen.getByText('18+ verified')).toBeInTheDocument();
    expect(screen.getByText(/^Member code ending/)).toHaveTextContent('Member code ending 8903');
    expect(screen.queryByText(/7123 4567 8903/)).not.toBeInTheDocument(); // the full code stays in the app
    expect(screen.getByText(/member code given · Ana Diaz · code ending 8903 · by Carrie R/)).toBeInTheDocument();
    expect((await screen.findByText(/^Your ThriftBucks/)).textContent).toBe('Your ThriftBucks 3.00 · Thrift+ credit $0.00');
    // Kept ThriftBucks with their use-by dates (B2, B5); no cover since 10-12.
    expect(screen.getByText('3.00 ThriftBucks, collected Oct 20, use by Nov 19')).toBeInTheDocument();
    expect(screen.getByText('Nov 19')).toBeInTheDocument(); // the ledger row's use-by
    expect(screen.queryByText(/cover/i)).not.toBeInTheDocument();
    // No physical card (owner, 2026-10-14): no card words, no blank-card scan.
    expect(document.body.textContent).not.toMatch(/card/i);
    expect(screen.queryByRole('button', { name: /issue/i })).not.toBeInTheDocument();
  });

  it('replaces a member code: the old one stops at once', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Scan a member QR, or type a phone, email or name'), 'ana');
    await user.click(await screen.findByText('Ana Diaz'));
    await user.click(await screen.findByRole('button', { name: 'Replace member code' }));
    expect(stopped.calls).toContainEqual([9, 'replaced by staff']);
    expect(await screen.findByText(/Old member code stopped/)).toBeInTheDocument();
  });

  it('signs up a member; the 18+ box needs an ID check first', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'New member' }));
    expect(screen.queryByLabelText(/card/i)).not.toBeInTheDocument(); // no blank card to scan
    expect(screen.getByRole('checkbox', { name: 'The ID shows 18 or older' })).toBeDisabled();
    await user.type(screen.getByLabelText(/First name/), 'Bo');
    await user.click(screen.getByRole('checkbox', { name: 'Checked a photo ID (the name matches)' }));
    await user.click(screen.getByRole('checkbox', { name: 'The ID shows 18 or older' }));
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(created.bodies).toContainEqual(expect.objectContaining({ first_name: 'Bo', id_checked: true, verified_18: true }));
  });

  it('takes an optional email with one plain line and no boxes (T74)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'New member' }));
    expect(await screen.findByText(/Store news emails have an unsubscribe link/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /email/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/First name/), 'Cy');
    await user.type(screen.getByLabelText('Email (optional)'), 'cy@example.com');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    const body = created.bodies.find((b) => (b as { first_name?: string }).first_name === 'Cy') as Record<string, unknown>;
    expect(body.email).toBe('cy@example.com');
    expect(Object.keys(body).some((k) => k.startsWith('emails_'))).toBe(false);
  });

  it('adds an email for a register member and sends the join link (J12)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Scan a member QR, or type a phone, email or name'), 'ana');
    await user.click(await screen.findByText('Ana Diaz'));
    const send = await screen.findByRole('button', { name: 'Save and send link' });
    expect(send).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Add an email'), 'ana@example.com');
    await user.click(send);
    expect(links.calls).toContainEqual([5, 'ana@example.com']);
    expect(await screen.findByText('Join email sent to a***@example.com.')).toBeInTheDocument();
  });

  it('lists the online joins to finish at a register, and sends one a sign-in link from next to the email', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Joined online, not finished' }));
    expect(links.finds).toContainEqual(['', 'pending']); // listed with nothing typed
    expect(await screen.findByText(/cara@example\.com · joined online, finish at a register/)).toBeInTheDocument();
    await user.click(screen.getByText('Cara Joyner'));
    expect(await screen.findByTestId('thrift-pending-note')).toHaveTextContent(
      'Joined online, finish at a register. Not a member yet: it collects and uses nothing until a register asks the phone number',
    );
    expect(screen.getAllByText('Joined online, finish at a register').length).toBeGreaterThan(0); // the person's chip
    expect(screen.getByText('No phone yet: the register asks it and reads it back')).toBeInTheDocument();
    expect(screen.getByText('Email confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ID checked: 18+' })).not.toBeInTheDocument(); // the register does it
    await user.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    expect(links.calls).toContainEqual([7, undefined]);
    expect(await screen.findByText('Sign-in link sent to c***@example.com.')).toBeInTheDocument();
  });
});

describe('Thrift+ rewards (the dry run)', () => {
  it("shows tomorrow's rewards, the exit list, and one item's log", async () => {
    const user = userEvent.setup();
    renderPage('/thrift-plus?tab=rewards');
    expect(await screen.findByText('What members would pay Thursday, Oct 22')).toBeInTheDocument();
    expect(screen.getByText('Dark: the switch is off')).toBeInTheDocument();
    expect(screen.getByText('1,234.50')).toBeInTheDocument();
    expect(screen.getByText('12 of 30 on pace')).toBeInTheDocument();
    expect(screen.getByText('Old mug')).toBeInTheDocument();
    await user.type(screen.getByLabelText('SKU'), 'ITM0000011');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText(/day 14 · Retagged/)).toBeInTheDocument();
  });
});

describe('Thrift+ overview', () => {
  it("shows the owner's numbers", async () => {
    renderPage('/thrift-plus?tab=overview');
    expect(await screen.findByText('Active memberships')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    // Online joins not finished at a register are counted apart, never as members (owner 2026-10-15, J8).
    expect(screen.getByText('Joined online, to finish at a register')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Not members yet · 5 in 30 days')).toBeInTheDocument();
    expect(screen.getByText('Redeemed instantly')).toBeInTheDocument();
    expect(screen.getByText('$210.00')).toBeInTheDocument(); // redeemed instantly is dollars off
    expect(screen.getByText('380.00')).toBeInTheDocument(); // ThriftBucks kept: a number, never "$"
    expect(screen.getByText('41.25')).toBeInTheDocument();
    expect(screen.getByText('ThriftBucks expired')).toBeInTheDocument();
    expect(screen.getByText('9.50')).toBeInTheDocument();
    expect(screen.getByText('Thrift+ income')).toBeInTheDocument();
    expect(screen.queryByText(/cover|InstantBucks|Return \$/)).not.toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/card/i); // no cards-issued or blanks-left tile
  });

  it('says 18+ products need a member verified 18+, never a card', async () => {
    renderPage('/thrift-plus?tab=register');
    expect(await screen.findByText(/needs a Thrift\+ member verified 18\+/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/card/i);
  });
});
