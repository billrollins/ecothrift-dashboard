import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { thriftPlusMockControls } from '../../../api/thriftPlusMock';
import ThriftPlusScannerPage from './ThriftPlusScannerPage';

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
  it('walks through Scan, Bank, Cart once, then scans, adds, banks and shows the cart', async () => {
    const user = userEvent.setup();
    renderPage();
    await signInAsMember(user);

    // First run: the three-step walkthrough.
    const tour = await screen.findByRole('dialog', { name: 'How Thrift+ works' });
    expect(within(tour).getByText('Scan')).toBeInTheDocument();
    await user.click(within(tour).getByRole('button', { name: 'Next' }));
    expect(within(tour).getByText('Bank')).toBeInTheDocument();
    expect(within(tour).getByText(/worth 5% more/)).toBeInTheDocument();
    await user.click(within(tour).getByRole('button', { name: 'Next' }));
    expect(within(tour).getByText('Cart')).toBeInTheDocument();
    await user.click(within(tour).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Scanner: no camera in jsdom, so type a sample tag.
    const tagField = await screen.findByLabelText('Tag number');
    expect(screen.getByText('Banked rewards')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pass' })).toBeDisabled();
    await user.type(tagField, 'TP0000001{Enter}');

    const card = await screen.findByTestId('item-card');
    expect(await within(card).findByText('Cordless Drill Kit')).toBeInTheDocument();
    expect(within(card).getByText("You'd earn")).toBeInTheDocument();
    expect(within(card).getByTestId('reward')).toHaveTextContent('+$15.00');
    expect(within(card).getByTestId('bank-line')).toHaveTextContent('or +$15.75 if you bank it');
    expect(within(card).getByText('$100.00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add to my list' }));
    await waitFor(() => expect(screen.queryByTestId('item-card')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('cart-pill')).toHaveTextContent('1 item'));
    expect(screen.getByTestId('cart-pill')).toHaveTextContent('+$15.00');

    // First add of the trip: bank (worth 5% more) or instant rebate.
    const ask = await screen.findByRole('dialog', { name: 'Would you like to bank your rewards?' });
    expect(within(ask).getByText('$11.97 for later, 5% more')).toBeInTheDocument();
    expect(within(ask).getByText("$11.40 off today's price")).toBeInTheDocument();
    await user.click(within(ask).getByRole('button', { name: /Yes, bank my rewards/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // The cart: a big total, the choice (banking selected), quantity, and the scan in history.
    await user.click(screen.getByTestId('cart-pill'));
    const cart = await screen.findByTestId('cart-page');
    expect(within(cart).getByTestId('cart-total')).toHaveTextContent('$60.00');
    expect(within(cart).getByRole('radio', { name: 'Bank them' })).toHaveAttribute('aria-checked', 'true');
    const line = within(cart).getByTestId('cart-line');
    expect(line).toHaveTextContent('Cordless Drill Kit');
    await user.click(within(line).getByRole('button', { name: 'One more' }));
    await waitFor(() => expect(within(line).getByTestId('qty')).toHaveTextContent('2'));
    expect(within(line).getByText('$120.00')).toBeInTheDocument();

    // Switch to the instant rebate: the total drops by the rewards past the cover.
    await user.click(within(cart).getByRole('radio', { name: 'Instant rebate' }));
    await waitFor(() => expect(within(cart).getByTestId('cart-total')).toHaveTextContent('$93.60'));

    const row = await within(cart).findByTestId('history-row');
    expect(within(row).getByRole('button', { name: /is in your cart/ })).toBeDisabled();
  });

  it('explains the tiles when tapped, and helps when the camera does not work', async () => {
    const user = userEvent.setup();
    renderPage();
    await signInAsMember(user);
    await skipTour(user);

    await user.click(screen.getByRole('button', { name: /Banked rewards .* What is this\?/ }));
    const bank = await screen.findByRole('dialog', { name: 'Banked rewards' });
    expect(within(bank).getByText(/worth 5% more/)).toBeInTheDocument();
    await user.click(within(bank).getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /This month's cover.* What is this\?/ }));
    const cover = await screen.findByRole('dialog', { name: "This month's cover" });
    expect(within(cover).getByText(/of rewards each month covers your card/)).toBeInTheDocument();
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
    expect(await within(card).findByText('Members earn')).toBeInTheDocument();
    expect(within(card).queryByTestId('bank-line')).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Pass' }));
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
