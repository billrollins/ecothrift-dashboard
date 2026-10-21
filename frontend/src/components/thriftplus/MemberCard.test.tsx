import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThriftMemberCardData } from '../../api/thriftplusRegister.api';
import MemberCard from './MemberCard';

const m = vi.hoisted(() => ({
  card: {} as Record<number, unknown>,
  finished: [] as Array<Record<string, unknown>>,
  finishResult: null as unknown,
  added: [] as unknown[],
  inked: false,
}));

vi.mock('../../api/thriftplusRegister.api', () => ({
  getMemberCard: async (id: number) => m.card[id],
  finishThriftJoin: async (body: Record<string, unknown>) => {
    m.finished.push(body);
    return m.finishResult;
  },
  thriftErrorMessage: (err: { response?: { data?: { detail?: string } } }, fallback = 'error') => err?.response?.data?.detail ?? fallback,
}));
vi.mock('../../api/thriftplus.api', () => ({
  addSecondAdult: async (account: number, body: unknown) => {
    m.added.push([account, body]);
    return {};
  },
}));
// The signature pad needs a real canvas; here it just reports ink and hands back a PNG.
vi.mock('../../pages/thriftplus/finalize/ThriftSignaturePad', async () => {
  const React = await import('react');
  return {
    default: React.forwardRef(function Pad(
      { onInk }: { onInk: (v: boolean) => void },
      ref: React.Ref<{ toBlob: () => Promise<Blob>; clear: () => void }>,
    ) {
      React.useImperativeHandle(ref, () => ({ toBlob: async () => new Blob(['png'], { type: 'image/png' }), clear: () => undefined }));
      return <button type="button" data-testid="pad" onClick={() => onInk(true)}>sign</button>;
    }),
  };
});
vi.mock('../../services/receiving/receivingClient', () => ({ compressImageToJpeg: async (f: File) => f }));

