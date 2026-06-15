import type { FocusEvent, WheelEvent } from 'react';

/** Select entire field value on focus (click or tab) for fast overwrite while transcribing. */
export function selectInputContentsOnFocus(
  e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
): void {
  const el = e.target;
  if (typeof el.select === 'function') {
    requestAnimationFrame(() => el.select());
  }
}

/** Prevent scroll wheel from changing number input values while scrolling the modal. */
export function preventWheelChangeNumber(e: WheelEvent<HTMLInputElement>): void {
  e.preventDefault();
}

/** Strip currency formatting from pasted or raw text; keep digits and one decimal point. */
export function sanitizeDecimalPaste(raw: string): string {
  const stripped = raw.replace(/[$,\s]/g, '').replace(/\r?\n/g, '');
  const parts = stripped.split('.');
  if (parts.length <= 1) return stripped.replace(/[^\d]/g, '');
  const head = parts[0]?.replace(/[^\d]/g, '') ?? '';
  const tail = parts.slice(1).join('').replace(/[^\d]/g, '').slice(0, 2);
  if (tail) return head ? `${head}.${tail}` : `.${tail}`;
  if (stripped.endsWith('.')) return head ? `${head}.` : '.';
  return head;
}

/** Live money input mask: digits + one decimal (max 2dp), thousands-grouped display. */
export function formatMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [intPart = '', ...rest] = cleaned.split('.');
  const dec = rest.join('').slice(0, 2);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length > 0 ? `${grouped}.${dec}` : grouped;
}

/** Blurred money display — always two decimal places with grouping. */
export function formatMoneyDisplay(raw: string): string {
  const cleaned = sanitizeDecimalPaste(raw.trim());
  if (!cleaned) return '';
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return formatMoneyInput(raw);
  return formatMoneyInput(n.toFixed(2));
}

/** Normalize a raw money string for API storage (no commas, two decimal places when non-empty). */
export function normalizeMoneyInput(raw: string): string {
  const cleaned = sanitizeDecimalPaste(raw.trim());
  if (!cleaned) return '';
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return cleaned;
  return n.toFixed(2);
}

/** Compare money strings for semantic equality (ignores commas / formatting). */
export function moneyValuesEqual(a: string, b: string): boolean {
  const na = Number.parseFloat(sanitizeDecimalPaste(a.trim() || '0'));
  const nb = Number.parseFloat(sanitizeDecimalPaste(b.trim() || '0'));
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return a.trim() === b.trim();
}
