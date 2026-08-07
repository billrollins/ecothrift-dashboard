/**
 * Large check-in guard (owner ruling 2026-06-11): NO low per-action cap - staff may
 * check in thousands at once. Above the threshold they confirm intent instead
 * ("You are about to check in X items"), and when labels will print they must type
 * the exact phrase `PRINT <qty>` so a stray Enter can't burn a roll of labels.
 */

export const LARGE_CHECK_IN_THRESHOLD = 100;

/** Mirrors the backend MAX_CHECK_IN_QUANTITY fat-finger backstop (explicit 400 above it). */
export const MAX_CHECK_IN_QUANTITY = 10_000;

export function isLargeCheckIn(quantity: number): boolean {
  return quantity > LARGE_CHECK_IN_THRESHOLD;
}

export function requiredPrintPhrase(quantity: number): string {
  return `PRINT ${quantity}`;
}

export function printPhraseMatches(input: string, quantity: number): boolean {
  return input.trim().replace(/\s+/g, ' ').toUpperCase() === requiredPrintPhrase(quantity);
}

export function clampCheckInQuantity(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(MAX_CHECK_IN_QUANTITY, Math.trunc(raw)));
}