function card(over: Partial<ThriftMemberCardData['person']> = {}, extra: Partial<ThriftMemberCardData> = {}): ThriftMemberCardData {
  return {
    person: {
      person_id: 5, account_id: 1, first_name: 'Ana', last_name: 'Bell', name: 'Ana Bell', email: 'ana@example.com',
      joined_at: '2026-10-19T15:00:00Z', code_last4: '0008', code_display: '1000 0000 0008', standing: 'member', role: 'primary',
      practice: false, status: 'active', verified_18: true, id_checked: true, photo_url: '/media/ana.jpg', phone_last4: '0101',
      signed: true, selfie: true, ...over,
    },
    rewards: { collected: '45.00', used: '12.50', balance: '30.25', usable_today: '20.00', use_by: '2026-11-19', credit: '5.00' },
    trips: [
      { cart_id: 90, ticket: 'R-20261019-004', date: '2026-10-19', items: 2, total: '42.80' },
      { cart_id: 80, ticket: 'R-20261012-011', date: '2026-10-12', items: 1, total: '10.70' },
    ],
    people: [{ person_id: 5, first_name: 'Ana', name: 'Ana Bell', role: 'primary', photo_url: '/media/ana.jpg', verified_18: true }],
    ...extra,
  };
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

beforeEach(() => {
  m.card = { 5: card() };
  m.finished = [];
  m.finishResult = null;
  m.added = [];
});

describe('The member card (owner 2026-10-20)', () => {
  it('shows the photo, name, status, ThriftBucks collected, used and left with the use-by date, credit, trips and people', async () => {
    wrap(<MemberCard personId={5} />);
    expect(await screen.findByTestId('member-card-name')).toHaveTextContent('Ana Bell');
    expect(screen.getByTestId('member-card-status')).toHaveTextContent('Member');
    expect(screen.getAllByAltText('Ana Bell')[0]).toHaveAttribute('src', '/media/ana.jpg');
    expect(screen.getByTestId('member-card-collected')).toHaveTextContent('45.00');
    expect(screen.getByTestId('member-card-used')).toHaveTextContent('12.50');
    expect(screen.getByTestId('member-card-balance')).toHaveTextContent('30.25');
    expect(screen.getByTestId('member-card-balance')).toHaveTextContent('use by Nov 19');
    expect(screen.getByTestId('member-card-credit')).toHaveTextContent('$5.00');
    const trips = screen.getByTestId('member-card-trips');
    expect(within(trips).getByText('Ticket R-20261019-004')).toBeInTheDocument();
    expect(within(trips).getByText('Mon Oct 19')).toBeInTheDocument();
    expect(within(trips).getByText('$42.80')).toBeInTheDocument();
    expect(within(trips).getByText('2 items')).toBeInTheDocument();
    expect(within(trips).getByText('1 item')).toBeInTheDocument();
    expect(within(screen.getByTestId('member-card-people')).getByText('Ana Bell')).toBeInTheDocument();
    expect(screen.queryByTestId('member-card-finalize')).not.toBeInTheDocument(); // already a member
    expect(document.body.textContent ?? '').not.toMatch(/\bcards?\b/i);
  });

  it('counts their returns and warns at the owner number, never blocking (W14, owner 2026-10-21)', async () => {
    m.card = { 5: card({}, { returns: { trips: 1, items: 2, days: 30, warn_at: 3, warning: false } }) };
    const { unmount } = wrap(<MemberCard personId={5} />);
    expect(await screen.findByTestId('member-card-returns')).toHaveTextContent('Returns: 1 trip (2 items) in the last 30 days.');
    expect(screen.getByTestId('member-card-returns')).not.toHaveTextContent('check with a manager');
    unmount();
    m.card = { 5: card({}, { returns: { trips: 3, items: 4, days: 30, warn_at: 3, warning: true } }) };
    wrap(<MemberCard personId={5} />);
    expect(await screen.findByTestId('member-card-returns')).toHaveTextContent('3 trips (4 items) in the last 30 days. That is a lot of returns');
  });

  it('says so when there are no trips yet', async () => {
    m.card = { 5: card({}, { trips: [] }) };
    wrap(<MemberCard personId={5} />);
    expect(await screen.findByText('No trips yet.')).toBeInTheDocument();
  });

  it('Add a 2nd person opens the form and adds them to the membership', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    wrap(<MemberCard personId={5} onChanged={onChanged} />);
    await user.click(await screen.findByTestId('member-card-add-person'));
    expect(screen.getByTestId('add-person')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add them' })).toBeDisabled();
    await user.type(screen.getByLabelText(/First name/), 'Ben');
    await user.type(screen.getByLabelText(/Last name/), 'Bell');
    await user.click(screen.getByLabelText(/Checked a photo ID/));
    await user.click(screen.getByLabelText(/Both are here, and Ana approves/));
    expect(screen.getByRole('button', { name: 'Add them' })).toBeDisabled(); // a photo is needed too
    const photo = new File(['jpg'], 'ben.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByTestId('add-person').querySelector('input[type="file"]') as HTMLInputElement, photo);
    await user.click(screen.getByRole('button', { name: 'Add them' }));
    await waitFor(() => expect(m.added).toHaveLength(1));
    expect(m.added[0]).toMatchObject([1, { first_name: 'Ben', last_name: 'Bell', id_checked: true, photo, both_present: true, primary_approves: true }]);
    expect(await screen.findByTestId('member-card-note')).toHaveTextContent('Ben Bell is on the membership.');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.queryByTestId('add-person')).not.toBeInTheDocument();
  });

  it('hides Add a 2nd person once there are two adults, and for someone who is not a member yet', async () => {
    m.card = {
      5: card({}, {
        people: [
          { person_id: 5, first_name: 'Ana', name: 'Ana Bell', role: 'primary', photo_url: null, verified_18: true },
          { person_id: 6, first_name: 'Ben', name: 'Ben Bell', role: 'secondary', photo_url: null, verified_18: true },
        ],
      }),
      9: card({ person_id: 9, account_id: 2, name: 'Cy Lee', first_name: 'Cy', last_name: 'Lee', standing: 'pending', status: 'pending' }),
    };
    const { unmount } = wrap(<MemberCard personId={5} />);
    await screen.findByTestId('member-card-name');
    expect(screen.queryByTestId('member-card-add-person')).not.toBeInTheDocument();
    unmount();
    wrap(<MemberCard personId={9} />);
    await screen.findByTestId('member-card-finalize');
    expect(screen.queryByTestId('member-card-add-person')).not.toBeInTheDocument();
  });

  it('tapping another person on the membership shows their card', async () => {
    const user = userEvent.setup();
    m.card = {
      5: card({}, {
        people: [
          { person_id: 5, first_name: 'Ana', name: 'Ana Bell', role: 'primary', photo_url: null, verified_18: true },
          { person_id: 6, first_name: 'Ben', name: 'Ben Bell', role: 'secondary', photo_url: null, verified_18: true },
        ],
      }),
      6: card({ person_id: 6, name: 'Ben Bell', first_name: 'Ben', role: 'secondary' }),
    };
    wrap(<MemberCard personId={5} />);
    await screen.findByText('Ana Bell', { selector: '[data-testid="member-card-name"]' });
    await user.click(within(screen.getByTestId('member-card-people')).getByText('Ben Bell'));
    await waitFor(() => expect(screen.getByTestId('member-card-name')).toHaveTextContent('Ben Bell'));
  });
});

describe('Finalize on the member card: only the ID check, then Match (owner 2026-10-20)', () => {
  beforeEach(() => {
    m.card = { 9: card({ person_id: 9, account_id: 2, name: 'Cy Lee', first_name: 'Cy', last_name: 'Lee', standing: 'pending', status: 'pending', signed: true, photo_url: '/media/cy.jpg' }) };
  });

  it('asks Name matches, Photo matches and 18 or older; Match waits for the first two', async () => {
    const user = userEvent.setup();
    wrap(<MemberCard personId={9} cartId={3} />);
    expect(await screen.findByTestId('member-card-status')).toHaveTextContent('Needs ID check');
    const match = screen.getByTestId('member-card-match');
    expect(match).toBeDisabled();
    const name = screen.getByLabelText('Name matches');
    const photo = screen.getByLabelText('Photo matches');
    const over18 = screen.getByLabelText('18 or older');
    expect(over18).toBeDisabled(); // after the first two
    await user.click(name);
    expect(match).toBeDisabled();
    await user.click(photo);
    expect(match).toBeEnabled();
    await user.click(over18);
    expect(screen.getByText('Signed the terms in the app.')).toBeInTheDocument(); // no signature asked
  });

  it('Match sends the ID check with the sale, puts them on it and says so', async () => {
    const user = userEvent.setup();
    const onCart = vi.fn();
    const onFinalized = vi.fn();
    m.finishResult = { person_id: 9, account_id: 2, first_name: 'Cy', last_name: 'Lee', status: 'active', cart: { id: 3 } };
    wrap(<MemberCard personId={9} cartId={3} onCart={onCart} onFinalized={onFinalized} />);
    await screen.findByTestId('member-card-finalize');
    await user.click(screen.getByLabelText('Name matches'));
    await user.click(screen.getByLabelText('Photo matches'));
    await user.click(screen.getByLabelText('18 or older'));
    await user.click(screen.getByTestId('member-card-match'));
    await waitFor(() => expect(m.finished).toHaveLength(1));
    expect(m.finished[0]).toMatchObject({ person: 9, id_checked: true, face_matches: true, verified_18: true, finalize: true, cart: 3 });
    expect(m.finished[0]).not.toHaveProperty('signature');
    expect(m.finished[0]).not.toHaveProperty('photo');
    expect(onCart).toHaveBeenCalledWith({ id: 3 });
    expect(onFinalized).toHaveBeenCalled();
    expect(await screen.findByTestId('member-card-note')).toHaveTextContent('Cy is a Thrift+ member and on this sale.');
  });

  it('a Retake photo goes with Match, and a missing photo must be taken first', async () => {
    const user = userEvent.setup();
    m.card = { 9: card({ person_id: 9, account_id: 2, name: 'Cy Lee', first_name: 'Cy', last_name: 'Lee', standing: 'pending', status: 'pending', signed: true, photo_url: null }) };
    m.finishResult = { person_id: 9, account_id: 2, first_name: 'Cy', last_name: 'Lee', status: 'active', cart: null };
    wrap(<MemberCard personId={9} />);
    await screen.findByTestId('member-card-finalize');
    await user.click(screen.getByLabelText('Name matches'));
    await user.click(screen.getByLabelText('Photo matches'));
    expect(screen.getByTestId('member-card-match')).toBeDisabled();
    expect(screen.getByText('Take their photo first.')).toBeInTheDocument();
    const file = new File(['jpg'], 'cy.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByTestId('selfie-check-retake-input'), file);
    await waitFor(() => expect(screen.getByTestId('member-card-match')).toBeEnabled());
    await user.click(screen.getByTestId('member-card-match'));
    await waitFor(() => expect(m.finished).toHaveLength(1));
    expect(m.finished[0].photo).toBe(file);
    expect(m.finished[0].cart).toBeNull();
    expect(await screen.findByTestId('member-card-note')).toHaveTextContent('Cy is a Thrift+ member.');
  });

  it('asks for a signature only when they never signed', async () => {
    const user = userEvent.setup();
    m.card = { 9: card({ person_id: 9, account_id: 2, name: 'Cy Lee', first_name: 'Cy', last_name: 'Lee', standing: 'pending', status: 'pending', signed: false }) };
    m.finishResult = { person_id: 9, account_id: 2, first_name: 'Cy', last_name: 'Lee', status: 'active', cart: null };
    wrap(<MemberCard personId={9} />);
    await screen.findByTestId('member-card-sign');
    await user.click(screen.getByLabelText('Name matches'));
    await user.click(screen.getByLabelText('Photo matches'));
    expect(screen.getByTestId('member-card-match')).toBeDisabled();
    expect(screen.getByText('They sign first.')).toBeInTheDocument();
    await user.click(screen.getByTestId('pad'));
    await user.click(screen.getByTestId('member-card-match'));
    await waitFor(() => expect(m.finished).toHaveLength(1));
    expect(m.finished[0].signature).toBeInstanceOf(Blob);
  });

  it('shows the server\'s reason when Match is refused, and nothing is claimed', async () => {
    const user = userEvent.setup();
    m.finishResult = null;
    const api = await import('../../api/thriftplusRegister.api');
    vi.spyOn(api, 'finishThriftJoin').mockRejectedValueOnce({ response: { data: { detail: 'The ID check is needed.' } } });
    wrap(<MemberCard personId={9} />);
    await screen.findByTestId('member-card-finalize');
    await user.click(screen.getByLabelText('Name matches'));
    await user.click(screen.getByLabelText('Photo matches'));
    await user.click(screen.getByTestId('member-card-match'));
    expect(await screen.findByTestId('member-card-error')).toHaveTextContent('The ID check is needed.');
    expect(screen.queryByTestId('member-card-note')).not.toBeInTheDocument();
  });
});
