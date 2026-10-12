import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { thriftPlusMockControls } from '../../../api/thriftPlusMock';
import ThriftPlusScannerPage from './ThriftPlusScannerPage';

// The page talks to the real API module; these tests stand the in-memory mock in for the server.
vi.mock('../../../api/thriftPlusScanner.api', async () => ({
  ...(await vi.importActual<typeof import('../../../api/thriftPlusMock')>('../../../api/thriftPlusMock')),
  confirmPasswordReset: vi.fn(),
  getMe: vi.fn(),
  reportCardLost: vi.fn(),
  removePerson: vi.fn(),
  setUpLogin: vi.fn(),
  isOpen: vi.fn(async () => true),
  fetchScannerSettings: vi.fn(async () => ({ priceFirst: true })),
  fetchTestTags: vi.fn(async () => []),
  setPreviewCode: vi.fn(),
}));

// jsdom has no camera or WebAssembly decoder; the page falls back to typing a tag.
vi.mock('./useQrCamera', async (orig) => ({
  ...(await orig<typeof import('./useQrCamera')>()),
  loadDetector: () => new Promise(() => undefined),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/scan']}>
        <ThriftPlusScannerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function signInAsMember(user: User) {
  await user.type(await screen.findByLabelText('Email or username'), 'dana');
  await user.type(screen.getByLabelText('Password'), 'secret');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

async function skipTour(user: User) {
  const tour = await screen.findByRole('dialog', { name: 'How Thrift+ works' });
  await user.click(within(tour).getByRole('button', { name: 'Skip' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'How Thrift+ works' })).not.toBeInTheDocument());
}

beforeEach(() => {
  window.localStorage.clear();
  thriftPlusMockControls.reset();
  thriftPlusMockControls.setLatency(0);
});

describe('Thrift+ price scanner', () => {
  it('says coming soon while Thrift+ is off (owner, 2026-10-07)', async () => {
    const api = await import('../../../api/thriftPlusScanner.api');
    vi.mocked(api.isOpen).mockResolvedValueOnce(false);
    renderPage();
    expect(await screen.findByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByText('Ask at the register.')).toBeInTheDocument();
  });

  it('walks through Scan, Bank, Cart once, then scans, adds, banks and shows the cart', async () => {
    const user = userEvent.setup();
    renderPage();
    await signInAsMember(user);

    // First run: the three-step walkthrough.
    const tour = await screen.findByRole('dialog', { name: 'How Thrift+ works' });
    expect(within(tour).getByText('Scan')).toBeInTheDocument();
    await user.click(within(tour).getByRole('button', { name: 'Next' }));
    expect(within(tour).getByText('ThriftBucks')).toBeInTheDocument();
    expect(within(tour).getByText(/use 80% of them today/)).toBeInTheDocument();
    await user.click(within(tour).getByRole('button', { name: 'Next' }));
    expect(within(tour).getByText('My list')).toBeInTheDocument();
    await user.click(within(tour).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Scanner: no camera in jsdom, so type a sample tag.
    const tagField = await screen.findByLabelText('Tag number');
    expect(screen.getByText('Your ThriftBucks')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pass' })).not.toBeInTheDocument(); // no Pass / Add buttons (owner 2026-10-10)
    await user.type(tagField, 'TP0000001{Enter}');

    const card = await screen.findByTestId('item-card');
    expect(await within(card).findByText('Cordless Drill Kit')).toBeInTheDocument();
    // Price first (owner 2026-10-10): Our price, then the ThriftBucks back; no Instant on the card.
    expect(within(card).getByText('ThriftBucks back')).toBeInTheDocument(); // the centered tag's badge, no symbol
    expect(within(card).getByTestId('reward')).toHaveTextContent('+15.00'); // ThriftBucks: the TB mark, never "$"
    // The simple card (owner 2026-10-10): Retail, Our price, You get back; no net cost.
    expect(within(card).queryByTestId('after-tb')).not.toBeInTheDocument();
    expect(within(card).queryByText(/off today/)).not.toBeInTheDocument();
    expect(within(card).getByText('$100.00')).toBeInTheDocument();
    // Nothing beside the reward (owner, 2026-10-09: no coins, no tickets on the item card).
    expect(card.querySelectorAll('img[src*="coin"], img[src*="ticket"]')).toHaveLength(0);

    (document.activeElement as HTMLElement | null)?.blur(); // the arrow keys work off the tag box
    await user.keyboard('{ArrowRight}'); // swiping (or the arrow keys) still adds; it just isn't advertised
    await waitFor(() => expect(screen.queryByTestId('item-card')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('cart-count')).toHaveTextContent('1'));
    // The pill (owner 2026-10-10): the count on the cart, "+15.00" over "ThriftBucks"; no $ estimate.
    expect(screen.getByTestId('pill-tb')).toHaveTextContent('+15.00ThriftBucks');
    // No InstantBucks question in the app: the member tells the cashier (rulebook B1).
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // My list: the ThriftBucks on it and one line about the register; the items; the scan in history.
    await user.click(screen.getByTestId('cart-pill'));
    const cart = await screen.findByTestId('cart-page');
    expect(within(cart).getByTestId('list-tb')).toHaveTextContent('+15.00');
    expect(within(cart).getByTestId('list-note')).toHaveTextContent('The register uses your ThriftBucks and Return $ automatically');
    expect(within(cart).queryByTestId('cart-total')).not.toBeInTheDocument();
    expect(within(cart).queryByRole('radio')).not.toBeInTheDocument();
    const line = within(cart).getByTestId('cart-line');
    expect(line).toHaveTextContent('Cordless Drill Kit');
    expect(within(line).getByTestId('line-prices')).toHaveTextContent(/MSRP \$\d+\.\d\dTag \$60\.00ThriftBucks \+15\.00/);
    await user.click(within(line).getByRole('button', { name: 'One more' }));
    await waitFor(() => expect(within(line).getByTestId('qty')).toHaveTextContent('2'));
    expect(within(line).getByText('$120.00')).toBeInTheDocument();
    await waitFor(() => expect(within(cart).getByTestId('list-tb')).toHaveTextContent('+30.00'));

    const row = await within(cart).findByTestId('history-row');
    expect(within(row).getByRole('button', { name: /is in your cart/ })).toBeDisabled();
  });

  it('explains the tiles when tapped, and helps when the camera does not work', async () => {
    const user = userEvent.setup();
    renderPage();
    await signInAsMember(user);
    await skipTour(user);

    await user.click(screen.getByRole('button', { name: /Your ThriftBucks .* What is this\?/ }));
    // ThriftBucks Balance opens the full list, in the order it is used.
    const page = await screen.findByTestId('balance-page');
    expect(within(page).getByText("In the order they're used")).toBeInTheDocument();
    await user.click(within(page).getByRole('button', { name: 'Back to scanner' }));
    await waitFor(() => expect(screen.queryByTestId('balance-page')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /This month's cover.* What is this\?/ }));
    const cover = await screen.findByRole('dialog', { name: "This month's cover" });
    expect(within(cover).getByText(/you collect each month cover your card/)).toBeInTheDocument();
    expect(within(cover).getByText(/you keep every Thrift\+ benefit/)).toBeInTheDocument();
    await user.click(within(cover).getByRole('button', { name: 'Close' }));

    // jsdom has no camera, so the camera card offers help.
    await user.click(await screen.findByRole('button', { name: 'Camera not working?' }));
    const help = await screen.findByRole('dialog', { name: 'Camera not working?' });
    await user.click(within(help).getByRole('tab', { name: 'Android' }));
    expect(within(help).getByText(/Tap Permissions, then turn Camera on/)).toBeInTheDocument();
    await user.click(within(help).getByRole('tab', { name: 'iPhone' }));
    expect(within(help).getByText(/Website Settings, then set Camera to Allow/)).toBeInTheDocument();
  });

  it('runs the quick price survey and returns to the card', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Scan as a guest' }));
    await skipTour(user);
    await user.type(await screen.findByLabelText('Tag number'), 'TP0000001{Enter}');

    const card = await screen.findByTestId('item-card');
    expect(await within(card).findByText('ThriftBucks for members')).toBeInTheDocument();
    expect(within(card).queryByText(/off today/)).not.toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: /Price feel off/ }));
    await user.click(within(card).getByRole('button', { name: 'Price is too high' }));
    await user.click(within(card).getByRole('button', { name: '$51' }));
    expect(within(card).getByText('Thanks for that!')).toBeInTheDocument();
    expect(thriftPlusMockControls.signals().at(-1)).toMatchObject({
      kind: 'feel',
      sku: 'TP0000001',
      feel: { reason: 'too_high', would_pay: '51.00' },
    });
    await waitFor(() => expect(within(card).queryByText('Thanks for that!')).not.toBeInTheDocument(), { timeout: 3000 });
    expect(within(card).getByText('Cordless Drill Kit')).toBeInTheDocument();

    // Pass sends the card away and the scanner is back on top.
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(screen.queryByTestId('item-card')).not.toBeInTheDocument());
    expect(thriftPlusMockControls.signals().at(-1)).toMatchObject({ kind: 'pass', sku: 'TP0000001' });
  });

  it('shows a clear miss for a code that is not a price tag', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Scan as a guest' }));
    await skipTour(user);
    await user.type(await screen.findByLabelText('Tag number'), 'nope!{Enter}');
    expect(await screen.findByText("That code isn't a price tag")).toBeInTheDocument();
  });
});
