/**
 * Where a scan goes on the Processing screens (Dash Updates #97, D28). A processor holds a scanner in one hand and
 * an item in the other, so the next scan must find the search without a click:
 *
 * - A key typed where there is no typing box (a button, the page) goes into the search, replacing what was there.
 *   On the check-in window that is the window's own search; on any other window it is left alone.
 * - A scanner burst into a price, quantity or note box is taken back out (the box gets back what it had), and the
 *   scan is put in the search with its words selected. Enter is held back, so a scan is never saved as a value.
 *
 * A scanner types a whole code in a burst ending in Enter; a person types slower (same rule as Processing > Returns).
 */
import { useEffect, useRef } from 'react';

/** A scan is at least this many keys, each this close to the last, then Enter. */
export const SCAN_MIN_KEYS = 6;
export const SCAN_MAX_GAP_MS = 50;
/** The first two keys of a scan may come a little further apart (the scanner wakes up). */
export const SCAN_FIRST_GAP_MS = 300;

const TYPING_INPUT_TYPES = new Set(['text', 'number', 'search', 'tel', 'email', 'url', 'password', '']);

/** True for a box a person types into. */
export function isTypingBox(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TYPING_INPUT_TYPES.has((el.getAttribute('type') || '').toLowerCase());
  return (el as HTMLElement).isContentEditable === true;
}

/** The words a person reads for a box: its label, else its aria-label, else its placeholder. */
function boxName(el: HTMLInputElement | HTMLTextAreaElement): string {
  const label = el.labels && el.labels.length ? el.labels[0].textContent : '';
  return [label, el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('name')]
    .filter(Boolean).join(' ');
}

/** Boxes a scan must never land in: money, counts and notes. A UPC or search box takes a scan as it should. */
export function isGuardedBox(el: Element | null): boolean {
  if (!isTypingBox(el) || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el.closest('[data-scan-search], [data-scan-ok]')) return false;
  if (el.getAttribute('role') === 'combobox' || el.hasAttribute('aria-autocomplete')) return false;
  return /price|retail|cost|quantity|qty|items|units|note|percent|%/i.test(boxName(el));
}

/** The search a scan belongs in: the check-in window's own while it is open, else the page's. */
export function searchInputFor(from: Element | null): HTMLInputElement | null {
  const dialog = from?.closest('[role="dialog"]');
  if (dialog) return dialog.querySelector<HTMLInputElement>('input[data-scan-search]');
  return document.querySelector<HTMLInputElement>('input[data-scan-search="page"]');
}

/**
 * The one row a scan found, when it found one: rows that are one group on the queue (rows checked in as one)
 * count as one, and open on the group's main row. Null for none or for more than one.
 */
export function soleRowId(rows: { processing_row_id: number; collapseMasterId?: number | null }[]): number | null {
  const ids = new Set(rows.map((r) => r.collapseMasterId ?? r.processing_row_id));
  return ids.size === 1 ? [...ids][0] : null;
}

/** Set a box's value so React sees it as typing. */
export function setBoxValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function isPrintable(e: KeyboardEvent): boolean {
  return e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey;
}

interface Burst {
  el: Element | null;
  before: string;
  keys: string;
  at: number;
}

/**
 * Listens on the whole document while the Processing page is open.
 * `onScanTakenOut` runs after a scan was taken out of a price, quantity or note box and put in the search.
 */
export function useScanRouting({ enabled = true, onScanTakenOut }: { enabled?: boolean; onScanTakenOut?: (scan: string) => void }) {
  const burst = useRef<Burst>({ el: null, before: '', keys: '', at: 0 });
  const onTakenOut = useRef(onScanTakenOut);
  onTakenOut.current = onScanTakenOut;

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const now = Date.now();

      if (isTypingBox(target)) {
        if (!isGuardedBox(target)) return;
        const box = target as HTMLInputElement | HTMLTextAreaElement;
        const b = burst.current;
        if (isPrintable(e)) {
          const gap = now - b.at;
          const goesOn = b.el === box && (gap <= SCAN_MAX_GAP_MS || (b.keys.length === 1 && gap <= SCAN_FIRST_GAP_MS));
          burst.current = goesOn
            ? { el: box, before: b.before, keys: b.keys + e.key, at: now }
            : { el: box, before: box.value, keys: e.key, at: now };
          return;
        }
        if (e.key === 'Enter' && b.el === box && b.keys.length >= SCAN_MIN_KEYS && now - b.at <= SCAN_MAX_GAP_MS * 2) {
          // A scan landed in this box: give the box back what it had and move the scan to the search.
          e.preventDefault();
          e.stopPropagation();
          setBoxValue(box, b.before);
          const search = searchInputFor(box);
          if (search) {
            search.focus();
            setBoxValue(search, b.keys);
            search.select();
          }
          burst.current = { el: null, before: '', keys: '', at: 0 };
          onTakenOut.current?.(b.keys);
        }
        return;
      }

      // Not in a typing box: a key goes to the search, replacing its words.
      if (!isPrintable(e)) return;
      if (target?.closest('[role="menu"], [role="listbox"]')) return;
      const search = searchInputFor(target);
      if (!search) return;
      e.preventDefault();
      search.focus();
      setBoxValue(search, e.key);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}
