import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLoginCandidates, fetchLoginMergePreview, mergeCustomerLogin, type LoginCandidate } from '../../api/accounts.api';
import {
  createMissingStaffMemberships,
  fetchStaffMemberships,
  fetchStaffMergePreview,
  findMembers,
  mergeIntoStaff,
  type StaffMemberships,
} from '../../api/thriftplus.api';
import type { ThriftPlusAccount } from '../../types/thriftplus.types';
import StaffTab from './StaffTab';

const OUTLOOK: LoginCandidate = {
  user_id: 8, name: 'Bill Rollins', email: 'bill_rollins.rf@outlook.com', phone: '402-555-0199',
  why: ['same email name', 'same phone'], joined: '2026-09-01T15:00:00Z', last_login: null,
};

const LIST: StaffMemberships = {
  missing: 1,
  website_missing: 1,
  missing_any: 1,
  can_merge: true,
  staff: [
    {
      user_id: 1, name: 'Bill Rollins', email: 'bill_rollins@ecothrift.us', role: 'Admin',
      membership: { id: 12, status: 'active', name: 'Bill Rollins', email: 'bill_rollins@ecothrift.us', bucks: '0.00', credit: '0.00' },
      suggestions: [{ account_id: 34, status: 'active', name: 'Bill Rollins', email: 'b***@outlook.com', why: ['same name', 'same email name'], bucks: '5.00', credit: '2.50' }],
      login_suggestions: [OUTLOOK],
    },
    { user_id: 2, name: 'Cal Clerk', email: 'cal@ecothrift.us', role: 'Employee', membership: null, suggestions: [], website: null, login_suggestions: [] },
  ],
};

const customer = (id: number, first: string, staff: ThriftPlusAccount['staff'] = null): ThriftPlusAccount => ({
  id, status: 'active', notes: '', revoked_at: null, revoked_reason: '', created_at: '2026-10-01T15:00:00Z', staff,
  people: [{
    id: id * 10, role: 'primary', first_name: first, last_name: 'Rollins', phone: '4025550199', photo_url: null, email: 'x@example.com',
    id_checked: true, verified_18: true, verified_at: null, removed_at: null, created_at: '2026-10-01T15:00:00Z', cards: [],
  }],
});

vi.mock('../../api/thriftplus.api', () => ({
  fetchStaffMemberships: vi.fn(),
  createMissingStaffMemberships: vi.fn(),
  fetchStaffMergePreview: vi.fn(async (_user: number, source: number) => ({
    staff_account: 12, source_account: source, source_name: 'Bill Rollins', bucks: '5.00', credit: '2.50', codes: 1,
    second_adult: 'Dee Rollins', moves: { 'ledger rows': 2, 'history events': 3 }, takes: ['phone', 'ID check'], login: true,
  })),
  mergeIntoStaff: vi.fn(async (_user: number, source: number) => ({
    staff_account: 12, source_account: source, moved: { 'ledger rows': 2, 'member codes': 1 }, took: ['phone'],
    second_adult: 'Dee Rollins', login_removed: true, signed_out: 1, email_links_removed: 0,
    source_had: { bucks: '5.00', credit: '2.50' }, now: { bucks: '5.00', credit: '2.50' },
  })),
  findMembers: vi.fn(async () => [customer(56, 'William'), customer(78, 'Cal', { id: 2, name: 'Cal Clerk' })]),
}));

