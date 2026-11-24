/**
 * Owner page, Testing (owner 2026-11-24): one pick per device kind, on for 24 hours then off by itself; a version that
 * no longer exists is not listed; the status row says Live or Testing so he always knows what his devices show.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnerTesting as Testing } from '../../api/owner.api';
import OwnerTesting, { endsText } from './OwnerTesting';

const calls = vi.hoisted(() => ({ saved: [] as unknown[], next: null as unknown }));

const LIVE: Testing = {
  state: { mobile: '', desktop: '', until: null },
  options: {
    mobile: [
      { key: 'legacy', label: 'Legacy', what: '' },
      { key: 'new', label: 'New', what: '' },
      { key: 'bf', label: 'Black Friday', what: '' },
    ],
    desktop: [{ key: 'bf', label: 'Black Friday', what: '' }],
  },
  live: { mobile: 'The new phone site, the old scanner', desktop: 'The desktop site' },
  link: 'https://ecothrift.us/?test=link:abc',
  unlink: 'https://ecothrift.us/?test=off',
  hours: 24,
};

vi.mock('../../api/owner.api', () => ({
  fetchOwnerTesting: async () => calls.next,
  saveOwnerTesting: async (body: unknown) => {
    calls.saved.push(body);
    return { ...LIVE, state: { mobile: 'bf', desktop: '', until: '2026-11-25T16:30:00-06:00' } };
  },
}));
vi.mock('../../components/thriftplus/QrSvg', () => ({ default: ({ text }: { text: string }) => <div data-testid="qr">{text}</div> }));

beforeEach(() => {
  calls.saved = [];
  calls.next = LIVE;
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OwnerTesting />
    </QueryClientProvider>,
  );
}

describe('the owner Testing tab', () => {
  it('starts on Live, lists only the versions that exist, and a pick turns testing on for 24 hours', async () => {
    show();
    expect(await screen.findByTestId('testing-status')).toHaveTextContent('Live. Your devices see what customers see.');
    const mobile = within(screen.getByTestId('testing-mobile'));
    expect(mobile.getAllByRole('button').map((b) => b.textContent)).toEqual(['Live', 'Legacy', 'New', 'Black Friday']);
    expect(screen.getByTestId('testing-mobile')).toHaveTextContent('Customers see: The new phone site, the old scanner');
    // No New for desktops yet: only what exists is offered.
    expect(within(screen.getByTestId('testing-desktop')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Live', 'Black Friday']);
    expect(mobile.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(mobile.getByRole('button', { name: 'Black Friday' }));
    expect(calls.saved).toEqual([{ mobile: 'bf' }]);
    expect(await screen.findByText(/Testing on your devices until Wed 4:30 PM\. Then back to Live by itself\./)).toBeInTheDocument();
    expect(mobile.getByRole('button', { name: 'Black Friday' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'End now' }));
    expect(calls.saved[1]).toEqual({ end: true });
  });

  it('links a device with the QR (a phone) or the button (this computer)', async () => {
    show();
    expect(await screen.findByTestId('qr')).toHaveTextContent('https://ecothrift.us/?test=link:abc');
    expect(screen.getByRole('link', { name: 'Link this computer' })).toHaveAttribute('href', 'https://ecothrift.us/?test=link:abc');
    expect(screen.getByRole('link', { name: 'Unlink this computer' })).toHaveAttribute('href', 'https://ecothrift.us/?test=off');
  });

  it('writes the end as a day and a time', () => {
    expect(endsText('2026-11-25T16:30:00-06:00')).toMatch(/^[A-Z][a-z]{2} \d{1,2}:\d{2} [AP]M$/);
    expect(endsText(null)).toBe('');
  });
});
