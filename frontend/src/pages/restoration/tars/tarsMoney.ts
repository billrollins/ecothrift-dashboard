/** Shared money/quantity parsing and USD formatting for the TARS module. */

/** Parse a money string to a number. Empty, invalid, or negative input clamps to 0. */
export function parseMoney(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Parse optional money input. Returns `undefined` for empty/invalid input so
 * callers can distinguish "no value" from $0; negative values clamp to 0.
 */
export function parseMoneyOpt(raw: string | number | null | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(n, 0);
}

/** Parse a quantity string to a positive integer (invalid input defaults to 1). */
export function parseQty(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Format as USD with cents, e.g. $1,234.56. */
export function formatUsd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format as whole-dollar USD, e.g. $1,235. */
export function formatUsdWhole(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}
