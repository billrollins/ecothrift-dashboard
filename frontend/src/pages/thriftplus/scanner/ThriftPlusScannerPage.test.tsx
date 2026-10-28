import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
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
    getMe: vi.fn(async () => ({
      banked: '10.25', credit: '8.56', can_change: true, people: [], money: [],
      rewards: [{ amount: '10.25', earned_on: '2026-10-02', use_by: '2026-11-01', past_due: false }],
    })),
    removePerson: vi.fn(),
    setUpLogin: vi.fn(),
    isOpen: vi.fn(async () => true),
    fetchTestTags: vi.fn(async () => []),
    // The mock's own look-up; a test stages an answer the mock has no item for (a tag not found).
    lookupTag: vi.fn((sku: string) => mock.lookupTag(sku)),
    // The Member QR's code; a member who joined online isn't ready until a register finishes them (J2, APP D9).
    getMyCard: vi.fn(async () => {
      const s = await mock.getSession();
      const member = s.status === 'member' ? s.member : null;
      return { code: '402155831907', display: '4021 5583 1907', qr: 'TP402155831907', first_name: member?.first_name ?? 'Dana', ready: member?.ready !== false };
    }),
    setPreviewCode: vi.fn(),
    // Join v2: the mock's own, watched.
    sendCode: vi.fn((contact: string, first?: string, last?: string) => mock.sendCode(contact, first, last)),
    checkCode: vi.fn((contact: string, code: string) => mock.checkCode(contact, code)),
    signInWithGoogle: vi.fn((credential: string) => mock.signInWithGoogle(credential)),
  };
});

// jsdom can't decode a photo: the selfie goes as taken.
vi.mock('../../../services/receiving/receivingClient', () => ({
  compressImageToJpeg: vi.fn(async (f: Blob) => f),
}));

// jsdom has no camera or WebAssembly decoder; the page falls back to typing a tag.
vi.mock('./useQrCamera', async (orig) => ({
  ...(await orig<typeof import('./useQrCamera')>()),
  loadDetector: () => new Promise(() => undefined),
}));

