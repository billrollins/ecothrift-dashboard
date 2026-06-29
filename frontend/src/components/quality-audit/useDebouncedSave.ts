import { useEffect, useRef } from 'react';

/**
 * Debounce an async save while the latest payload may keep changing.
 * Calls `save(payload)` once after `delayMs` of quiet, always with the most
 * recent payload. Returns nothing; callers track pending state via the passed
 * mutation. Cancels pending save on unmount.
 */
export function useDebouncedSave<T>(
  payload: T | null,
  save: (payload: T) => Promise<void>,
  delayMs = 600,
  enabled = true,
) {
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!enabled || payload == null) return;
    const timer = setTimeout(() => {
      void saveRef.current(payload).catch(() => {
        /* callers surface errors via their own mutation */
      });
    }, delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, delayMs, enabled]);
}
