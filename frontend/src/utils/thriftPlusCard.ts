/**
 * Thrift+ card numbers at the register's scan box. A card's QR is `TP` + 12 digits, the last a
 * Luhn check digit (apps/thriftplus/services/cards.py). The printed number can be typed in groups
 * of four.
 */

function luhnDigit(body: string): string {
  let total = 0;
  [...body].reverse().forEach((ch, i) => {
    let d = Number(ch);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  });
  return String((10 - (total % 10)) % 10);
}

export function isThriftCardCode(code: string): boolean {
  return /^\d{12}$/.test(code) && luhnDigit(code.slice(0, -1)) === code.slice(-1);
}

/**
 * The card code in a scan, or null when the scan is something else (a SKU, CUS-…).
 * - A `TP` scan is always a card.
 * - Bare digits count only when Thrift+ is live at this register, so SKUs and codes keep working
 *   as before while it is dark.
 */
export function thriftCardCode(raw: string, live: boolean): string | null {
  const text = raw.trim().toUpperCase();
  const prefixed = text.startsWith('TP');
  const digits = (prefixed ? text.slice(2) : text).replace(/[\s-]/g, '');
  if (!isThriftCardCode(digits)) return null;
  return prefixed || live ? digits : null;
}
