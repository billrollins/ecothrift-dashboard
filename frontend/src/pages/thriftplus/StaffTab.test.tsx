import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const LIST: StaffMemberships = {
  missing: 1,
  can_merge: true,
  staff: [
    {
      user_id: 1, name: 'Bill Rollins', email: 'bill_rollins@ecothrift.us', role: 'Admin',
      membership: { id: 12, status: 'active', name: 'Bill Rollins', email: 'bill_rollins@ecothrift.us', bucks: '0.00', credit: '0.00' },
      suggestions: [{ account_id: 34, status: 'active', name: 'Bill Rollins', email: 'b***@outlook.com', why: ['same name', 'same email name'], bucks: '5.00', credit: '2.50' }],
    },
    { user_id: 2, name: 'Cal Clerk', email: 'cal@ecothrift.us', role: 'Employee', membership: null, suggestions: [] },
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
    ...LIST, missing: 0, made: 1, linked: 0,
    staff: [LIST.staff[0], { ...LIST.staff[1], membership: { id: 13, status: 'active', name: 'Cal Clerk', email: 'cal@ecothrift.us', bucks: '0.00', credit: '0.00' } }],
  });
});

describe('Thrift+ Staff tab (owner 2026-10-15)', () => {
  it('lists each staff member with their membership, and the owner creates the missing ones', async () => {
    const user = userEvent.setup();
    renderTab();
    const rows = await screen.findAllByTestId('staff-row');
    expect(within(rows[0]).getByText('Membership #12')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/ThriftBucks 0\.00 · Thrift\+ credit \$0\.00/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/May also be theirs: Bill Rollins #34 \(same name, same email name\)/)).toBeInTheDocument();
    expect(within(rows[1]).getByText('No membership yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create missing staff memberships (1)' }));
    await waitFor(() => expect(createMissingStaffMemberships).toHaveBeenCalled());
    expect(await screen.findByTestId('staff-done')).toHaveTextContent('Made 1 staff membership; linked 0 by the same email.');
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
