/**
 * Money fields that take a sum, such as `412.50+38` (owner, intake_updates Phase 2).
 * The text is split on `+`, each part is read as a number ($, commas and spaces ignored), and the parts are added.
 */
export interface MoneySum {
  /** The sum in dollars, rounded to cents; null when the field is empty or a part is bad. */
  value: number | null;
  /** Plain words for the person typing; null when the field is fine. */
  error: string | null;
}

const PART = /^(\d+(\.\d*)?|\.\d+)$/;

export function parseMoneySum(raw: string | null | undefined): MoneySum {
  const text = (raw ?? '').trim();
  if (!text) return { value: null, error: null };
  let cents = 0;
  for (const piece of text.split('+')) {
    const part = piece.replace(/[$,\s]/g, '');
    if (!PART.test(part)) {
      return { value: null, error: part ? `"${piece.trim()}" is not a number` : 'Each part of a sum needs a number' };
    }
    cents += Math.round(Number.parseFloat(part) * 100);
  }
  return { value: cents / 100, error: null };
}

/** What the field shows after you leave it: the sum with two decimals (unchanged when it has an error). */
export function moneySumDisplay(raw: string): string {
  const { value, error } = parseMoneySum(raw);
  if (error || value === null) return raw;
  return value.toFixed(2);
}

/** Pasted text keeps digits, the point and `+`. */
export function sanitizeMoneySumPaste(raw: string): string {
  return raw.replace(/[^0-9.+]/g, '');
}
