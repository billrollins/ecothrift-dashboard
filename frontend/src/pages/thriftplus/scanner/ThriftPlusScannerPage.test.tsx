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

beforeEach(() => {
  thriftPlusMockControls.reset();
  thriftPlusMockControls.setLatency(0);
});

describe('Thrift+ price scanner', () => {
  it('signs in, scans a sample tag, adds it by button, and shows it on the receipt', async () => {
    const user = userEvent.setup();
    renderPage();

    // Sign in (mock): any email or username and password.
    await user.type(await screen.findByLabelText('Email or username'), 'dana');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // Scanner: no camera in jsdom, so type a sample tag.
    const tagField = await screen.findByLabelText('Tag number');
    expect(screen.getByText('Banked rewards')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pass' })).toBeDisabled();
    await user.type(tagField, 'TP0000001{Enter}');

    const card = await screen.findByTestId('item-card');
    expect(await within(card).findByText('Cordless Drill Kit')).toBeInTheDocument();
    expect(within(card).getByText("You'd earn")).toBeInTheDocument();
    expect(within(card).getByTestId('reward')).toHaveTextContent('+$15.00');
    expect(within(card).getByText('$100.00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add to my list' }));
    await waitFor(() => expect(screen.queryByTestId('item-card')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('cart-pill')).toHaveTextContent('1 item'));
    expect(screen.getByTestId('cart-pill')).toHaveTextContent('+$15.00');

    // First add of the trip: bank or instant rebate.
    const ask = await screen.findByRole('dialog', { name: 'Would you like to bank your rewards?' });
    await user.click(within(ask).getByRole('button', { name: 'Yes, bank my rewards' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // The cart: a receipt line with a quantity stepper, and the scan in history.
    await user.click(screen.getByTestId('cart-pill'));
    const cart = await screen.findByTestId('cart-page');
    const line = within(cart).getByTestId('cart-line');
    expect(line).toHaveTextContent('Cordless Drill Kit');
    await user.click(within(line).getByRole('button', { name: 'One more' }));
    await waitFor(() => expect(within(line).getByTestId('qty')).toHaveTextContent('2'));
    expect(within(line).getByText('$120.00')).toBeInTheDocument();
    const row = await within(cart).findByTestId('history-row');
    expect(within(row).getByRole('button', { name: /is in your cart/ })).toBeDisabled();
    expect(within(cart).getByText('Rewards to bank')).toBeInTheDocument();
    expect(within(cart).getByRole('button', { name: 'Bank them' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('runs the quick price survey and returns to the card', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Scan as a guest' }));
    await user.type(await screen.findByLabelText('Tag number'), 'TP0000001{Enter}');

    const card = await screen.findByTestId('item-card');
    expect(await within(card).findByText('Members earn')).toBeInTheDocument();
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

  it('shows a clear miss for an unknown tag', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Scan as a guest' }));
    await user.type(await screen.findByLabelText('Tag number'), 'nope!{Enter}');
    expect(await screen.findByText("That code isn't a price tag")).toBeInTheDocument();
  });
});