vi.mock('../../api/accounts.api', () => ({
  fetchLoginCandidates: vi.fn(),
  fetchLoginMergePreview: vi.fn(async () => ({
    source: {
      user_id: 8, name: 'Bill Rollins', email: 'bill_rollins.rf@outlook.com', phone: '402-555-0199',
      why: [], joined: null, last_login: null,
    },
    staff: { user_id: 1, name: 'Bill Rollins', email: 'bill_rollins@ecothrift.us' },
    moves: { conversations: 1, messages: 2, holds: 1 },
    thriftplus: { account: 34, note: '', name: 'Bill Rollins', bucks: '5.00', credit: '2.50', moves: {}, staff_account: 12 },
    source_after: 'merged-8.bill_rollins.rf@outlook.com',
  })),
  mergeCustomerLogin: vi.fn(async () => ({
    source_user: 8, staff_user: 1, source_email_was: 'bill_rollins.rf@outlook.com',
    source_email_now: 'merged-8.bill_rollins.rf@outlook.com', moved: { conversations: 1, holds: 1 }, left: [],
    sign_in_links_spent: 0, tokens_blacklisted: 1,
    thriftplus: { merged: true, source_account: 34, staff_account: 12, moved: {}, now: { bucks: '5.00', credit: '2.50' } },
  })),
}));

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <StaffTab />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(fetchStaffMemberships).mockResolvedValue(LIST);
  vi.mocked(createMissingStaffMemberships).mockResolvedValue({
    ...LIST, missing: 0, website_missing: 0, missing_any: 0, made: 1, linked: 0, customers_made: 0, customers_fixed: 0,
    staff: [LIST.staff[0], {
      ...LIST.staff[1],
      membership: { id: 13, status: 'active', name: 'Cal Clerk', email: 'cal@ecothrift.us', bucks: '0.00', credit: '0.00' },
    }],
  });
  vi.mocked(fetchLoginCandidates).mockImplementation(async (_staff: number, q = '') => ({
    suggestions: [OUTLOOK],
    results: q ? [OUTLOOK, { ...OUTLOOK, user_id: 9, email: 'billy@example.com', why: [] }] : [],
  }));
});

