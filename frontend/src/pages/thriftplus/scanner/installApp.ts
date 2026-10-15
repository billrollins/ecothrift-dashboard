/**
 * The scanner as a home-screen app (owner 2026-10-14, APP D5): the web app manifest and the iPhone tags go in the page
 * head only while the scanner is open, and Android's install prompt is kept until the member taps "Add your member
 * QR to your home screen" (D6). The manifest and icons live in frontend/public/scan/.
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

/** Put the manifest and the iPhone tags in the head; returns how to take them out again. */
export function installScannerHead(): () => void {
  const added: HTMLElement[] = [];
  const add = (tag: 'link' | 'meta', attrs: Record<string, string>) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    el.dataset.thriftplus = 'app';
    document.head.appendChild(el);
    added.push(el);
  };
  add('link', { rel: 'manifest', href: '/scan/manifest.webmanifest' });
  add('link', { rel: 'apple-touch-icon', href: '/scan/icons/apple-touch-icon.png' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'Thrift+' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'theme-color', content: '#237a26' });
  return () => added.forEach((el) => el.remove());
}
