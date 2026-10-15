import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as mockApi from '../../../api/thriftPlusMock';
import { thriftPlusMockControls } from '../../../api/thriftPlusMock';
import ThriftPlusScannerPage from './ThriftPlusScannerPage';

// The page talks to the real API module; these tests stand the in-memory mock in for the server.
vi.mock('../../../api/thriftPlusScanner.api', async () => {
  const mock = await vi.importActual<typeof import('../../../api/thriftPlusMock')>('../../../api/thriftPlusMock');
  return {
    ...mock,
    confirmPasswordReset: vi.fn(),
    getMe: vi.fn(async () => ({ credit: '8.56', rewards: [{ amount: '10.25', earned_on: '2026-10-02', use_by: '2026-11-01', past_due: false }] })),
    removePerson: vi.fn(),
    setUpLogin: vi.fn(),
    isOpen: vi.fn(async () => true),
    fetchTestTags: vi.fn(async () => []),
    // The Member QR's code; a member who joined online isn't ready until a register finishes them (J2, APP D9).
    getMyCard: vi.fn(async () => {
      const s = await mock.getSession();
      const member = s.status === 'member' ? s.member : null;
      return { code: '402155831907', display: '4021 5583 1907', qr: 'TP402155831907', first_name: member?.first_name ?? 'Dana', ready: member?.ready !== false };
    }),
    setPreviewCode: vi.fn(),
  };
});

// jsdom has no camera or WebAssembly decoder; the page falls back to typing a tag.
vi.mock('./useQrCamera', async (orig) => ({
  ...(await orig<typeof import('./useQrCamera')>()),
  loadDetector: () => new Promise(() => undefined),
}));

/** The address the page is on now (`?signin=` comes off it, a join adds `view=qr`). */
function Where() {
  return <div data-testid="where">{useLocation().search}</div>;
}

function renderPage(path = '/scan') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <ThriftPlusScannerPage />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type User = ReturnType<typeof userEvent.setup>;

