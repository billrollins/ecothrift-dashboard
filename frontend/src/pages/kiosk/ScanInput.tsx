import { useEffect, useRef } from 'react';

const MIN_LEN = 6;
const MAX_LEN = 32;

/** A wedge scanner types far faster than a person. 400ms is the line between them. */
export const BURST_GAP_MS = 400;
/** Enter reads the buffer only while the last character is this fresh. */
export const ENTER_STALE_MS = 2_000;

export type ScanState = { buffer: string; last: number };
export type ScanResult = { kind: 'none' } | { kind: 'scan'; token: string } | { kind: 'reject' };

export const EMPTY_SCAN_STATE: ScanState = { buffer: '', last: 0 };

/**
 * One keystroke of the scan buffer. Pure, so the rule is testable without a DOM.
 *
 * Enter and Tab end a scan and are read BEFORE any gap reset: a scanner that
 * paused between its last character and Enter used to wipe its own buffer and
 * submit nothing.
 */
export function takeScanKey(
  state: ScanState,
  key: string,
  now: number,
): { state: ScanState; result: ScanResult } {
  if (key === 'Enter' || key === 'Tab') {
    const fresh = now - state.last <= ENTER_STALE_MS;
    const token = fresh ? state.buffer.trim() : '';
    const next: ScanState = { buffer: '', last: now };
    if (token.length >= MIN_LEN && token.length <= MAX_LEN) {
      return { state: next, result: { kind: 'scan', token } };
    }
    if (token.length > 0) return { state: next, result: { kind: 'reject' } };
    return { state: next, result: { kind: 'none' } };
  }
  // Modifiers, arrows, F-keys: not part of a scan and not a gap either.
  if (key.length !== 1) return { state, result: { kind: 'none' } };
  const carried = now - state.last > BURST_GAP_MS ? '' : state.buffer;
  const buffer = carried.length < MAX_LEN ? carried + key : carried;
  return { state: { buffer, last: now }, result: { kind: 'none' } };
}

/**
 * Invisible listener for a keyboard-wedge scanner. Renders nothing: keystrokes
 * are read off the window, so no field has to hold focus and no on-screen
 * keyboard ever opens. Keys aimed at a real text field are left alone.
 */
export function ScanInput({
  enabled,
  onScan,
  onReject,
}: {
  enabled: boolean;
  onScan: (token: string) => void;
  onReject: () => void;
}) {
  const state = useRef<ScanState>(EMPTY_SCAN_STATE);
  const scan = useRef(onScan);
  const reject = useRef(onReject);
  scan.current = onScan;
  reject.current = onReject;

  useEffect(() => {
    if (!enabled) {
      state.current = EMPTY_SCAN_STATE;
      return;
    }
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      const step = takeScanKey(state.current, event.key, Date.now());
      state.current = step.state;
      if (step.result.kind === 'scan') {
        // Also stops the trailing Enter re-clicking whatever button holds focus.
        event.preventDefault();
        scan.current(step.result.token);
      } else if (step.result.kind === 'reject') {
        event.preventDefault();
        reject.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  return null;
}
