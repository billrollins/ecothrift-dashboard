import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeScreenCard } from './homeScreen';
import { HOME_CARD_QUIET_DAYS, dismissHomeCard, homeCardDismissed } from './installApp';

// "Put Thrift+ on your home screen" (owner 2026-10-20): mobile web only, never in the installed app, 2 weeks quiet.
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const KEY = 'tp-home-card-dismissed';
const DAY = 86_400_000;

let ua: ReturnType<typeof vi.spyOn> | null = null;
const iphone = (agent = IPHONE_SAFARI) => {
  ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent);
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  ua?.mockRestore();
  ua = null;
  vi.restoreAllMocks();
  delete (window.navigator as { standalone?: boolean }).standalone;
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('HomeScreenCard', () => {
  it('shows nothing on a computer, or where the phone has no way to add it (iPhone Chrome)', () => {
    const { unmount } = render(<HomeScreenCard variant="banner" />);
    expect(screen.queryByTestId('home-banner')).toBeNull();
    unmount();
    const account = render(<HomeScreenCard variant="account" />);
    expect(screen.queryByTestId('home-card')).toBeNull();
    account.unmount();
    iphone(IPHONE_CHROME);
    render(<HomeScreenCard variant="account" />);
    expect(screen.queryByTestId('home-card')).toBeNull();
  });

  it('iPhone Safari: the words, then three picture steps (Share, Add to Home Screen, Add)', async () => {
    iphone();
    const user = userEvent.setup();
    render(<HomeScreenCard variant="banner" />);
    const banner = screen.getByTestId('home-banner');
    expect(banner).toHaveTextContent('Put Thrift+ on your home screen');
    expect(banner).toHaveTextContent('It stays signed in and opens faster.');
    expect(within(banner).getByTestId('home-go')).toHaveTextContent('Show me');
    expect(screen.queryByTestId('home-steps')).toBeNull();
    await user.click(within(banner).getByTestId('home-go'));
    const how = screen.getByTestId('home-steps');
    expect([1, 2, 3].map((n) => within(how).getByTestId(`home-step-${n}`).textContent)).toEqual([
      '1Tap Share at the bottom of Safari.',
      '2Add to Home ScreenTap Add to Home Screen. Scroll down if you don\'t see it.',
      '3AddTap Add at the top right.',
    ]);
    await user.click(within(how).getByTestId('home-steps-done'));
    expect(screen.queryByTestId('home-steps')).toBeNull();
  });

  it('is never shown in the installed app: not by navigator.standalone, not by display-mode', () => {
    iphone();
    (window.navigator as { standalone?: boolean }).standalone = true;
    const first = render(<HomeScreenCard variant="banner" />);
    expect(screen.queryByTestId('home-banner')).toBeNull();
    first.unmount();
    render(<HomeScreenCard variant="account" />);
    expect(screen.queryByTestId('home-card')).toBeNull();
    cleanupStandalone();

    window.matchMedia = vi.fn((q: string) => ({ matches: q.includes('standalone') })) as never;
    render(<HomeScreenCard variant="account" />);
    expect(screen.queryByTestId('home-card')).toBeNull();
  });

  it('Not now hides the banner for 2 weeks; Account always has it', async () => {
    iphone();
    const user = userEvent.setup();
    const first = render(<HomeScreenCard variant="banner" />);
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('home-banner')).toBeNull();
    expect(Number(window.localStorage.getItem(KEY))).toBeGreaterThan(0);
    first.unmount();

    // A new visit on the same phone: still quiet. Account shows it anyway, with no Not now.
    const banner = render(<HomeScreenCard variant="banner" />);
    expect(screen.queryByTestId('home-banner')).toBeNull();
    banner.unmount();
    render(<HomeScreenCard variant="account" />);
    expect(screen.getByTestId('home-card')).toHaveTextContent('It stays signed in and opens faster.');
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
  });

  it('comes back after 2 weeks', () => {
    const now = Date.now();
    expect(homeCardDismissed(now)).toBe(false);
    dismissHomeCard(now - 13 * DAY);
    expect(homeCardDismissed(now)).toBe(true);
    dismissHomeCard(now - HOME_CARD_QUIET_DAYS * DAY - 1000);
    expect(homeCardDismissed(now)).toBe(false);
    expect(HOME_CARD_QUIET_DAYS).toBe(14);
  });

  it('works with no storage (private mode): the banner still hides for this visit', async () => {
    iphone();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const user = userEvent.setup();
    render(<HomeScreenCard variant="banner" />);
    expect(screen.getByTestId('home-banner')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('home-banner')).toBeNull();
  });

  it('Android: the Install button asks the browser to install, once', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<HomeScreenCard variant="banner" />);
    expect(screen.queryByTestId('home-banner')).toBeNull(); // nothing to install with until the browser offers it
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(offer, { prompt });
    act(() => {
      window.dispatchEvent(offer);
    });
    expect(offer.defaultPrevented).toBe(true); // the browser's own bar stays away
    const banner = await screen.findByTestId('home-banner');
    expect(within(banner).getByTestId('home-go')).toHaveTextContent('Install');
    await user.click(within(banner).getByTestId('home-go'));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('home-banner')).toBeNull();
    expect(screen.queryByTestId('home-steps')).toBeNull(); // Android has no picture steps
  });
});

function cleanupStandalone() {
  delete (window.navigator as { standalone?: boolean }).standalone;
}
