import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ThriftPlusMember } from '../../../api/thriftPlusScanner.api';
import * as api from '../../../api/thriftPlusScanner.api';
import { AccountPage } from './AccountScreens';

vi.mock('../../../api/thriftPlusScanner.api', () => ({
  getMe: vi.fn(),
  removePerson: vi.fn(),
  setMyNews: vi.fn(),
  getSession: vi.fn(),
  getCart: vi.fn(),
}));

const mocked = vi.mocked(api);

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const member: ThriftPlusMember = {
  first_name: 'Dana',
  email: 'dana@example.com',
  username: null,
  card_last4: '4821',
  verified_18: true,
  banked_rewards: '12.50',
  credit_balance: '3.00',
  session_kind: 'password',
  has_login: true,
};

const me = (over: Partial<api.ThriftPlusMe> = {}): api.ThriftPlusMe => ({
  banked: '12.50',
  credit: '3.00',
  can_change: true,
  people: [
    { id: 1, first_name: 'Dana', role: 'primary', verified_18: true, is_you: true, cards: [{ id: 11, last4: '4821', status: 'active' }] },
    { id: 2, first_name: 'Sam', role: 'secondary', verified_18: true, is_you: false, cards: [{ id: 12, last4: '9033', status: 'active' }] },
  ],
  money: [
    { kind: 'bank', amount: '5.25', reason: 'Sale', created_at: '2026-10-01T12:00:00Z' },
    { kind: 'cover', amount: '4.00', reason: '', created_at: '2026-10-01T12:00:00Z' },
    { kind: 'credit', amount: '3.00', reason: '', created_at: '2026-10-02T12:00:00Z' },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountPage', () => {
  const props = { member, onSignOut: () => undefined };
  const you = { name: 'Dana Rivera', phone: '4025550188', photo_url: 'https://photos.example/dana.jpg' };

  it('shows who is on the account and recent activity, with no card rows (owner 2026-10-14: no card)', async () => {
    mocked.getMe.mockResolvedValue(me());
    wrap(<AccountPage {...props} />);
    expect(await screen.findByText('Sam')).toBeInTheDocument();
    expect(screen.getByText('Second adult')).toBeInTheDocument();
    expect(screen.queryByText(/card/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lost it?' })).not.toBeInTheDocument();
    // The balances live on the Bucks tab now; Recent activity keeps its rows (a number for ThriftBucks, never "$").
    expect(screen.getByText('5.25')).toBeInTheDocument();
    expect(screen.getAllByText('Thrift+ credit').length).toBe(1); // the credit row in Recent activity
    expect(screen.queryByText(/cover/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Return \$/)).not.toBeInTheDocument();
  });

  it('shows your name, phone and photo, and says to ask at the register to change the photo (no retake)', async () => {
    mocked.getMe.mockResolvedValue(me({ you }));
    wrap(<AccountPage {...props} />);
    await waitFor(() => expect(screen.getByTestId('account-name')).toHaveTextContent('Dana Rivera'));
    expect(screen.getByTestId('account-phone')).toHaveTextContent('(402) 555-0188');
    expect(screen.getByTestId('account-photo')).toHaveAttribute('src', you.photo_url);
    expect(screen.getByText('Ask at the register to change your photo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retake|take|photo|selfie/i })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('with no photo on file shows the first letter, and the first name until the account answers', async () => {
    mocked.getMe.mockResolvedValue(me({ you: { ...you, photo_url: null } }));
    wrap(<AccountPage {...props} />);
    expect(screen.getByTestId('account-name')).toHaveTextContent('Dana');
    expect(await screen.findByText('Sam')).toBeInTheDocument();
    expect(screen.queryByTestId('account-photo')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-photo-none')).toHaveTextContent('D');
    expect(screen.getByTestId('account-name')).toHaveTextContent('Dana Rivera');
  });

  it('has Sign out', async () => {
    mocked.getMe.mockResolvedValue(me({ you }));
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    wrap(<AccountPage {...props} onSignOut={onSignOut} />);
    await screen.findByTestId('account-name');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('lets the main member take the second adult off', async () => {
    mocked.getMe.mockResolvedValue(me());
    mocked.removePerson.mockResolvedValue(me());
    const user = userEvent.setup();
    wrap(<AccountPage {...props} />);
    await user.click(await screen.findByRole('button', { name: 'Remove Sam' }));
    expect(screen.getByText('Take Sam off the account? Their member QR stops working.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mocked.removePerson).toHaveBeenCalledWith(2));
  });

  it('hides the changes for an old card session, and never asks for a password (owner 2026-10-16)', async () => {
    mocked.getMe.mockResolvedValue(me({ can_change: false }));
    wrap(<AccountPage {...props} member={{ ...member, session_kind: 'card', has_login: false, email: '' }} />);
    expect(await screen.findByText('Sam')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
    expect(screen.queryByText(/password/i)).toBeNull();
  });

  it('never asks an email sign-in for a password (owner 2026-10-15, J11, APP D9)', async () => {
    mocked.getMe.mockResolvedValue(me({ can_change: false }));
    wrap(<AccountPage {...props} member={{ ...member, session_kind: 'email', has_login: false, ready: false, email_verified: true }} />);
    expect(await screen.findByText('Sam')).toBeInTheDocument();
    expect(screen.queryByText('Set up your sign-in')).toBeNull();
    expect(screen.queryByText(/password/i)).toBeNull();
  });

  it('leaves the account when the second adult chooses to leave', async () => {
    mocked.getMe.mockResolvedValue(
      me({
        people: [
          { id: 1, first_name: 'Dana', role: 'primary', verified_18: true, is_you: false, cards: [] },
          { id: 2, first_name: 'Sam', role: 'secondary', verified_18: true, is_you: true, cards: [] },
        ],
      }),
    );
    mocked.removePerson.mockResolvedValue({ status: 'signed_out' });
    const user = userEvent.setup();
    wrap(<AccountPage {...props} />);
    await user.click(await screen.findByRole('button', { name: 'Leave this account' }));
    const prompt = screen.getByText(/Leave this account\? You will be signed out\./);
    await user.click(within(prompt.parentElement as HTMLElement).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(mocked.removePerson).toHaveBeenCalledWith(2));
  });

  const emails = (news: boolean) => ({
    updates: true,
    news,
    has_email: true,
    note: "We'll email your receipts and Thrift+ updates. Store news emails have an unsubscribe link.",
  });

  it('shows the email line and turns store news off and on (T74)', async () => {
    mocked.getMe.mockResolvedValueOnce(me({ emails: emails(true) })).mockResolvedValue(me({ emails: emails(false) }));
    mocked.setMyNews.mockResolvedValue(me({ emails: emails(false) }));
    const user = userEvent.setup();
    wrap(<AccountPage {...props} />);
    expect(await screen.findByText(/Store news emails have an unsubscribe link/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(mocked.setMyNews).toHaveBeenCalledWith(false));
    await user.click(await screen.findByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(mocked.setMyNews).toHaveBeenCalledWith(true));
  });

  it('lets a card session turn store news off but not back on', async () => {
    mocked.getMe.mockResolvedValue(me({ can_change: false, emails: emails(false) }));
    wrap(<AccountPage {...props} member={{ ...member, session_kind: 'card' }} />);
    expect(await screen.findByText('Store news')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument();
  });
});
