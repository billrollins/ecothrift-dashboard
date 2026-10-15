/**
 * A phone held sideways, and the "Lock upright" button (owner 2026-10-15, APP D16 v2: the turned page of v2.170.1 was
 * "ugly"; he wants the screen lock he had before in a web app).
 *
 * - **Lock upright:** where the browser allows it (Android browsers), one tap puts the scanner in full screen and locks
 *   the screen in portrait, like the phone's own rotation lock. Leaving full screen (the button again, or the phone's
 *   back gesture) ends the lock. iPhones can't do this in a browser, so they don't get the button.
 * - **Sideways without the lock:** the page turns with the phone like any web page, and the scanner shows its sideways
 *   screens (Sideways.tsx): the camera keeps scanning full screen, a read code says "Got it!", the Member QR shows
 *   alone, and anything else asks to turn the phone upright.
 * - **The home-screen app** asks the phone to lock portrait (its manifest also says portrait).
 *
 * Only phones count (a touch screen with a short side under 600 px). Sideways comes from the screen's angle, never the
 * viewport, so the on-screen keyboard can't trigger it.
 */
import { useEffect, useState } from 'react';

type LockableOrientation = ScreenOrientation & { lock?: (orientation: 'portrait') => Promise<void> };
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};

export function isPhone(): boolean {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse && Math.min(screen.width, screen.height) < 600;
}

/** Sideways for a screen angle (0, 90, 180 or 270; older iPhones also say -90), on a phone only. */
export function isSidewaysAngle(angle: number, phone: boolean): boolean {
  if (!phone) return false;
  const a = ((angle % 360) + 360) % 360;
  return a === 90 || a === 270;
}

function screenAngle(): number {
  const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
  if (so && typeof so.angle === 'number') return so.angle;
  const legacy = (window as Window & { orientation?: number }).orientation;
  if (typeof legacy === 'number') return legacy;
  return typeof screen !== 'undefined' && screen.width > screen.height ? 90 : 0;
}

/** True while a phone is held sideways. */
export function useSideways(): boolean {
  const [sideways, setSideways] = useState(() => isSidewaysAngle(screenAngle(), isPhone()));
  useEffect(() => {
    const update = () => setSideways(isSidewaysAngle(screenAngle(), isPhone()));
    const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
    so?.addEventListener?.('change', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    return () => {
      so?.removeEventListener?.('change', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return sideways;
}

function fullscreenElement(): Element | null {
  const d = document as FullscreenDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

/** The browser can lock the screen upright: full screen plus an orientation lock (Android browsers; never iPhones). */
export function canLockUpright(): boolean {
  if (typeof document === 'undefined' || typeof screen === 'undefined' || !isPhone()) return false;
  const d = document as FullscreenDocument;
  const so = screen.orientation as LockableOrientation | undefined;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled) && typeof so?.lock === 'function';
}

/** Full screen, then lock portrait. Needs a tap (browsers allow full screen only from one). True when it locked. */
export async function lockUpright(): Promise<boolean> {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  try {
    if (!fullscreenElement()) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    }
    await (screen.orientation as LockableOrientation).lock!('portrait');
    return true;
  } catch {
    await releaseUpright();
    return false;
  }
}

/** Let the screen turn again and leave full screen. */
export async function releaseUpright(): Promise<void> {
  try {
    screen.orientation?.unlock();
  } catch {
    /* nothing locked */
  }
  try {
    const d = document as FullscreenDocument;
    if (fullscreenElement()) await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
  } catch {
    /* already out */
  }
}

/** Locked upright = in full screen (the browser drops the lock when full screen ends). */
export function useLockedUpright(): boolean {
  const [locked, setLocked] = useState(() => typeof document !== 'undefined' && !!fullscreenElement());
  useEffect(() => {
    const update = () => setLocked(!!fullscreenElement());
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);
  return locked;
}

/** The lock button's state for the screens that show it; null where the browser can't lock (iPhones). */
export function useUprightLock(): { locked: boolean; toggle: () => void } | null {
  const locked = useLockedUpright();
  const [lockable] = useState(canLockUpright);
  if (!lockable) return null;
  return { locked, toggle: () => void (locked ? releaseUpright() : lockUpright()) };
}

/** The home-screen app can lock for real (browsers refuse it in a tab; that's fine, the sideways screens handle it). */
export function useStandaloneLock(): void {
  useEffect(() => {
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
    const so = (typeof screen !== 'undefined' ? screen.orientation : undefined) as LockableOrientation | undefined;
    if (standalone && so?.lock) so.lock('portrait').catch(() => undefined);
  }, []);
}
