import { useEffect, useRef } from 'react';

const MIN_LEN = 6;
const MAX_LEN = 32;
const BURST_GAP_MS = 120;

/**
 * Invisible listener for a keyboard-wedge scanner. Characters arriving in a
 * fast burst and finished with Enter become one scan. Slow typing (a person at
 * the keyboard) is ignored. Re-focuses itself whenever `enabled` is true.
 */
export function ScanInput({ enabled, onScan }: { enabled: boolean; onScan: (token: string) => void }) {
  const buffer = useRef('');
  const last = useRef(0);
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const now = Date.now();
      if (now - last.current > BURST_GAP_MS) buffer.current = '';
      last.current = now;
      if (event.key === 'Enter' || event.key === 'Tab') {
        const token = buffer.current.trim();
        buffer.current = '';
        if (token.length >= MIN_LEN && token.length <= MAX_LEN) {
          event.preventDefault();
          handler.current(token);
        }
        return;
      }
      if (event.key.length === 1 && buffer.current.length < MAX_LEN) {
        buffer.current += event.key;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  return null;
}