/** The password form is "Staff sign in" now (owner 2026-10-15, APP D9); the mock takes any login. */
async function signInAsMember(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Staff sign in' }));
  await user.type(await screen.findByLabelText('Email or username'), 'dana');
  await user.type(screen.getByLabelText('Password'), 'secret');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

/** "Email me a link" from the sign-in screen. */
async function emailMeALink(user: User, email = 'dana@example.com') {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Email me a link' }));
  return screen.findByTestId('check-email');
}

const lastCode = () => thriftPlusMockControls.outbox().at(-1)?.code ?? '';

async function scan(user: User, code: string) {
  await user.type(await screen.findByLabelText('Tag number'), `${code}{Enter}`);
}

beforeEach(() => {
  window.localStorage.clear();
  thriftPlusMockControls.reset();
  thriftPlusMockControls.setLatency(0);
});

describe('Thrift+ trip scanner (owner 2026-10-13)', () => {
  it('says coming soon while Thrift+ is off (owner, 2026-10-07)', async () => {
    const api = await import('../../../api/thriftPlusScanner.api');
    vi.mocked(api.isOpen).mockResolvedValueOnce(false);
    renderPage();
    expect(await screen.findByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByText('Ask at the register.')).toBeInTheDocument();
  });

  it('scans a tag, adds it from the bottom buttons, and flips to the trip from This trip', async () => {
    const user = userEvent.setup();
    renderPage();
    await signInAsMember(user);
    expect(await screen.findByTestId('see-trip')).toHaveTextContent('See this trip');

    await scan(user, 'TP0000001');
    const card = await screen.findByTestId('scan-card');
    expect(await within(card).findByText('Cordless Drill Kit')).toBeInTheDocument();
    expect(within(card).getByTestId('badge-returns')).toHaveTextContent('3-day returns');
    expect(within(card).getByText('$60.00')).toBeInTheDocument();
    await waitFor(() => expect(within(card).getByTestId('reward-band')).toHaveTextContent('+15.00ThriftBucks back'), { timeout: 3000 });
    expect(within(screen.getByTestId('actions')).getByRole('button', { name: /Pass/ })).toBeInTheDocument();

    await user.click(screen.getByTestId('add'));
    await waitFor(() => expect(screen.queryByTestId('scan-card')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('1'));
    await waitFor(() => expect(screen.getByTestId('trip-summary')).toHaveTextContent('+15.00ThriftBucks back'), { timeout: 3000 });

    // This trip flips to the lines; ×1 opens − +.
    await user.click(screen.getByTestId('trip-summary'));
    const trip = await screen.findByTestId('trip-view');
    expect(within(trip).getByText('Cordless Drill Kit')).toBeInTheDocument();
    await user.click(within(trip).getByTestId('qty-chip'));
    await user.click(within(trip).getByRole('button', { name: 'One more' }));
    await waitFor(() => expect(within(trip).getByTestId('qty')).toHaveTextContent('2'));
    await waitFor(() => expect(screen.getByTestId('trip-summary')).toHaveTextContent('+30.00'), { timeout: 3000 });
    expect(screen.getByTestId('actions')).toHaveTextContent('Scan more');

    // Clear my trip, then Undo puts it back.
    await user.click(within(trip).getByTestId('clear-trip'));
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('0'));
    await user.click(within(screen.getByTestId('undo-toast')).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('2'));

    await user.click(screen.getByTestId('scan-more'));
    expect(await screen.findByLabelText('Tag number')).toBeInTheDocument();
  });

  it('marks AS IS, and a sold tag cannot be added', async () => {
    const user = userEvent.setup();
    renderPage();
    await signInAsMember(user);
    await scan(user, 'TP0000007');
    const shoes = await screen.findByTestId('scan-card');
    expect(await within(shoes).findByTestId('badge-as-is')).toHaveTextContent('AS IS · no returns');
    await user.click(within(shoes).getByTestId('badge-as-is'));
    expect(await screen.findByTestId('info-sheet')).toHaveTextContent("This item can't be returned.");
    await user.click(within(screen.getByTestId('info-sheet')).getByRole('button', { name: 'Close' }));
    await user.click(screen.getByTestId('pass'));
    await waitFor(() => expect(screen.queryByTestId('scan-card')).not.toBeInTheDocument());

    await scan(user, 'TP0000008');
    const patio = await screen.findByTestId('scan-card');
    expect(await within(patio).findByText(/Sold/)).toBeInTheDocument();
    expect(screen.getByTestId('add')).toBeDisabled();
  });

  it('explains retail prices, and a price report ends in thanks with how we price', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Scan without signing in' }));
    await scan(user, 'TP0000001');
    const card = await screen.findByTestId('scan-card');
    expect(await within(card).findByText('ThriftBucks for members')).toBeInTheDocument();
    expect(within(card).getByText('Free to join')).toBeInTheDocument(); // joining starts in the app (APP D9)

    await user.click(within(card).getByTestId('retail'));
    expect(await screen.findByTestId('info-sheet')).toHaveTextContent('Retail prices come straight from the retailer');
    await user.click(within(screen.getByTestId('info-sheet')).getByRole('button', { name: 'Close' }));

    await user.click(within(card).getByTestId('price-feel'));
    const feel = await screen.findByTestId('feel-sheet');
    await user.click(within(feel).getByRole('button', { name: 'Price is too high' }));
    await user.click(within(feel).getByRole('button', { name: '$51' }));
    expect(await within(feel).findByText("Thanks, we'll review it")).toBeInTheDocument();
    expect(within(feel).getByText('How we price')).toBeInTheDocument();
    expect(thriftPlusMockControls.signals().at(-1)).toMatchObject({ kind: 'feel', sku: 'TP0000001', feel: { reason: 'too_high', would_pay: '51.00' } });
    await user.click(within(feel).getByTestId('feel-close'));
    expect(screen.getByTestId('scan-card')).toBeInTheDocument();

    // Pass from the keyboard (a laptop): the card goes and the pass is counted.
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(screen.queryByTestId('scan-card')).not.toBeInTheDocument());
    expect(thriftPlusMockControls.signals().at(-1)).toMatchObject({ kind: 'pass', sku: 'TP0000001' });
  });

  it('the header explains Thrift+, and the pill lists credit and ThriftBucks in the order used', async () => {
    const user = userEvent.setup();
    renderPage();
    await signInAsMember(user);
    await user.click(await screen.findByTestId('about-thriftplus'));
    const about = await screen.findByTestId('thriftplus-sheet');
    expect(within(about).getByText('ThriftBucks, 3-day returns and more!')).toBeInTheDocument();
    expect(within(about).getByTestId('terms-link')).toHaveAttribute('href', 'https://ecothrift.us/terms');
    // "Non-member", never "guest" (owner 2026-10-15, APP D10).
    expect(about).toHaveTextContent('Non-members pay the tag. Everything a non-member buys is sold AS IS. All sales final.');
    await user.click(within(about).getByRole('button', { name: 'Close' }));

    // The Member QR button, top right on every screen (owner 2026-10-14, APP D7); the balance is in the sheet, not the header.
    const pill = screen.getByTestId('wallet-pill');
    expect(pill).toHaveAccessibleName('Member QR: show it at the register');
    expect(pill).toHaveTextContent('Member QR');
    expect(screen.queryByTestId('my-card-button')).not.toBeInTheDocument();
    await user.click(pill);
    const wallet = await screen.findByTestId('wallet-sheet');
    // My card (owner 2026-10-14): the QR to show at the register, its code to type, and the card's B12 line.
    expect(await within(wallet).findByTestId('my-card-code')).toHaveTextContent('4021 5583 1907');
    await waitFor(() => expect(within(wallet).getByTestId('my-card-qr').querySelector('svg')).not.toBeNull());
    expect(within(wallet).getByTestId('my-card')).toHaveTextContent('Show this at the register.');
    expect(within(wallet).getByTestId('my-card')).toHaveTextContent('ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value.'); 
    const rows = await within(wallet).findAllByTestId('wallet-row');
    expect(rows[0]).toHaveTextContent('Thrift+ credit');
    expect(rows[0]).toHaveTextContent('$8.56');
    expect(rows[1]).toHaveTextContent('use by Nov 1');
    expect(within(wallet).getByTestId('sign-out')).toBeInTheDocument();
    await user.click(within(wallet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('wallet-sheet')).not.toBeInTheDocument());
  });

  it('ecothrift.us/qr signs in, then opens the Member QR; on iPhone Safari it shows how to add it to the home screen', async () => {
    // Owner 2026-10-14 (APP D5 and D6). /qr redirects to /scan?view=qr (and the old /card too).
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    );
    const user = userEvent.setup();
    renderPage('/scan?view=qr');
    await signInAsMember(user);
    const wallet = await screen.findByTestId('wallet-sheet');
    expect(within(wallet).getByRole('heading', { name: 'Member QR' })).toBeInTheDocument();
    expect(await within(wallet).findByTestId('my-card-code')).toHaveTextContent('4021 5583 1907');
    expect(within(wallet).getByTestId('add-to-home')).toHaveTextContent('Add your member QR to your home screen');
    expect(document.head.querySelector('link[rel="manifest"]')).toHaveAttribute('href', '/scan/manifest.webmanifest');
    await user.click(within(wallet).getByTestId('add-to-home'));
    const how = await screen.findByTestId('add-to-home-sheet');
    expect(how).toHaveTextContent('Add it to your home screen');
    expect(how).toHaveTextContent('Then one tap opens your member QR at the register.');
    expect(how).toHaveTextContent('1. Tap Share at the bottom of Safari (the square with the arrow).');
    expect(how).toHaveTextContent('2. Tap Add to Home Screen, then Add.');
    await user.click(within(how).getByTestId('add-to-home-done'));
    await waitFor(() => expect(screen.queryByTestId('add-to-home-sheet')).toBeNull());
    // × goes back to the scanner.
    await user.click(within(screen.getByTestId('wallet-sheet')).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('wallet-sheet')).toBeNull());
    expect(await screen.findByLabelText('Tag number')).toBeInTheDocument();
    ua.mockRestore();
  });

  it('hides "Add My card to your home screen" where a phone cannot add it', async () => {
    const user = userEvent.setup();
    renderPage('/scan?view=card');
    await signInAsMember(user);
    const wallet = await screen.findByTestId('wallet-sheet');
    expect(await within(wallet).findByTestId('my-card-code')).toBeInTheDocument();
    expect(within(wallet).queryByTestId('add-to-home')).toBeNull();
  });

  it('shows a clear miss for a code that is not a price tag, and helps when the camera does not work', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Scan without signing in' }));
    await scan(user, 'nope!');
    expect(await screen.findByText("That code isn't a price tag")).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Camera not working?' }));
    const help = await screen.findByRole('dialog', { name: 'Camera not working?' });
    await user.click(within(help).getByRole('tab', { name: 'Android' }));
    expect(within(help).getByText(/Tap Permissions, then turn Camera on/)).toBeInTheDocument();
  });
});

