import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ThriftPlusMember } from '../../../api/thriftPlusScanner.api';
import * as api from '../../../api/thriftPlusScanner.api';
import { AccountPage, ResetPasswordScreen } from './AccountScreens';

vi.mock('../../../api/thriftPlusScanner.api', () => ({
  confirmPasswordReset: vi.fn(),
  getMe: vi.fn(),
  reportCardLost: vi.fn(),
  removePerson: vi.fn(),
  setMyEmails: vi.fn(),
  setUpLogin: vi.fn(),
  getSession: vi.fn(),
  getCart: vi.fn(),
}));

const mocked = vi.mocked(api);

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const cover = { month: '2026-10', amount: '10.00', covered: '4.00', remaining: '6.00', is_covered: false, resets_on: '2026-11-01' };
const member: ThriftPlusMember = {
  first_name: 'Dana',
  email: 'dana@example.com',
  username: null,
  card_last4: '4821',
  verified_18: true,
  cover,
  banked_rewards: '12.50',
  credit_balance: '3.00',
  session_kind: 'password',
  has_login: true,
};

const me = (over: Partial<api.ThriftPlusMe> = {}): api.ThriftPlusMe => ({
  banked: '12.50',
  credit: '3.00',
  cover,
  can_change: true,
  people: [
    { id: 1, first_name: 'Dana', role: 'primary', verified_18: true, is_you: true, cards: [{ id: 11, last4: '4821', status: 'active' }] },
    { id: 2, first_name: 'Sam', role: 'secondary', verified_18: true, is_you: false, cards: [{ id: 12, last4: '9033', status: 'active' }] },
  ],
  money: [{ kind: 'bank', amount: '5.25', reason: 'Banked rewards', created_at: '2026-10-01T12:00:00Z' }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResetPasswordScreen', () => {
  it('will not save two passwords that differ', async () => {
    const user = userEvent.setup();
    wrap(<ResetPasswordScreen token="tok" onDone={() => undefined} />);
    await user.type(screen.getByLabelText('New password'), 'one-good-pass');
    await user.type(screen.getByLabelText('New password again'), 'another-one');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("don't match");
    expect(mocked.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('saves the new password with the link token and signs them in', async () => {
    mocked.confirmPasswordReset.mockResolvedValue({ status: 'member', member });
    const onDone = vi.fn();
    const user = userEvent.setup();
    wrap(<ResetPasswordScreen token="tok-123" onDone={onDone} />);
    await user.type(screen.getByLabelText('New password'), 'one-good-pass');
    await user.type(screen.getByLabelText('New password again'), 'one-good-pass');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText("You're all set")).toBeInTheDocument();
    expect(mocked.confirmPasswordReset).toHaveBeenCalledWith('tok-123', 'one-good-pass');
    await user.click(screen.getByRole('button', { name: 'Start scanning' }));
    expect(onDone).toHaveBeenCalled();
  });

  it("shows the server's words when the link has expired", async () => {
    mocked.confirmPasswordReset.mockRejectedValue(new Error('That link has expired. Ask for a new one.'));
    const user = userEvent.setup();
    wrap(<ResetPasswordScreen token="old" onDone={() => undefined} />);
    await user.type(screen.getByLabelText('New password'), 'one-good-pass');
    await user.type(screen.getByLabelText('New password again'), 'one-good-pass');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('expired');
  });
});

describe('AccountPage', () => {
  const props = { member, onBack: () => undefined, onSignOut: () => undefined, onSignInWithPassword: () => undefined };

  it('shows balances, people and cards, and stops a lost card after a confirm', async () => {
    mocked.getMe.mockResolvedValue(me());
    mocked.reportCardLost.mockResolvedValue(me());
    const user = userEvent.setup();
    wrap(<AccountPage {...props} />);
    expect(await screen.findByText('Sam')).toBeInTheDocument();
    expect(screen.getByText('Card ending 9033')).toBeInTheDocument();
    expect(screen.getAllByText('$12.50').length).toBeGreaterThan(0);

    const lost = screen.getAllByRole('button', { name: 'Lost it?' });
    await user.click(lost[1]);
    expect(mocked.reportCardLost).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Stop this card' }));
    await waitFor(() => expect(mocked.reportCardLost).toHaveBeenCalledWith(12));
  });

  it('lets the main member take the second adult off', async () => {
    mocked.getMe.mockResolvedValue(me());
    mocked.removePerson.mockResolvedValue(me());
    const user = userEvent.setup();
    wrap(<AccountPage {...props} />);
    await user.click(await screen.findByRole('button', { name: 'Remove Sam' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mocked.removePerson).toHaveBeenCalledWith(2));
  });

  it('hides the changes for a card session and explains how to get them', async () => {
    mocked.getMe.mockResolvedValue(me({ can_change: false }));
    wrap(<AccountPage {...props} member={{ ...member, session_kind: 'card' }} />);
    expect(await screen.findByText(/sign in with your email and password/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lost it?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
  });

  it('offers to set up a sign-in when there is none, and saves it', async () => {
    mocked.getMe.mockResolvedValue(me({ can_change: false }));
    mocked.setUpLogin.mockResolvedValue({ status: 'member', member: { ...member, has_login: true } });
    const user = userEvent.setup();
    wrap(<AccountPage {...props} member={{ ...member, session_kind: 'card', has_login: false, email: '' }} />);
    await user.type(await screen.findByLabelText('Email for sign-in'), 'dana@example.com');
    await user.type(screen.getByLabelText('Choose a password'), 'one-good-pass');
    await user.click(screen.getByRole('button', { name: 'Save sign-in' }));
    await waitFor(() => expect(mocked.setUpLogin).toHaveBeenCalledWith('dana@example.com', 'one-good-pass', undefined));
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

  const emails = (thriftplus: boolean, news: boolean) => ({
    has_email: true,
    choices: { thriftplus, news },
    not_required: 'Neither box is needed to join or to buy anything.',
    kinds: [
      { kind: 'thriftplus' as const, version: 'thriftplus-email-2026-10-08', label: 'Thrift+ updates by email', text: 'Email me my Thrift+ updates.' },
      { kind: 'news' as const, version: 'news-email-2026-10-08', label: 'Store news by email', text: 'Email me Eco-Thrift store news.' },
    ],
  });

  it('shows your two email choices and turns one off or on (T73)', async () => {
    mocked.getMe.mockResolvedValue(me({ emails: emails(true, false) }));
    mocked.setMyEmails.mockResolvedValue(me({ emails: emails(false, false) }));
    const user = userEvent.setup();
    wrap(<AccountPage {...props} />);
    expect(await screen.findByText('Thrift+ updates by email')).toBeInTheDocument();
    expect(screen.getByText('Email me Eco-Thrift store news.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Turn off' })[0]);
    await waitFor(() => expect(mocked.setMyEmails).toHaveBeenCalledWith('thriftplus', false));
    await user.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(mocked.setMyEmails).toHaveBeenCalledWith('news', true));
  });

  it('lets a card session stop emails but not start them', async () => {
    mocked.getMe.mockResolvedValue(me({ can_change: false, emails: emails(true, false) }));
    wrap(<AccountPage {...props} member={{ ...member, session_kind: 'card' }} />);
    expect(await screen.findByRole('button', { name: 'Turn off' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument();
  });
});
