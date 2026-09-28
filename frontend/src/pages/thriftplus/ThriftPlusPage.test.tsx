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
    banked: '3.00', credit: '0.00', entries: [],
    cover: { month: '2026-10', amount: '10.00', covered: '10.00', remaining: '0.00', is_covered: true, resets_on: '2026-11-01' },
  }),
  adjustMemberMoney: async () => ({}),
  fetchThriftOverview: async () => ({
    days: 30,
    members: { active: 42, revoked: 1, people: 50, verified_18: 40, cards_active: 45, cards_blank: 455, signups: [{ day: '2026-10-20', n: 30 }] },
    sales: { member_sales: 120, member_revenue: '3400.00', guest_sales: 300, guest_revenue: '9100.00' },
    rewards: { instant: '210.00', to_cover: '380.00', banked: '55.00', credit_from_returns: '12.00' },
    owed: { banked: '55.00', credit: '12.00' },
    returns: { count: 1, waiting: 1 },
    scanner: { scans: 200, adds: 50, passes: 150, add_rate: 0.25, items_scanned: 180, price_feedback: 7 },
  }),
  fetchItemReward: async () => itemDetail,
  findMembers: async () => [account],
  fetchMember: async () => account,
  createMember: async (body: unknown) => {
    created.bodies.push(body);
    return { ...account, id: 4 };
  },
  addSecondAdult: async () => account,
  revokeMember: async () => account,
  verifyPerson: async () => account,
  setPersonPhoto: async () => account,
  issueCard: async () => account,
  removeSecondAdult: async () => account,
  killCard: async () => undefined,
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

describe('Thrift+ member service', () => {
  it('finds a member and shows their card, 18+ check and history', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Scan a card, or type a phone or name'), 'ana');
    await user.click(await screen.findByText('Ana Diaz'));
    expect(await screen.findByText('Membership #3')).toBeInTheDocument();
    expect(screen.getByText('18+ verified')).toBeInTheDocument();
    expect(screen.getAllByText('7123 4567 8903').length).toBeGreaterThan(0);
    expect(screen.getByText(/card issued · Ana Diaz/)).toBeInTheDocument();
    expect(await screen.findByText(/Banked \$3\.00/)).toBeInTheDocument();
  });

  it('signs up a member; the 18+ box needs an ID check first', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'New member' }));
    expect(screen.getByRole('checkbox', { name: 'The ID shows 18 or older' })).toBeDisabled();
    await user.type(screen.getByLabelText(/First name/), 'Bo');
    await user.click(screen.getByRole('checkbox', { name: 'Checked a photo ID (the name matches)' }));
    await user.click(screen.getByRole('checkbox', { name: 'The ID shows 18 or older' }));
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(created.bodies).toContainEqual(expect.objectContaining({ first_name: 'Bo', id_checked: true, verified_18: true }));
  });
});

describe('Thrift+ rewards (the dry run)', () => {
  it("shows tomorrow's rewards, the exit list, and one item's log", async () => {
    const user = userEvent.setup();
    renderPage('/thrift-plus?tab=rewards');
    expect(await screen.findByText('What members would pay Thursday, Oct 22')).toBeInTheDocument();
    expect(screen.getByText('Dark: the switch is off')).toBeInTheDocument();
    expect(screen.getByText('$1,234.50')).toBeInTheDocument();
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
    expect(screen.getByText('$380.00')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });
});
