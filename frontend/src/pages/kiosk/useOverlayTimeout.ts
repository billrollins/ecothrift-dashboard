import { useCallback, useEffect, useRef } from 'react';

export const IDLE_MS = 15_000;
export const PICKER_MS = 45_000;
export const SUCCESS_MS = 4_000;

/**
 * Calls `onExpire` after `ms` of no activity. `bump()` restarts the clock;
 * any pointer or key event on the window does the same while `active`.
 * Passing `ms = null` disables the timer.
 */
export function useOverlayTimeout(active: boolean, ms: number | null, onExpire: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const bump = useCallback(() => {
    clear();
    if (!active || ms === null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      expire.current();
    }, ms);
  }, [active, ms, clear]);

  useEffect(() => {
    bump();
    if (!active || ms === null) return clear;
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart'];
    for (const name of events) window.addEventListener(name, bump, { passive: true });
    return () => {
      clear();
      for (const name of events) window.removeEventListener(name, bump);
    };
  }, [active, ms, bump, clear]);

  return bump;
}
