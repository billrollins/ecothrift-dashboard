/**
 * The scanner as a home-screen app (owner 2026-10-14, APP D5): the web app manifest and the iPhone tags go in the page
 * head only while the scanner is open, and Android's install prompt is kept until the member taps Install on the
 * "Put Thrift+ on your home screen" card (owner 2026-10-20). The manifest and icons live in frontend/public/scan/. The
 * public site (frontend-public/index.html) carries the same tags on every page, so Add to Home Screen from any
 * ecothrift.us page installs the app, not a bookmark (owner 2026-10-20): keep the two in step.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const installPrompt = {
  /** Re-render when the browser offers (or withdraws) its install prompt. Returns the unsubscribe. */
  listen(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  async show(): Promise<void> {
    const e = deferred;
    if (!e) return;
    deferred = null;
    notify();
    await e.prompt().catch(() => undefined);
  },
};

/** Opened from the home screen (no browser bars). */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
}

function isIphoneSafari(ua = navigator.userAgent): boolean {
  const apple = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  return apple && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
}

/** How this phone can add the app: Android's prompt, iPhone Safari's Share menu, or not at all. */
export function canInstall(): 'prompt' | 'ios' | null {
  if (deferred) return 'prompt';
  if (isIphoneSafari()) return 'ios';
  return null;
}

/** "Put Thrift+ on your home screen" (owner 2026-10-20): a dismissed prompt stays away this long. Account always shows it. */
export const HOME_CARD_QUIET_DAYS = 14;
const HOME_CARD_KEY = 'tp-home-card-dismissed';

/** True while the prompt is in its two quiet weeks. Private mode (no storage) never counts as dismissed. */
export function homeCardDismissed(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(HOME_CARD_KEY));
    return at > 0 && now - at < HOME_CARD_QUIET_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function dismissHomeCard(now = Date.now()): void {
  try {
    localStorage.setItem(HOME_CARD_KEY, String(now));
  } catch {
    /* private mode: it just comes back next time */
  }
}

/**
 * Put the manifest and the iPhone tags in the head; returns how to take them out again. Owner 2026-10-16: two apps that
 * install side by side on one phone, Thrift+ Member (this one, from ecothrift.us) and Thrift+ Staff (/staff/ on
 * dash.ecothrift.us), each with its own id, scope, icon, name and colour.
 */
export function installScannerHead(): () => void {
  return installAppHead({ manifest: '/scan/manifest.webmanifest', icon: '/scan/icons/apple-touch-icon.png', title: 'Thrift+ Member', theme: '#237a26' });
}

/** The Thrift+ Staff app (owner 2026-10-16): its manifest is scoped to /staff/, so it never overlaps the member app. */
export const STAFF_APP_HEAD = {
  manifest: '/staff/manifest.webmanifest',
  icon: '/staff/icons/apple-touch-icon.png',
  title: 'Thrift+ Staff',
  theme: '#111111',
} as const;

/** The same for any page that installs as its own home-screen app: the member scanner and Thrift+ Staff. */
export function installAppHead({ manifest, icon, title, theme }: { manifest: string; icon: string; title: string; theme: string }): () => void {
  const added: HTMLElement[] = [];
  const add = (tag: 'link' | 'meta', attrs: Record<string, string>) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    el.dataset.thriftplus = 'app';
    document.head.appendChild(el);
    added.push(el);
  };
  add('link', { rel: 'manifest', href: manifest });
  add('link', { rel: 'apple-touch-icon', href: icon });
  add('meta', { name: 'apple-mobile-web-app-title', content: title });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'theme-color', content: theme });
  return () => added.forEach((el) => el.remove());
}
