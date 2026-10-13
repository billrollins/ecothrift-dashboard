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
  getMe: vi.fn(async () => ({ credit: '8.56', rewards: [{ amount: '10.25', earned_on: '2026-10-02', use_by: '2026-11-01', past_due: false }] })),
  reportCardLost: vi.fn(),
  removePerson: vi.fn(),
  setUpLogin: vi.fn(),
  isOpen: vi.fn(async () => true),
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
    await user.click(await screen.findByRole('button', { name: 'Scan as a guest' }));
    await scan(user, 'TP0000001');
    const card = await screen.findByTestId('scan-card');
    expect(await within(card).findByText('ThriftBucks for members')).toBeInTheDocument();

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
    await user.click(within(about).getByRole('button', { name: 'Close' }));

    await user.click(screen.getByTestId('wallet-pill'));
    const wallet = await screen.findByTestId('wallet-sheet');
    const rows = await within(wallet).findAllByTestId('wallet-row');
    expect(rows[0]).toHaveTextContent('Thrift+ credit');
    expect(rows[0]).toHaveTextContent('$8.56');
    expect(rows[1]).toHaveTextContent('use by Nov 1');
    expect(within(wallet).getByTestId('sign-out')).toBeInTheDocument();
  });

  it('shows a clear miss for a code that is not a price tag, and helps when the camera does not work', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Scan as a guest' }));
    await scan(user, 'nope!');
    expect(await screen.findByText("That code isn't a price tag")).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Camera not working?' }));
    const help = await screen.findByRole('dialog', { name: 'Camera not working?' });
    await user.click(within(help).getByRole('tab', { name: 'Android' }));
    expect(within(help).getByText(/Tap Permissions, then turn Camera on/)).toBeInTheDocument();
  });
});