describe('Thrift+ Staff tab (owner 2026-10-15)', () => {
  it('lists each staff member with their membership (staff are not customers), and the owner creates the missing ones', async () => {
    const user = userEvent.setup();
    renderTab();
    const rows = await screen.findAllByTestId('staff-row');
    expect(within(rows[0]).queryByText(/Website account/)).toBeNull(); // owner 2026-10-16: staff are not customers
    expect(within(rows[0]).getByText('Membership #12')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/ThriftBucks 0\.00 · Thrift\+ credit \$0\.00/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/May also be theirs: Bill Rollins #34 \(same name, same email name\)/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(
      'Customer login that may be theirs: bill_rollins.rf@outlook.com (same email name, same phone)',
    )).toBeInTheDocument();
    expect(within(rows[1]).getByText('No membership yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create missing (1)' }));
    await waitFor(() => expect(createMissingStaffMemberships).toHaveBeenCalled());
    expect(await screen.findByTestId('staff-done')).toHaveTextContent(
      'Made 1 staff membership; linked 0 by the same email.',
    );
    expect(screen.getByText('Membership #13')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create missing/ })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bcards?\b/i);
  });

  it('a manager sees the list but cannot create or merge', async () => {
    vi.mocked(fetchStaffMemberships).mockResolvedValue({ ...LIST, can_merge: false });
    renderTab();
    expect(await screen.findAllByTestId('staff-row')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Create missing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Merge a customer membership/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Merge a customer login/ })).not.toBeInTheDocument();
  });

  it('merges a customer login into the staff login after showing what moves', async () => {
    const user = userEvent.setup();
    renderTab();
    const rows = await screen.findAllByTestId('staff-row');
    await user.click(within(rows[0]).getByRole('button', { name: /Merge a customer login/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Merge' })).toBeDisabled(); // nothing picked yet
    await user.click(await within(dialog).findByText('bill_rollins.rf@outlook.com'));
    await waitFor(() => expect(fetchLoginMergePreview).toHaveBeenCalledWith(1, 8));
    const preview = await within(dialog).findByTestId('login-merge-preview');
    expect(preview).toHaveTextContent('bill_rollins.rf@outlook.com merges into bill_rollins@ecothrift.us');
    expect(preview).not.toHaveTextContent('customer record');
    expect(preview).toHaveTextContent('Moves: conversations: 1, messages: 2, holds: 1');
    expect(preview).toHaveTextContent(
      'Thrift+ membership #34 (Bill Rollins) merges into Bill Rollins’s too: ThriftBucks 5.00 · Thrift+ credit $2.50',
    );
    expect(preview).toHaveTextContent('The staff login wins: bill_rollins@ecothrift.us stays the email, and the Dash password stays.');
    expect(preview).toHaveTextContent('it becomes merged-8.bill_rollins.rf@outlook.com');
    await user.click(within(dialog).getByRole('button', { name: "Merge bill_rollins.rf@outlook.com into Bill Rollins's login" }));
    await waitFor(() => expect(mergeCustomerLogin).toHaveBeenCalledWith(1, 8));
    expect(await screen.findByTestId('staff-done')).toHaveTextContent(
      "Merged bill_rollins.rf@outlook.com into Bill Rollins's login: conversations: 1, holds: 1. "
      + 'Thrift+ membership #34 merged in too.',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('finds another customer login with the search', async () => {
    const user = userEvent.setup();
    renderTab();
    const rows = await screen.findAllByTestId('staff-row');
    await user.click(within(rows[0]).getByRole('button', { name: /Merge a customer login/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Find a customer login: email, name or phone'), 'billy');
    await waitFor(() => expect(fetchLoginCandidates).toHaveBeenCalledWith(1, 'billy'));
    await user.click(await within(dialog).findByText('billy@example.com'));
    await waitFor(() => expect(fetchLoginMergePreview).toHaveBeenCalledWith(1, 9));
    expect(within(dialog).getAllByText('bill_rollins.rf@outlook.com')).toHaveLength(1); // a suggestion is not listed twice
  });

  it('merges a suggested customer membership after showing what moves', async () => {
    const user = userEvent.setup();
    renderTab();
    const rows = await screen.findAllByTestId('staff-row');
    await user.click(within(rows[0]).getByRole('button', { name: /Merge a customer membership/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Merge' })).toBeDisabled(); // nothing picked yet
    await user.click(within(dialog).getByText('Bill Rollins · #34'));
    await waitFor(() => expect(fetchStaffMergePreview).toHaveBeenCalledWith(1, 34));
    const preview = await within(dialog).findByTestId('staff-merge-preview');
    expect(preview).toHaveTextContent('ThriftBucks 5.00 · Thrift+ credit $2.50');
    expect(preview).toHaveTextContent('1 member code: the QR in their app keeps working at the register');
    expect(preview).toHaveTextContent('The second adult, Dee Rollins');
    expect(preview).toHaveTextContent('Takes their phone, ID check');
    expect(preview).toHaveTextContent('The staff login wins: bill_rollins@ecothrift.us stays the email.');
    await user.click(within(dialog).getByRole('button', { name: "Merge #34 into Bill Rollins's" }));
    await waitFor(() => expect(mergeIntoStaff).toHaveBeenCalledWith(1, 34));
    expect(await screen.findByTestId('staff-done')).toHaveTextContent(
      'Merged membership #34 into #12: ledger rows: 2, member codes: 1. Now ThriftBucks 5.00 · Thrift+ credit $2.50.',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('finds another membership to merge with the member search, never a staff one', async () => {
    const user = userEvent.setup();
    renderTab();
    const rows = await screen.findAllByTestId('staff-row');
    await user.click(within(rows[0]).getByRole('button', { name: /Merge a customer membership/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Find another: phone, email or name'), 'rollins');
    await waitFor(() => expect(findMembers).toHaveBeenCalledWith('rollins'));
    await user.click(await within(dialog).findByText('William Rollins · #56'));
    expect(within(dialog).queryByText('Cal Rollins · #78')).not.toBeInTheDocument(); // a staff membership
    await waitFor(() => expect(fetchStaffMergePreview).toHaveBeenCalledWith(1, 56));
    expect(await within(dialog).findByRole('button', { name: "Merge #56 into Bill Rollins's" })).toBeEnabled();
  });
});