describe('Email sign-in and joining (owner 2026-10-15, APP D9)', () => {
  it('signs in by email: the same line for any email, and the code signs in on its sixth digit', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText("Enter your email and we'll send you a link. No password needed.")).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('inputmode', 'email');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByRole('button', { name: 'Join Thrift+' })).toBeInTheDocument();
    expect(screen.getByText('Free to join. Nothing owed.')).toBeInTheDocument();
    expect(screen.queryByText(/Join free at the register/)).toBeNull();

    const check = await emailMeALink(user, 'Dana@Example.com');
    expect(within(check).getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(check).toHaveTextContent(
      "If that email belongs to a member, we've sent a link. Tap it on this phone, or type the code from the email.",
    );
    expect(within(check).getByTestId('sent-to')).toHaveTextContent('Dana@Example.com');
    expect(thriftPlusMockControls.outbox()).toMatchObject([{ to: 'dana@example.com', purpose: 'sign_in' }]);

    const code = within(check).getByLabelText('6-digit code');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(within(check).getByRole('button', { name: 'Sign in' })).toBeDisabled();
    // Digits only; the sixth signs in by itself (no "Sign in" tap).
    await user.type(code, `${lastCode().slice(0, 3)} -${lastCode().slice(3)}`);
    expect(await screen.findByTestId('see-trip')).toBeInTheDocument();
    expect(screen.queryByTestId('wallet-sheet')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/);
  });

  it("says when the code didn't work, and Change goes back with the email kept", async () => {
    const user = userEvent.setup();
    renderPage();
    const check = await emailMeALink(user);
    const wrong = lastCode() === '000000' ? '111111' : '000000';
    await user.type(within(check).getByLabelText('6-digit code'), wrong);
    expect(await within(check).findByRole('alert')).toHaveTextContent("That code didn't work. Check it and try again.");
    expect(screen.queryByTestId('see-trip')).toBeNull();

    await user.click(within(check).getByRole('button', { name: 'Change' }));
    expect(await screen.findByLabelText('Email')).toHaveValue('dana@example.com');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('counts down to "Send it again", and after the third send says to ask at a register', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
      renderPage();
      await emailMeALink(user);
      const resend = () => screen.getByTestId('resend');
      expect(resend()).toHaveTextContent("Didn't get it? Check spam, or send again in 0:30");
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(resend()).toHaveTextContent(/send again in 0:(19|20|21)$/);
      act(() => {
        vi.advanceTimersByTime(20_500);
      });
      await user.click(within(resend()).getByRole('button', { name: 'Send it again' }));
      await waitFor(() => expect(resend()).toHaveTextContent('send again in 0:30'));
      expect(thriftPlusMockControls.outbox()).toHaveLength(2);

      act(() => {
        vi.advanceTimersByTime(30_500);
      });
      await user.click(within(resend()).getByRole('button', { name: 'Send it again' }));
      await waitFor(() => expect(resend()).toHaveTextContent('Still nothing? Ask at any register.'));
      expect(thriftPlusMockControls.outbox()).toHaveLength(3);
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(resend()).toHaveTextContent('Still nothing? Ask at any register.');
      expect(within(resend()).queryByRole('button')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('joins with a name and email, and the code lands on the Member QR, not ready until a register', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Join Thrift+' }));
    const form = await screen.findByTestId('join-form');
    expect(within(form).getByRole('heading', { name: 'Join Thrift+' })).toBeInTheDocument();
    expect(form).toHaveTextContent('Free to join. Nothing owed. Just your name and email.');
    expect(form).toHaveTextContent(
      "18+. You'll finish joining at any register with your ID and phone number. We email your sign-in links, receipts and Thrift+ news; you can turn news off anytime. Terms: ecothrift.us/terms",
    );
    expect(within(form).getByTestId('join-terms')).toHaveAttribute('href', 'https://ecothrift.us/terms');
    expect(within(form).getByLabelText('Your name')).toHaveAttribute('placeholder', 'First and last name');
    expect(within(form).getByLabelText('Your name')).toHaveAttribute('autocomplete', 'name');
    expect(screen.queryByRole('button', { name: 'Join Thrift+' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Scan without signing in' })).toBeInTheDocument();

    await user.type(within(form).getByLabelText('Your name'), 'Robin Lee');
    await user.type(within(form).getByLabelText('Email'), 'robin@example.com');
    await user.click(within(form).getByRole('button', { name: 'Email me a link' }));
    const check = await screen.findByTestId('check-email');
    expect(check).toHaveTextContent("We've sent a link to confirm your email. Tap it on this phone, or type the code from the email.");
    expect(thriftPlusMockControls.outbox()).toMatchObject([{ to: 'robin@example.com', purpose: 'join' }]);

    await user.type(within(check).getByLabelText('6-digit code'), lastCode());
    const wallet = await screen.findByTestId('wallet-sheet');
    expect(within(wallet).getByRole('heading', { name: 'Member QR' })).toBeInTheDocument();
    expect(await within(wallet).findByText('Finish joining at any register. Show them this code.')).toBeInTheDocument();
    expect(within(wallet).getByTestId('my-card')).toHaveTextContent('Robin');
    expect(screen.getByTestId('where')).toHaveTextContent('?view=qr');
    // × goes to the scanner.
    await user.click(within(wallet).getByRole('button', { name: 'Close' }));
    expect(await screen.findByTestId('see-trip')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/);
  });

  it('the email link (?signin=) signs in to the scanner and comes off the address', async () => {
    await mockApi.requestSignInEmail('dana@example.com');
    const { token } = thriftPlusMockControls.outbox()[0];
    renderPage(`/scan?signin=${token}`);
    expect(await screen.findByTestId('see-trip')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/);
    expect(screen.queryByTestId('wallet-sheet')).toBeNull();
  });

  it("a join's link lands on the Member QR (view=qr)", async () => {
    await mockApi.joinThriftPlus('Robin Lee', 'robin@example.com');
    const { token } = thriftPlusMockControls.outbox()[0];
    renderPage(`/scan?signin=${token}`);
    const wallet = await screen.findByTestId('wallet-sheet');
    expect(await within(wallet).findByText('Finish joining at any register. Show them this code.')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('?view=qr');
  });

  it('a used link says so on the sign-in screen', async () => {
    await mockApi.requestSignInEmail('dana@example.com');
    const { token } = thriftPlusMockControls.outbox()[0];
    await mockApi.signInWithLink(token);
    await mockApi.signOut();
    renderPage(`/scan?signin=${token}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('That link has already been used. Send a new one.');
    expect(screen.getByRole('button', { name: 'Email me a link' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/);
  });

  it('ecothrift.us/join (view=join): the Join screen signed out, the Member QR signed in', async () => {
    const user = userEvent.setup();
    const first = renderPage('/scan?view=join');
    expect(await screen.findByRole('heading', { name: 'Join Thrift+' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Already a member? Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    first.unmount();

    await mockApi.signIn('dana', 'secret');
    renderPage('/scan?view=join');
    const wallet = await screen.findByTestId('wallet-sheet');
    expect(await within(wallet).findByText('Show this at the register.')).toBeInTheDocument();
  });

  it('ecothrift.us/join after scanning without signing in: Join, and "Scan without signing in" goes back to scanning', async () => {
    const user = userEvent.setup();
    await mockApi.continueAsGuest();
    renderPage('/scan?view=join');
    expect(await screen.findByRole('heading', { name: 'Join Thrift+' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Scan without signing in' }));
    expect(await screen.findByTestId('see-trip')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/);
  });

  it('"Staff sign in" opens the password form, and Back returns to the email link', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Staff sign in' }));
    expect(await screen.findByLabelText('Email or username')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Staff sign in' })).toBeInTheDocument();  // APP 10-15: customers have no password
    expect(screen.getByText('Your Dash email and password.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Email me a link' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('opens the password form straight from Coming soon (staff testing while Thrift+ is off)', async () => {
    const api = await import('../../../api/thriftPlusScanner.api');
    vi.mocked(api.isOpen).mockResolvedValueOnce(false);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Staff sign in' }));
    expect(await screen.findByLabelText('Email or username')).toBeInTheDocument();
  });
});
