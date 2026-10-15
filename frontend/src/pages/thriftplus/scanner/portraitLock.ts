/**
 * The scanner stays upright on the phone (owner 2026-10-15: "customers tilt phone to scan and it reorients, it's a
 * mess"). A web page in a browser tab can't lock its orientation, so when a phone is turned sideways the page turns
 * itself back by the same angle: it looks and behaves like a portrait-locked app, camera preview included. The
 * home-screen app also asks the phone to lock portrait (and its manifest says portrait).
 *
 * Only phones turn (a touch screen with a short side under 600 px); tablets and computers are left alone. The angle
 * comes from the screen, never the viewport, so the on-screen keyboard can't trigger it.
 */
import { useEffect, useState } from 'react';

/** How far the page turns back (CSS degrees, clockwise): 0 upright, -90 or 90 when the phone is sideways. */
export type Turn = 0 | 90 | -90;

let current: Turn = 0;

/** The page's turn for a screen angle (0, 90, 180 or 270; iOS also -90) on a phone. */
export function turnFor(angle: number, phone: boolean): Turn {
  if (!phone) return 0;
  const a = ((angle % 360) + 360) % 360;
  if (a === 90) return -90;
  if (a === 270) return 90;
  return 0;
}

function screenAngle(): number {
  const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
  if (so && typeof so.angle === 'number') return so.angle;
  const legacy = (window as Window & { orientation?: number }).orientation;
  if (typeof legacy === 'number') return legacy;
  return typeof screen !== 'undefined' && screen.width > screen.height ? 90 : 0;
}

function isPhone(): boolean {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse && Math.min(screen.width, screen.height) < 600;
}

/** The turn now, kept current by `usePortraitTurn` (pointer math reads it). */
export function currentTurn(): Turn {
  return current;
}

/**
 * A pointer's position in the page's own (upright) frame, so swipes measured left/right still mean the phone's
 * left/right while the page is turned. Only the difference between two positions matters.
 */
export function localPoint(e: { clientX: number; clientY: number }, turn: Turn = current): { x: number; y: number } {
  if (turn === -90) return { x: -e.clientY, y: e.clientX };
  if (turn === 90) return { x: e.clientY, y: -e.clientX };
  return { x: e.clientX, y: e.clientY };
}

export function usePortraitTurn(): Turn {
  const [turn, setTurn] = useState<Turn>(() => (current = turnFor(screenAngle(), isPhone())));
  useEffect(() => {
    const update = () => {
      current = turnFor(screenAngle(), isPhone());
      setTurn(current);
    };
    const so = screen.orientation;
    so?.addEventListener?.('change', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    // The home-screen app can lock for real (browsers refuse it in a tab; that's fine, the turn covers it).
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
    const lockable = so as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    if (standalone && lockable?.lock) lockable.lock('portrait').catch(() => undefined);
    return () => {
      so?.removeEventListener?.('change', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
      current = 0;
    };
  }, []);
  return turn;
}
