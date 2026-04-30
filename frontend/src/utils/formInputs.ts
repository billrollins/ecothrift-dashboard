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
  const tail = parts.slice(1).join('').replace(/[^\d]/g, '');
  return tail ? `${head}.${tail}` : head;
}
