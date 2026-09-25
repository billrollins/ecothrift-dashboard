/** Pure helpers for the Thrift+ scanner: reading tag codes, price-feel choices, money text. */
import { fromCents, toCents, type Money } from '../../../api/thriftPlusMock';

/**
 * Price tags carry the SKU as plain text ("ITM0048211") in a QR code or a
 * barcode. Also accept a URL with ?sku= and a bare short code, so older or
 * reprinted tags still look up. Returns null for codes that are clearly not
 * a price tag (a web link, a long sentence).
 */
export function parseTagCode(raw: string | null | undefined): string | null {
  const text = (raw || '').trim();
  if (!text) return null;
  const itm = text.match(/ITM\d{4,}/i);
  if (itm) return itm[0].toUpperCase();
  try {
    const sku = new URL(text).searchParams.get('sku');
    if (sku?.trim()) return sku.trim().toUpperCase();
    return null;
  } catch {
    // Not a URL.
  }
  return /^[A-Za-z0-9-]{3,20}$/.test(text) ? text.toUpperCase() : null;
}

export interface WouldPayChoice {
  under_pct: 15 | 25 | 35;
  would_pay: Money;
}

/**
 * "Too high" offers three "I'd buy it at" prices: 15%, 25% and 35% under our
 * price. Whole dollars from $10 up, quarters below, never the same twice.
 */
export function wouldPayChoices(price: Money): WouldPayChoice[] {
  const cents = toCents(price);
  const step = cents >= 1000 ? 100 : 25;
  const out: WouldPayChoice[] = [];
  const seen = new Set<number>();
  for (const pct of [15, 25, 35] as const) {
    const target = Math.max(step, Math.round((cents * (100 - pct)) / 100 / step) * step);
    if (target >= cents || seen.has(target)) continue;
    seen.add(target);
    out.push({ under_pct: pct, would_pay: fromCents(target) });
  }
  return out;
}

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** "$12.50"; "$10" when there are no cents and `trim` is set. */
export function money(m: Money | number, trim = false): string {
  const cents = typeof m === 'number' ? m : toCents(m);
  if (trim && cents % 100 === 0) return wholeDollars.format(cents / 100);
  return dollars.format(cents / 100);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-09" -> "September". */
export function monthName(month: string): string {
  const m = Number.parseInt(month.slice(5, 7), 10);
  return MONTHS[m - 1] ?? month;
}

/** "2026-10-01" -> "Oct 1". */
export function shortDate(isoDay: string): string {
  const m = Number.parseInt(isoDay.slice(5, 7), 10);
  const d = Number.parseInt(isoDay.slice(8, 10), 10);
  const name = MONTHS[m - 1];
  return name ? `${name.slice(0, 3)} ${d}` : isoDay;
}

/**
 * Stops the same tag from reopening while it is still in view. A repeat
 * inside the window is refused and restarts the window, so the tag has to
 * leave the frame for `windowMs` before it scans again.
 */
export class ScanGate {
  private last = '';
  private at = 0;

  constructor(private readonly windowMs = 2000) {}

  accept(code: string, now = Date.now()): boolean {
    if (code === this.last && now - this.at < this.windowMs) {
      this.at = now;
      return false;
    }
    this.last = code;
    this.at = now;
    return true;
  }

  /** Start the window over, e.g. when the item card closes. */
  hold(code: string, now = Date.now()): void {
    this.last = code;
    this.at = now;
  }
}