/** The address the page is on now (`?signin=` comes off it, a join adds `view=qr`). */
function Where() {
  return (
    <>
      <div data-testid="where">{useLocation().search}</div>
      <div data-testid="nav-type">{useNavigationType()}</div>
    </>
  );
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

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** The password form is "Staff sign in" now (owner 2026-10-15, APP D9); the mock takes any login. */
async function signInAsMember(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Staff sign in' }));
  // Filled in one change each: signing in is the way in here, not what is tested.
  fireEvent.change(await screen.findByLabelText('Email or username'), { target: { value: 'dana' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

/**
 * "Send my code" from the sign-in screen. Phone first (owner 2026-10-20): the box is "Mobile number"; an email goes
 * behind "Joined with an email? Use your email" (the box is then "Email or phone").
 */
async function sendMyCode(user: User, contact = 'dana@example.com') {
  if (contact.includes('@')) {
    await user.click(await screen.findByRole('button', { name: 'Joined with an email? Use your email' }));
    await user.type(await screen.findByLabelText('Email or phone'), contact);
  } else {
    await user.type(await screen.findByLabelText('Mobile number'), contact);
  }
  await user.click(screen.getByRole('button', { name: 'Send my code' }));
  return screen.findByTestId('check-code');
}

/** A line on the signature pad. */
function sign() {
  const pad = screen.getByTestId('thrift-signature-pad');
  fireEvent.pointerDown(pad, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(pad, { pointerId: 1, clientX: 60, clientY: 40 });
  fireEvent.pointerUp(pad, { pointerId: 1 });
}

const lastCode = () => thriftPlusMockControls.outbox().at(-1)?.code ?? '';

async function scan(user: User, code: string) {
  const box = await screen.findByLabelText('Tag number');
  fireEvent.change(box, { target: { value: code } });
  await user.type(box, '{Enter}');
}

/** The phone asks for less motion: the ThriftBucks count-ups land at once instead of rolling for frames. */
function reduceMotion() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  window.localStorage.clear();
  thriftPlusMockControls.reset();
  thriftPlusMockControls.setLatency(0);
  vi.clearAllMocks();
  // jsdom has no 2D canvas: a stand-in that takes the signature's drawing calls, and a PNG out.
  const ctx = new Proxy({}, { get: () => vi.fn(), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
    cb(new Blob(['png'], { type: 'image/png' }));
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Thrift+ trip scanner (owner 2026-10-13)', () => {
  it('opens a trip line\'s tag again from This trip, with Remove and Back to trip (owner 2026-10-15, APP D12)', async () => {
    const user = userEvent.setup();
    renderPage();
    await signInAsMember(user);
    await scan(user, 'TP0000001');
    await screen.findByTestId('scan-card');
    await user.click(screen.getByTestId('add'));
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('1'));
    await user.click(screen.getByTestId('trip-summary'));
    const trip = await screen.findByTestId('trip-view');
    expect(trip).toHaveTextContent('Tap an item to see its tag · tap ×1 to change how many · slide left to remove');

    // A tap on the line (not the ×1 chip): the tag screen, "1 in your trip", and the trip's own buttons.
    await user.click(within(trip).getByText('Cordless Drill Kit'));
    const card = await screen.findByTestId('scan-card');
    expect(within(card).getByText('Cordless Drill Kit')).toBeInTheDocument();
    expect(card).toHaveTextContent(/1 in your trip/);
    const actions = screen.getByTestId('actions');
    expect(within(actions).getByTestId('remove-line')).toHaveTextContent('Remove');
    expect(within(actions).getByTestId('back-to-trip')).toHaveTextContent('Back to trip');
    expect(within(actions).queryByTestId('add')).toBeNull();

    // Back to trip, then Escape does the same.
    await user.click(within(actions).getByTestId('back-to-trip'));
    expect(await screen.findByTestId('trip-view')).toBeInTheDocument();
    await user.click(within(screen.getByTestId('trip-view')).getByText('Cordless Drill Kit'));
    await screen.findByTestId('scan-card');
    await user.keyboard('{Escape}');
    expect(await screen.findByTestId('trip-view')).toBeInTheDocument();

    // The ×1 chip still opens − +, not the tag.
    await user.click(within(screen.getByTestId('trip-view')).getByTestId('qty-chip'));
    expect(screen.queryByTestId('scan-card')).toBeNull();

    // Remove takes the whole line out, with Undo, and goes back to the trip.
    await user.click(within(screen.getByTestId('trip-view')).getByText('Cordless Drill Kit'));
    await screen.findByTestId('scan-card');
    await user.click(screen.getByTestId('remove-line'));
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('0'));
    expect(await screen.findByTestId('trip-view')).toBeInTheDocument();
    expect(screen.getByTestId('undo-toast')).toHaveTextContent('Removed Cordless Drill Kit');
  });

  it('says coming soon while Thrift+ is off (owner, 2026-10-07)', async () => {
    const api = await import('../../../api/thriftPlusScanner.api');
    vi.mocked(api.isOpen).mockResolvedValueOnce(false);
    renderPage();
    expect(await screen.findByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByText('Ask at the register.')).toBeInTheDocument();
  });

  it('scans a tag, adds it from the bottom buttons, and flips to the trip from This trip', async () => {
    reduceMotion();
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

    // Top right on every screen, two buttons in one pill (owner 2026-10-15, APP D11): the balance and the QR.
    const balance = screen.getByTestId('wallet-pill');
    expect(balance).toHaveAccessibleName(/^Your ThriftBucks: .+\. See your balance$/);
    expect(balance).toHaveTextContent('ThriftBucks');
    const qr = screen.getByTestId('qr-pill');
    expect(qr).toHaveAccessibleName('Member QR: show it at the register');
    expect(screen.queryByTestId('my-card-button')).not.toBeInTheDocument();
    await user.click(qr);
    const wallet = await screen.findByTestId('wallet-screen');
    expect(screen.getByTestId('where')).toHaveTextContent('?view=qr');
    // My card (owner 2026-10-14): the QR to show at the register, its code to type, and the card's B12 line.
    expect(await within(wallet).findByTestId('my-card-code')).toHaveTextContent('4021 5583 1907');
    await waitFor(() => expect(within(wallet).getByTestId('my-card-qr').querySelector('svg')).not.toBeNull());
    expect(within(wallet).getByTestId('my-card')).toHaveTextContent('Show this at the register.');
    expect(within(wallet).getByTestId('my-card')).toHaveTextContent('ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value.');
    // The QR screen holds the QR and nothing else (D11).
    expect(within(wallet).queryByTestId('wallet-row')).toBeNull();
    expect(within(wallet).queryByRole('button', { name: 'Sign out' })).toBeNull();

    // The balance: credit and ThriftBucks in the order used, and the B12 line (Sign out is in Account).
    await user.click(screen.getByTestId('wallet-pill'));
    const sheet = await screen.findByTestId('balance-screen');
    expect(screen.queryByTestId('wallet-screen')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('?view=bucks');
    const rows = await within(sheet).findAllByTestId('wallet-row');
    expect(rows[0]).toHaveTextContent('Thrift+ credit');
    expect(rows[0]).toHaveTextContent('$8.56');
    expect(rows[1]).toHaveTextContent('use by Nov 1');
    expect(sheet).toHaveTextContent('ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value.');
    expect(within(sheet).queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('ecothrift.us/qr signs in, then opens the My QR tab, with the bar under it; on iPhone Safari the home-screen banner is on Scan', async () => {
    // Owner 2026-10-14 (APP D5 and D6). /qr redirects to /scan?view=qr (and the old /card too).
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI);
    try {
      const user = userEvent.setup();
      renderPage('/scan?view=qr');
      await signInAsMember(user);
      const wallet = await screen.findByTestId('wallet-screen');
      expect(within(wallet).getByRole('heading', { name: 'Member QR' })).toBeInTheDocument();
      expect(await within(wallet).findByTestId('my-card-code')).toHaveTextContent('4021 5583 1907');
      expect(screen.getByTestId('member-tab-qr')).toHaveClass('Mui-selected');
      expect(document.head.querySelector('link[rel="manifest"]')).toHaveAttribute('href', '/scan/manifest.webmanifest');
      // The banner is on Scan (not on My QR); Show me opens the three picture steps.
      expect(screen.queryByTestId('home-banner')).toBeNull();
      await user.click(screen.getByTestId('member-tab-scan'));
      const banner = await screen.findByTestId('home-banner');
      expect(banner).toHaveTextContent('Put Thrift+ on your home screen');
      expect(banner).toHaveTextContent('It stays signed in and opens faster.');
      await user.click(within(banner).getByTestId('home-go'));
      const how = await screen.findByTestId('home-steps');
      expect(within(how).getByTestId('home-step-1')).toHaveTextContent('Tap Share at the bottom of Safari.');
      expect(within(how).getByTestId('home-step-2')).toHaveTextContent('Add to Home Screen');
      expect(within(how).getByTestId('home-step-3')).toHaveTextContent('Tap Add at the top right.');
      await user.click(within(how).getByTestId('home-steps-done'));
      await waitFor(() => expect(screen.queryByTestId('home-steps')).toBeNull());
      // Not now hides the banner; Account still has the card.
      await user.click(screen.getByTestId('home-dismiss'));
      expect(screen.queryByTestId('home-banner')).toBeNull();
      await user.click(screen.getByTestId('member-tab-account'));
      expect(await screen.findByTestId('home-card')).toHaveTextContent('Put Thrift+ on your home screen');
    } finally {
      ua.mockRestore();
    }
  });

  it('shows no home-screen banner or card where a phone cannot add it (a computer)', async () => {
    const user = userEvent.setup();
    renderPage('/scan?view=card');
    await signInAsMember(user);
    const wallet = await screen.findByTestId('wallet-screen');
    expect(await within(wallet).findByTestId('my-card-code')).toBeInTheDocument();
    expect(screen.queryByTestId('home-banner')).toBeNull();
    await user.click(screen.getByTestId('member-tab-scan'));
    expect(await screen.findByLabelText('Tag number')).toBeInTheDocument();
    expect(screen.queryByTestId('home-banner')).toBeNull();
    await user.click(screen.getByTestId('member-tab-account'));
    expect(await screen.findByTestId('account-page')).toBeInTheDocument();
    expect(screen.queryByTestId('home-card')).toBeNull();
  });

  it('shows a clear miss for a code that is not a price tag, and helps when the camera does not work', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Scan without signing in' }));
    await scan(user, 'nope!');
    // A card in the middle now, never a toast (APP D14a).
    expect(await screen.findByTestId('answer-not-ours')).toHaveTextContent("That's not our price tag");
    expect(screen.queryByText("That code isn't a price tag")).toBeNull();
    await user.click(screen.getByTestId('scan-again'));
    await user.click(await screen.findByRole('button', { name: 'Camera not working?' }));
    const help = await screen.findByRole('dialog', { name: 'Camera not working?' });
    await user.click(within(help).getByRole('tab', { name: 'Android' }));
    expect(within(help).getByText(/Tap Permissions, then turn Camera on/)).toBeInTheDocument();
  });
});

describe('Every code gets an answer (owner 2026-10-15, APP D14 and D15)', () => {
  const onlyScanAgain = () => {
    const actions = screen.getByTestId('actions');
    expect(within(actions).getAllByRole('button')).toHaveLength(1);
    expect(within(actions).getByTestId('scan-again')).toHaveTextContent('Scan again');
    expect(within(actions).queryByTestId('pass')).toBeNull();
    expect(within(actions).queryByTestId('add')).toBeNull();
  };

  it('a product barcode: our green tag, "That\'s not our price tag", and Scan again', async () => {
    const api = await import('../../../api/thriftPlusScanner.api');
    const user = userEvent.setup();
    renderPage();
    await signInAsMember(user);
    vi.mocked(api.lookupTag).mockClear();
    await scan(user, '0123456789012');
    const card = await screen.findByTestId('scan-card');
    const answer = within(card).getByTestId('answer-not-ours');
    expect(within(answer).getByRole('heading', { name: "That's not our price tag" })).toBeInTheDocument();
    expect(answer).toHaveTextContent('Look for our green tag and scan the QR code on it.');
    expect(within(answer).getByRole('img', { name: 'Our green price tag, with its QR code' })).toHaveAttribute('src', expect.stringContaining('our-green-tag'));
    expect(api.lookupTag).not.toHaveBeenCalled(); // a product barcode is never looked up
    onlyScanAgain();
    await user.click(screen.getByTestId('scan-again'));
    await waitFor(() => expect(screen.queryByTestId('scan-card')).toBeNull());
    expect(screen.getByTestId('see-trip')).toBeInTheDocument();
  });

  it('our code, not found: "We can\'t find that item", sold as marked, no ThriftBucks, AS IS', async () => {
    const api = await import('../../../api/thriftPlusScanner.api');
    vi.mocked(api.lookupTag).mockResolvedValueOnce({ status: 'not_found', sku: 'ITM0051377' });
    const user = userEvent.setup();
    renderPage();
    await signInAsMember(user);
    await scan(user, 'ITM0051377');
    const answer = await screen.findByTestId('answer-not-found');
    expect(api.lookupTag).toHaveBeenLastCalledWith('ITM0051377');
    expect(within(answer).getByRole('heading', { name: "We can't find that item" })).toBeInTheDocument();
    // "AS IS" and "3-day" never break across lines.
    expect(within(answer).getByText("It's priced as marked, with no ThriftBucks. Sold AS IS, so no 3‑day returns.", { normalizer: (s) => s }))
      .toBeInTheDocument();
    expect(within(answer).getByTestId('badge-as-is')).toHaveTextContent('AS IS · no returns');
    expect(within(answer).getByTestId('no-thriftbucks')).toHaveTextContent('No ThriftBucks on this item');
    expect(within(answer).getByTestId('answer-code')).toHaveTextContent('ITM0051377');
    onlyScanAgain();
    // The AS IS badge works as built.
    await user.click(within(answer).getByTestId('badge-as-is'));
    expect(await screen.findByTestId('info-sheet')).toHaveTextContent("This item can't be returned.");
    await user.click(within(screen.getByTestId('info-sheet')).getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}'); // Escape is Scan again
    await waitFor(() => expect(screen.queryByTestId('scan-card')).toBeNull());
  });

  it('a short code we have no item for is not our tag; one we have is its tag', async () => {
    const api = await import('../../../api/thriftPlusScanner.api');
    vi.mocked(api.lookupTag).mockResolvedValueOnce({ status: 'not_found', sku: 'ABC123' });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Scan without signing in' }));
    await scan(user, 'abc123');
    expect(await screen.findByTestId('answer-not-ours')).toBeInTheDocument();
    await user.click(screen.getByTestId('scan-again'));
    await scan(user, 'TP0000001');
    expect(await screen.findByText('Cordless Drill Kit')).toBeInTheDocument();
    expect(screen.getByTestId('pass')).toBeInTheDocument();
  });

  it('one of our links: "That QR code is a link", Open link in a new tab, and Scan again', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Scan without signing in' }));
    await scan(user, 'https://ecothrift.us/terms');
    const answer = await screen.findByTestId('answer-link');
    expect(within(answer).getByRole('heading', { name: 'That QR code is a link' })).toBeInTheDocument();
    expect(answer).toHaveTextContent('It opens ecothrift.us/terms.To see a price, scan the QR code on our green tag.');
    expect(within(answer).getByText('ecothrift.us/terms').tagName).toBe('B');
    const actions = screen.getByTestId('actions');
    const open = within(actions).getByTestId('open-link');
    expect(open).toHaveTextContent('Open link');
    expect(open).toHaveAttribute('href', 'https://ecothrift.us/terms');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(actions).getByTestId('scan-again')).toHaveTextContent('Scan again');
    await user.click(within(actions).getByTestId('scan-again'));
    await waitFor(() => expect(screen.queryByTestId('answer-link')).toBeNull());

    // A link to any other site is not our tag, with no button to open it.
    await scan(user, 'https://example.com/menu');
    expect(await screen.findByTestId('answer-not-ours')).toBeInTheDocument();
    expect(screen.queryByTestId('open-link')).toBeNull();
  });
});

describe('Sign in and join: Google, an email or a phone, and a code (Join v2, owner 2026-10-19)', () => {
  afterEach(() => {
    delete window.google;
  });

  it('phone first; an email still signs in behind "Joined with an email?", and the code signs in on its sixth digit', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('No password needed.')).toBeInTheDocument();
    // Phone or Google (owner 2026-10-20), with the text-message line Twilio's toll-free review was given.
    const box = await screen.findByLabelText('Mobile number');
    expect(box).toHaveAttribute('inputmode', 'tel');
    expect(box).toHaveAttribute('autocomplete', 'tel');
    expect(screen.getByTestId('contact-hint')).toHaveTextContent("We'll text you a 6-digit code.");
    expect(screen.getByTestId('text-consent')).toHaveTextContent(
      'A phone number gets one text with your code each time you ask. Msg & data rates may apply. Reply STOP to cancel, HELP for help. Terms · Privacy',
    );
    // An email in the phone box is caught, and nothing is sent.
    await user.type(box, 'dana@example.com');
    await user.click(screen.getByRole('button', { name: 'Send my code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your mobile number, or use Continue with Google.');
    expect(thriftPlusMockControls.outbox()).toHaveLength(0);
    await user.clear(box);
    expect(screen.queryByTestId('google-sign-in')).toBeNull(); // no Google client id on this server
    expect(screen.getByRole('button', { name: 'Join Thrift+' })).toBeInTheDocument();
    expect(screen.getByText('Free to join. Nothing owed.')).toBeInTheDocument();

    const check = await sendMyCode(user, 'Dana@Example.com');
    expect(within(check).getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(within(check).getByTestId('sent-line')).toHaveTextContent(
      'Enter the 6-digit code we sent to D•••@Example.com. Or tap the link in the email on this phone.',
    );
    expect(thriftPlusMockControls.outbox()).toMatchObject([{ to: 'dana@example.com', channel: 'email', purpose: 'sign_in' }]);

    const code = within(check).getByLabelText('6-digit code');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(within(check).getByRole('button', { name: 'Sign in' })).toBeDisabled();
    // Digits only; the sixth signs in by itself (no "Sign in" tap).
    await user.type(code, `${lastCode().slice(0, 3)} -${lastCode().slice(3)}`);
    expect(await screen.findByTestId('see-trip')).toBeInTheDocument();
    expect(screen.queryByTestId('wallet-screen')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/);
  });

  it('a phone number in the box gets a text (code/send/), and its code signs in (code/check/)', async () => {
    const api = await import('../../../api/thriftPlusScanner.api');
    const send = vi.mocked(api.sendCode);
    const checkCode = vi.mocked(api.checkCode);
    const user = userEvent.setup();
    renderPage();
    const check = await sendMyCode(user, '(402) 555-0123');
    expect(send).toHaveBeenCalledWith('(402) 555-0123', '', '');
    expect(thriftPlusMockControls.outbox()).toMatchObject([{ to: '+14025550123', channel: 'sms', purpose: 'sign_in' }]);
    expect(within(check).getByRole('heading', { name: 'Check your texts' })).toBeInTheDocument();
    expect(within(check).getByTestId('sent-line')).toHaveTextContent('Enter the 6-digit code we sent to (•••) •••-0123.');
    expect(within(check).getByTestId('sent-line')).not.toHaveTextContent('link');
    expect(within(check).getByTestId('resend')).toHaveTextContent("Didn't get it? Send again in 0:30");
    await user.type(within(check).getByLabelText('6-digit code'), lastCode());
    expect(await screen.findByTestId('see-trip')).toBeInTheDocument();
    expect(checkCode).toHaveBeenCalledWith('(402) 555-0123', lastCode());
  });

  it('with texts off the box is just "Email", and something that is neither is caught before sending', async () => {
    thriftPlusMockControls.setSignInOptions({ phone: false });
    const user = userEvent.setup();
    renderPage();
    const box = await screen.findByLabelText('Email');
    expect(box).toHaveAttribute('inputmode', 'email');
    expect(box).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByTestId('contact-hint')).toHaveTextContent("We'll send a 6-digit code to your email.");
    expect(screen.queryByLabelText('Email or phone')).toBeNull();
    await user.type(box, 'dana@example'); // the browser takes it as an email; it has no domain ending
    await user.click(screen.getByRole('button', { name: 'Send my code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your email address.');
    expect(thriftPlusMockControls.outbox()).toHaveLength(0);
  });

  it('one tap sends once: "Change" and "Send my code" again for the same email go back to the code, not a second send', async () => {
    const user = userEvent.setup();
    renderPage();
    const check = await sendMyCode(user);
    const wrong = lastCode() === '000000' ? '111111' : '000000';
    await user.type(within(check).getByLabelText('6-digit code'), wrong);
    expect(await within(check).findByRole('alert')).toHaveTextContent("That code didn't work. Check it and try again.");
    expect(screen.queryByTestId('see-trip')).toBeNull();

    await user.click(within(check).getByRole('button', { name: 'Change' }));
    expect(await screen.findByLabelText('Email or phone')).toHaveValue('dana@example.com'); // still behind the email link
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send my code' }));
    expect(await screen.findByTestId('check-code')).toBeInTheDocument();
    expect(thriftPlusMockControls.outbox()).toHaveLength(1);
  });

  it('counts down to "Send it again", and after the third send says to ask at a register', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
      renderPage();
      await sendMyCode(user);
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

  it('Join: the two steps, a name and a phone; the code opens Finish joining (selfie, then sign, then done)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Join Thrift+' }));
    const form = await screen.findByTestId('join-form');
    expect(within(form).getByRole('heading', { name: 'Join Thrift+' })).toBeInTheDocument();
    expect(form).toHaveTextContent('Free. Two quick steps.');
    expect(await within(form).findByTestId('join-step-now')).toHaveTextContent('1Now: your name, then your phone.');
    expect(within(form).getByTestId('join-step-store')).toHaveTextContent("2At the store: show your QR and your photo ID. That's it.");
    expect(form).toHaveTextContent("That's all it takes to collect ThriftBucks and get 3-day returns.");
    expect(form).toHaveTextContent('Thrift+ terms: ecothrift.us/terms');
    expect(within(form).getByTestId('text-consent')).toBeInTheDocument();
    expect(within(form).getByTestId('join-terms')).toHaveAttribute('href', 'https://ecothrift.us/terms');
    // Owner 2026-10-16: first and last name, both required.
    expect(within(form).getByLabelText('First name')).toHaveAttribute('autocomplete', 'given-name');
    expect(within(form).getByLabelText('Last name')).toHaveAttribute('autocomplete', 'family-name');
    expect(within(form).getByLabelText('First name')).toBeRequired();
    expect(within(form).getByLabelText('Last name')).toBeRequired();
    expect(screen.queryByRole('button', { name: 'Join Thrift+' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Scan without signing in' })).toBeInTheDocument();

    await user.type(within(form).getByLabelText('First name'), 'Robin');
    await user.type(within(form).getByLabelText('Last name'), 'Lee');
    expect(within(form).queryByLabelText('Email or phone')).toBeNull(); // joining is phone or Google (owner 2026-10-20)
    await user.type(within(form).getByLabelText('Mobile number'), '(402) 555-0188');
    await user.click(within(form).getByRole('button', { name: 'Send my code' }));
    const check = await screen.findByTestId('check-code');
    expect(within(check).getByTestId('sent-line')).toHaveTextContent('Enter the 6-digit code we sent to (•••) •••-0188.');
    expect(thriftPlusMockControls.outbox()).toMatchObject([{ to: '+14025550188', channel: 'sms', purpose: 'join' }]);
    await user.type(within(check).getByLabelText('6-digit code'), lastCode());

    // Finish joining: step 1, the selfie with the front camera.
    const finish = await screen.findByTestId('finish-joining');
    expect(screen.getByTestId('where')).toHaveTextContent('?view=finish');
    expect(screen.queryByTestId('member-bar')).toBeNull(); // required: no way around it by the bar
    expect(within(finish).getByTestId('finish-progress')).toHaveTextContent('Step 1 of 2');
    expect(within(finish).getByTestId('finish-intro')).toHaveTextContent('Two quick steps: 1. Selfie 2. Sign. Then show your QR at the register.');
    expect(within(finish).getByTestId('selfie-tip')).toHaveTextContent('Fit your face in the oval. No hat or sunglasses.');
    expect(within(finish).queryByRole('button', { name: /skip|later/i })).toBeNull();
    const input = within(finish).getByTestId('selfie-input');
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).toHaveAttribute('capture', 'user');
    expect(within(finish).getByRole('button', { name: 'Take my selfie' })).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [new File(['jpg'], 'me.jpg', { type: 'image/jpeg' })] } });
    expect(await within(finish).findByRole('button', { name: 'Use this photo' })).toBeInTheDocument();
    expect(within(finish).getByRole('button', { name: 'Retake' })).toBeInTheDocument();
    await user.click(within(finish).getByRole('button', { name: 'Use this photo' }));

    // Step 2: the terms, then the signature.
    expect(await within(finish).findByTestId('finish-sign')).toBeInTheDocument();
    expect(within(finish).getByTestId('finish-progress')).toHaveTextContent('Step 2 of 2');
    expect(within(finish).getByTestId('finish-terms')).toHaveTextContent('All you need to know');
    const signButton = within(finish).getByRole('button', { name: 'Sign' });
    expect(signButton).toBeDisabled();
    sign();
    await waitFor(() => expect(signButton).toBeEnabled());
    await user.click(signButton);

    // Done: the Member QR, with the photo ID at the register.
    const done = await within(finish).findByTestId('finish-done');
    expect(done).toHaveTextContent("You're all set");
    expect(done).toHaveTextContent('Show this QR at the register with your photo ID.');
    expect(thriftPlusMockControls.finished()).toMatchObject([
      { step: 'selfie' },
      { step: 'sign', terms_version: '2026-10-19' },
    ]);
    await user.click(within(done).getByRole('button', { name: 'Done' }));
    const wallet = await screen.findByTestId('wallet-screen');
    expect(screen.getByTestId('where')).toHaveTextContent('?view=qr');
    expect(within(wallet).getByTestId('my-card-line')).toHaveTextContent('Show this QR at the register with your photo ID.');
    expect(within(wallet).queryByRole('button', { name: 'Finish joining' })).toBeNull();
    // Finished: the bar is back, on My QR.
    expect(screen.getByTestId('member-bar')).toBeInTheDocument();
    expect(screen.getByTestId('member-tab-qr')).toHaveClass('Mui-selected');
  });

  it('Finish joining is required: a pending member with steps left always lands on it, no ×, only Sign out (owner 2026-10-20)', async () => {
    await mockApi.sendCode('robin@example.com', 'Robin', 'Lee');
    await mockApi.checkCode('robin@example.com', lastCode());
    const user = userEvent.setup();
    renderPage('/scan?view=qr');
    const finish = await screen.findByTestId('finish-joining');
    expect(within(finish).getByTestId('finish-progress')).toHaveTextContent('Step 1 of 2');
    expect(screen.getByTestId('where')).toHaveTextContent('?view=finish');
    expect(within(finish).queryByRole('button', { name: 'Close' })).toBeNull();
    expect(within(finish).queryByRole('button', { name: /skip|later/i })).toBeNull();
    expect(screen.queryByTestId('wallet-screen')).toBeNull();
    expect(screen.queryByTestId('member-bar')).toBeNull(); // no bar while Finish joining is up
    await user.click(within(finish).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.queryByTestId('finish-joining')).toBeNull());
  });

  it('the selfie camera opens in the app with an oval to fit the face in (owner 2026-10-19)', async () => {
    const stop = vi.fn();
    const fakeStream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream);
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    try {
      const user = userEvent.setup();
      await mockApi.joinThriftPlus('Robin', 'Lee', 'robin@example.com');
      const { token } = thriftPlusMockControls.outbox()[0];
      renderPage(`/scan?signin=${token}`);
      const finish = await screen.findByTestId('finish-joining');
      await user.click(within(finish).getByRole('button', { name: 'Take my selfie' }));
      expect(await within(finish).findByTestId('selfie-camera')).toBeInTheDocument();
      expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: { ideal: 'user' } }) }));
      expect(await within(finish).findByText('Fit your face in the oval')).toBeInTheDocument();
      expect(within(finish).getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
    } finally {
      playSpy.mockRestore();
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    }
  });

  it('a photo this phone cannot read is not sent: it asks for the selfie again', async () => {
    const shrink = await import('../../../services/receiving/receivingClient');
    vi.mocked(shrink.compressImageToJpeg).mockRejectedValueOnce(new Error('decode_failed'));
    await mockApi.sendCode('robin@example.com', 'Robin', 'Lee');
    await mockApi.checkCode('robin@example.com', lastCode());
    renderPage('/scan?view=finish');
    const finish = await screen.findByTestId('finish-joining');
    fireEvent.change(within(finish).getByTestId('selfie-input'), { target: { files: [new File(['heic'], 'me.heic', { type: 'image/heic' })] } });
    expect(await within(finish).findByRole('alert')).toHaveTextContent("That photo didn't work. Take your selfie again.");
    expect(within(finish).getByRole('button', { name: 'Take my selfie' })).toBeInTheDocument();
    expect(thriftPlusMockControls.finished()).toEqual([]);
  });

  it('only the steps left are asked: a selfie on file goes straight to "Step 1 of 1", the signature', async () => {
    await mockApi.sendCode('robin@example.com', 'Robin', 'Lee');
    await mockApi.checkCode('robin@example.com', lastCode());
    await mockApi.uploadSelfie(new Blob(['jpg'], { type: 'image/jpeg' }));
    renderPage('/scan?view=finish');
    const finish = await screen.findByTestId('finish-joining');
    expect(within(finish).getByTestId('finish-progress')).toHaveTextContent('Step 1 of 1');
    expect(within(finish).getByTestId('finish-sign')).toBeInTheDocument();
    expect(within(finish).queryByTestId('finish-intro')).toBeNull();
  });

  it('shows "Continue with Google" only when the server has a Google client id', async () => {
    thriftPlusMockControls.setSignInOptions({ google_client_id: 'test-client.apps.googleusercontent.com' });
    const first = renderPage();
    // Google's script can't load in a test: the same pill waits in its place.
    const google = await screen.findByTestId('google-sign-in');
    expect(google).toHaveTextContent('Continue with Google');
    expect(google).toHaveTextContent('or');
    expect(document.head.querySelector('script[src="https://accounts.google.com/gsi/client"]')).not.toBeNull();
    first.unmount();

    thriftPlusMockControls.setSignInOptions({ google_client_id: null });
    renderPage('/scan?view=join');
    expect(await screen.findByTestId('join-form')).toBeInTheDocument();
    await screen.findByLabelText('Mobile number');
    expect(screen.queryByTestId('google-sign-in')).toBeNull();
    expect(screen.queryByText('Continue with Google')).toBeNull();
  });

  it("Google's button signs a new person in (google/) and opens Finish joining", async () => {
    thriftPlusMockControls.setSignInOptions({ google_client_id: 'test-client.apps.googleusercontent.com' });
    const gsi = { initialize: vi.fn(), renderButton: vi.fn() };
    window.google = { accounts: { id: gsi } };
    const api = await import('../../../api/thriftPlusScanner.api');
    const google = vi.mocked(api.signInWithGoogle);
    renderPage('/scan?view=join');
    await waitFor(() => expect(gsi.renderButton).toHaveBeenCalled());
    const options = gsi.initialize.mock.calls[0][0];
    expect(options).toMatchObject({ client_id: 'test-client.apps.googleusercontent.com', context: 'signup' });
    expect(gsi.renderButton.mock.calls[0][1]).toMatchObject({ text: 'continue_with', shape: 'pill' });
    const credential = thriftPlusMockControls.googleCredential('robin@example.com', 'Robin', 'Lee');
    await act(async () => {
      options.callback({ credential });
    });
    expect(google).toHaveBeenCalledWith(credential);
    const finish = await screen.findByTestId('finish-joining');
    expect(within(finish).getByTestId('finish-progress')).toHaveTextContent('Step 1 of 2');
  });

  // Phase 3 (owner 2026-10-20): the phone is required. A member with none sees only "Add your mobile number".
  describe('Add your mobile number (needs_phone)', () => {
    beforeEach(() => thriftPlusMockControls.setRequirePhone(true));

    it('a Google joiner adds a phone with a checked code first, then goes on to Finish joining', async () => {
      const user = userEvent.setup();
      thriftPlusMockControls.setSignInOptions({ google_client_id: 'test-client.apps.googleusercontent.com' });
      const gsi = { initialize: vi.fn(), renderButton: vi.fn() };
      window.google = { accounts: { id: gsi } };
      renderPage('/scan?view=join');
      await waitFor(() => expect(gsi.renderButton).toHaveBeenCalled());
      await act(async () => {
        gsi.initialize.mock.calls[0][0].callback({ credential: thriftPlusMockControls.googleCredential('robin@example.com', 'Robin', 'Lee') });
      });
      const add = await screen.findByTestId('add-phone');
      expect(add).toHaveTextContent('Add your mobile number');
      expect(add).toHaveTextContent('Robin, we need a mobile number on your Thrift+ account.');
      // Required: no close, no skip; Sign out is the only way out. The consent line is the submitted one, unchanged.
      expect(within(add).queryByRole('button', { name: /close|skip|later|not now/i })).toBeNull();
      expect(within(add).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
      expect(within(add).getByTestId('text-consent')).toHaveTextContent(
        'A phone number gets one text with your code each time you ask. Msg & data rates may apply. Reply STOP to cancel, HELP for help.',
      );
      // A number that is not a US mobile number is refused before any text.
      await user.type(within(add).getByLabelText('Mobile number'), '123');
      await user.click(within(add).getByRole('button', { name: 'Send my code' }));
      expect(await within(add).findByRole('alert')).toHaveTextContent('Enter a US mobile number.');
      expect(thriftPlusMockControls.outbox()).toHaveLength(0);
      await user.clear(within(add).getByLabelText('Mobile number'));
      await user.type(within(add).getByLabelText('Mobile number'), '(402) 555-0177');
      await user.click(within(add).getByRole('button', { name: 'Send my code' }));
      const check = await within(add).findByTestId('check-code');
      expect(within(check).getByTestId('sent-line')).toHaveTextContent('Enter the 6-digit code we sent to (•••) •••-0177.');
      expect(thriftPlusMockControls.outbox().at(-1)).toMatchObject({ to: '+14025550177', channel: 'sms' });
      // A wrong code says so and keeps the screen; nothing is saved.
      await user.type(within(check).getByLabelText('6-digit code'), '000000');
      expect(await within(check).findByRole('alert')).toHaveTextContent("That code didn't work. Check it and try again.");
      expect(screen.getByTestId('add-phone')).toBeInTheDocument();
      await user.clear(within(check).getByLabelText('6-digit code'));
      await user.type(within(check).getByLabelText('6-digit code'), lastCode());
      await waitFor(() => expect(screen.queryByTestId('add-phone')).toBeNull());
      // Then the steps that were waiting: Finish joining.
      const finish = await screen.findByTestId('finish-joining');
      expect(within(finish).getByTestId('finish-progress')).toHaveTextContent('Step 1 of 2');
    });

    it('an email member with no phone is asked too, and lands on the scanner once it is saved', async () => {
      const user = userEvent.setup();
      await mockApi.requestSignInEmail('dana@example.com');
      renderPage(`/scan?signin=${thriftPlusMockControls.outbox()[0].token}`);
      const add = await screen.findByTestId('add-phone');
      await user.type(within(add).getByLabelText('Mobile number'), '402-555-0166');
      await user.click(within(add).getByRole('button', { name: 'Send my code' }));
      const check = await within(add).findByTestId('check-code');
      expect(within(check).getByRole('button', { name: 'Save my number' })).toBeDisabled();
      await user.type(within(check).getByLabelText('6-digit code'), lastCode());
      await waitFor(() => expect(screen.queryByTestId('add-phone')).toBeNull());
      expect(screen.getByTestId('see-trip')).toBeInTheDocument();
      expect(screen.getByTestId('where')).toHaveTextContent(/^$/);
    });

    it('Sign out leaves the screen', async () => {
      const user = userEvent.setup();
      await mockApi.requestSignInEmail('dana@example.com');
      renderPage(`/scan?signin=${thriftPlusMockControls.outbox()[0].token}`);
      const add = await screen.findByTestId('add-phone');
      await user.click(within(add).getByRole('button', { name: 'Sign out' }));
      expect(await screen.findByRole('button', { name: 'Send my code' })).toBeInTheDocument();
      expect(screen.queryByTestId('add-phone')).toBeNull();
    });

    it('a member who joined with a phone is never asked', async () => {
      const user = userEvent.setup();
      renderPage('/scan?view=join');
      await user.type(await screen.findByLabelText('First name'), 'Pat');
      await user.type(screen.getByLabelText('Last name'), 'Lee');
      await user.type(screen.getByLabelText('Mobile number'), '402-555-0155');
      await user.click(screen.getByRole('button', { name: 'Send my code' }));
      await user.type(await screen.findByLabelText('6-digit code'), lastCode());
      expect(await screen.findByTestId('finish-joining')).toBeInTheDocument();
      expect(screen.queryByTestId('add-phone')).toBeNull();
    });
  });

  it('the email link (?signin=) signs in to the scanner and comes off the address', async () => {
    await mockApi.requestSignInEmail('dana@example.com');
    const { token } = thriftPlusMockControls.outbox()[0];
    renderPage(`/scan?signin=${token}`);
    expect(await screen.findByTestId('see-trip')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/);
    expect(screen.queryByTestId('wallet-screen')).toBeNull();
  });

  it("a join's link opens Finish joining (view=finish)", async () => {
    await mockApi.joinThriftPlus('Robin', 'Lee', 'robin@example.com');
    const { token } = thriftPlusMockControls.outbox()[0];
    renderPage(`/scan?signin=${token}`);
    expect(await screen.findByTestId('finish-joining')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('?view=finish');
  });

  it('a used link says so on the sign-in screen', async () => {
    await mockApi.requestSignInEmail('dana@example.com');
    const { token } = thriftPlusMockControls.outbox()[0];
    await mockApi.signInWithLink(token);
    await mockApi.signOut();
    renderPage(`/scan?signin=${token}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('That link has already been used. Send a new one.');
    expect(screen.getByRole('button', { name: 'Send my code' })).toBeInTheDocument();
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
    const wallet = await screen.findByTestId('wallet-screen');
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

  it('"Staff sign in" opens the password form, and Back returns to the customer sign-in', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Staff sign in' }));
    expect(await screen.findByLabelText('Email or username')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Staff sign in' })).toBeInTheDocument();  // APP 10-15: customers have no password
    expect(screen.getByText('Your Dash email and password.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull(); // a staff password is reset in Dash
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Send my code' })).toBeInTheDocument();
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

describe('Member bottom bar and Account (owner 2026-10-20)', () => {
  it('has Scan, Bucks, My QR and Account; a tap switches in place and the address is replaced, never stacked', async () => {
    await mockApi.signIn('dana', 'secret');
    const user = userEvent.setup();
    renderPage();
    const bar = await screen.findByTestId('member-bar');
    expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Scan', 'Bucks', 'My QR', 'Account']);
    expect(screen.getByTestId('member-tab-scan')).toHaveClass('Mui-selected');
    expect(await screen.findByLabelText('Tag number')).toBeInTheDocument();

    const steps: Array<[string, string, string]> = [
      ['bucks', 'balance-screen', '?view=bucks'],
      ['qr', 'wallet-screen', '?view=qr'],
      ['account', 'account-page', '?view=account'],
    ];
    for (const [tab, screenId, search] of steps) {
      await user.click(screen.getByTestId(`member-tab-${tab}`));
      expect(await screen.findByTestId(screenId)).toBeInTheDocument();
      expect(screen.getByTestId(`member-tab-${tab}`)).toHaveClass('Mui-selected');
      expect(screen.getByTestId('where')).toHaveTextContent(search);
      expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE'); // Back never walks the tabs
      expect(screen.getByTestId('member-bar')).toBeInTheDocument(); // the screen sits above the bar
    }
    // Only one screen at a time; Scan brings the scanner back and clears the address.
    expect(screen.queryByTestId('balance-screen')).toBeNull();
    expect(screen.queryByTestId('wallet-screen')).toBeNull();
    await user.click(screen.getByTestId('member-tab-scan'));
    expect(await screen.findByLabelText('Tag number')).toBeInTheDocument();
    expect(screen.queryByTestId('account-page')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/);
  });

  it('the header pill opens the same tabs, and a tab leaves an open sheet behind', async () => {
    await mockApi.signIn('dana', 'secret');
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('about-thriftplus'));
    expect(await screen.findByTestId('thriftplus-sheet')).toBeInTheDocument();
    await user.click(screen.getByTestId('member-tab-bucks'));
    expect(await screen.findByTestId('balance-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('thriftplus-sheet')).toBeNull();
    await user.click(screen.getByTestId('qr-pill'));
    expect(await screen.findByTestId('wallet-screen')).toBeInTheDocument();
  });

  it('is not there signed out or for a non-member who scans without signing in', async () => {
    const out = renderPage();
    expect(await screen.findByRole('button', { name: 'Staff sign in' })).toBeInTheDocument();
    expect(screen.queryByTestId('member-bar')).toBeNull();
    out.unmount();

    await mockApi.continueAsGuest();
    renderPage();
    expect(await screen.findByTestId('see-trip')).toBeInTheDocument();
    expect(screen.queryByTestId('member-bar')).toBeNull();
    expect(screen.getByTestId('trip-summary')).toBeInTheDocument();
  });

  it('Account: your name, phone and photo with no retake ("Ask at the register"), and Sign out', async () => {
    const api = await import('../../../api/thriftPlusScanner.api');
    const original = vi.mocked(api.getMe).getMockImplementation();
    vi.mocked(api.getMe).mockResolvedValue({
      banked: '10.25', credit: '8.56', can_change: true, money: [], people: [],
      you: { name: 'Dana Rivera', phone: '4025550188', photo_url: 'https://photos.example/dana.jpg' },
    });
    try {
      await mockApi.signIn('dana', 'secret');
      const user = userEvent.setup();
      renderPage('/scan?view=account');
      const page = await screen.findByTestId('account-page');
      expect(screen.getByTestId('member-tab-account')).toHaveClass('Mui-selected');
      expect(within(page).getByRole('heading', { name: 'Account' })).toBeInTheDocument();
      expect(await within(page).findByTestId('account-name')).toHaveTextContent('Dana Rivera');
      expect(within(page).getByTestId('account-phone')).toHaveTextContent('(402) 555-0188');
      expect(within(page).getByTestId('account-photo')).toHaveAttribute('src', 'https://photos.example/dana.jpg');
      expect(within(page).getByTestId('account-photo-note')).toHaveTextContent('Ask at the register to change your photo.');
      // No retake, no camera, no way to change the photo in the app.
      expect(within(page).queryByRole('button', { name: /retake|photo|selfie/i })).toBeNull();
      expect(within(page).queryByTestId('selfie-input')).toBeNull();
      await user.click(within(page).getByRole('button', { name: 'Sign out' }));
      expect(await screen.findByRole('button', { name: 'Send my code' })).toBeInTheDocument();
      expect(screen.queryByTestId('member-bar')).toBeNull();
    } finally {
      vi.mocked(api.getMe).mockImplementation(original as never);
    }
  });
});

describe('a Thrift+ Perks tag QR link (ECOTHRIFT.US/I/<SKU> lands on /scan?tag=<SKU>, 2026-10-28)', () => {
  const LINK_WAIT = { timeout: 5000 };

  it('signed out: the item as a guest, with Get Thrift+ (to Join), and the SKU off the address', async () => {
    const user = userEvent.setup();
    renderPage('/scan?tag=TP0000001');
    // Waits are generous: the session, then the tag's look-up, can be slow when the whole suite runs at once.
    const card = await screen.findByTestId('scan-card', {}, LINK_WAIT);
    expect(await within(card).findByText('Cordless Drill Kit', {}, LINK_WAIT)).toBeInTheDocument();
    expect(await within(card).findByText('Free to join', {}, LINK_WAIT)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('tag='), LINK_WAIT);
    await user.click(await screen.findByTestId('get-thrift-plus', {}, LINK_WAIT));
    expect(await screen.findByRole('heading', { name: 'Join Thrift+' }, LINK_WAIT)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('?view=join'), LINK_WAIT);
  });

  it('a signed-in member: the item in the scanner, no Get Thrift+', async () => {
    await mockApi.signIn('dana', 'secret');
    renderPage('/scan?tag=TP0000001');
    const card = await screen.findByTestId('scan-card', {}, LINK_WAIT);
    expect(await within(card).findByText('Cordless Drill Kit', {}, LINK_WAIT)).toBeInTheDocument();
    expect(await screen.findByTestId('add', {}, LINK_WAIT)).toBeInTheDocument();
    expect(within(card).queryByText('Free to join')).toBeNull();
    expect(screen.queryByTestId('get-thrift-plus')).toBeNull();
  });

  it('a scanned tag link in the camera box opens that tag (any case, with or without https://)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Scan without signing in' }));
    await scan(user, 'ecothrift.us/i/tp0000002');
    const card = await screen.findByTestId('scan-card', {}, LINK_WAIT);
    expect(await within(card).findByText('KitchenAid stand mixer', {}, LINK_WAIT)).toBeInTheDocument();
    expect(screen.queryByTestId('get-thrift-plus')).toBeNull(); // only on a card the link itself opened
  });
});
