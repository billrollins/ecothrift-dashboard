/** Pure helpers for the Thrift+ scanner: reading tag codes, price-feel choices, money text. */
import { fromCents, readContact, toCents, type EmailSignIn, type Money, type ThriftPlusMember } from '../../../api/thriftPlusTypes';

/**
 * What a code the camera read (or someone typed) is, so every one gets an answer (owner 2026-10-15, APP D14, D15).
 * - `tag`: a code to look up. `ours` when its shape is our tag's: ITM and 4+ digits, one of our links with ?sku=, or a
 *   Code 128 tag code. Not found, ours says "We can't find that item" (D14b); otherwise "That's not our price tag".
 *   A bare short code (an older tag, a typed number) is looked up too.
 * - `link`: a link on ecothrift.us with no ?sku=, like the terms QR on a poster (D15). `shown` is its host and path.
 * - `other`: a product barcode (EAN-13, EAN-8, UPC-A, UPC-E), other text, or a link to another site (D14a).
 */
export type ScannedCode =
  | { kind: 'tag'; sku: string; ours: boolean }
  | { kind: 'link'; href: string; shown: string }
  | { kind: 'other' };

/** The decoder's product barcode formats: read only to answer "not our tag". */
const PRODUCT_FORMATS = new Set(['ean_13', 'ean_8', 'upc_a', 'upc_e']);
/** Typed digits the length of a product barcode: EAN-8, UPC-A, EAN-13. */
const PRODUCT_LENGTHS = new Set([8, 12, 13]);
const OUR_HOST = /(^|\.)ecothrift\.us$/i;

/** An http(s) address, with or without "https://" for our own ("ecothrift.us/terms"); null for anything else. */
function webLink(text: string): URL | null {
  const href = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : /^(www\.)?ecothrift\.us([/?#]|$)/i.test(text) ? `https://${text}` : null;
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function classifyCode(raw: string | null | undefined, format?: string): ScannedCode {
  const text = (raw || '').trim();
  if (!text || (format && PRODUCT_FORMATS.has(format))) return { kind: 'other' };
  const itm = text.match(/ITM\d{4,}/i);
  if (itm) return { kind: 'tag', sku: itm[0].toUpperCase(), ours: true };
  const url = webLink(text);
  if (url) {
    const ours = OUR_HOST.test(url.hostname);
    const sku = url.searchParams.get('sku')?.trim();
    if (sku) return { kind: 'tag', sku: sku.toUpperCase(), ours };
    if (!ours) return { kind: 'other' };
    const path = url.pathname.replace(/\/+$/, '');
    return { kind: 'link', href: url.href, shown: `${url.host}${path}` };
  }
  if (/^\d+$/.test(text) && PRODUCT_LENGTHS.has(text.length)) return { kind: 'other' };
  if (/^[A-Za-z0-9-]{3,20}$/.test(text)) return { kind: 'tag', sku: text.toUpperCase(), ours: format === 'code_128' };
  return { kind: 'other' };
}

/**
 * Price tags carry the SKU as plain text ("ITM0048211") in a QR code or a
 * barcode. Also accept a URL with ?sku= and a bare short code, so older or
 * reprinted tags still look up. Returns null for codes that are not a price
 * tag (a web link, a product barcode, a long sentence).
 */
export function parseTagCode(raw: string | null | undefined): string | null {
  const code = classifyCode(raw);
  return code.kind === 'tag' ? code.sku : null;
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
  private until = 0;
  /** False during an `ignore`: repeats don't stretch it. */
  private slides = true;

  constructor(private readonly windowMs = 2000) {}

  accept(code: string, now = Date.now()): boolean {
    if (code === this.last && now < this.until) {
      if (this.slides) this.until = now + this.windowMs;
      return false;
    }
    this.last = code;
    this.until = now + this.windowMs;
    this.slides = true;
    return true;
  }

  /** Start the window over, e.g. when the item card closes. */
  hold(code: string, now = Date.now()): void {
    this.last = code;
    this.until = now + this.windowMs;
    this.slides = true;
  }

  /**
   * Refuse this code for exactly `ms`, however often it is seen meanwhile: [Scan again] on an answer card
   * (owner 2026-10-15, APP D14: "That same code is then ignored for 3 seconds").
   */
  ignore(code: string, ms: number, now = Date.now()): void {
    this.last = code;
    this.until = now + ms;
    this.slides = false;
  }
}

/**
 * ThriftBucks that work now, and the ones that work tomorrow morning (owner 2026-10-16, B5: what a trip collects is
 * used from the next day, never the same day). An older server sends no `available`: then all of it reads as ready.
 */
export function bucksReady(total: Money | number | undefined, available: Money | number | null | undefined): { now: number; tomorrow: number } {
  const all = Number(total) || 0;
  if (available == null || available === '') return { now: all, tomorrow: 0 };
  const now = Math.min(all, Number(available) || 0);
  const tomorrow = Math.round((all - now) * 100) / 100;
  return { now, tomorrow: tomorrow >= 0.005 ? tomorrow : 0 };
}

/** A pending member with steps left to do in the app (Join v2, owner 2026-10-19): a selfie, a signature. */
export function hasFinishSteps(member: ThriftPlusMember | null | undefined): boolean {
  return !!member && member.ready === false && (member.finish_steps?.length ?? 0) > 0;
}

/**
 * Where a sign-in lands (Join v2): a pending member with steps left finishes joining (`view=finish`); a join that has
 * nothing left opens the Member QR (`view=qr`); a sign-in, the scanner.
 */
export function viewAfterSignIn(r: EmailSignIn, joined = false): 'finish' | 'qr' | null {
  if (r.status === 'member' && hasFinishSteps(r.member)) return 'finish';
  return r.purpose === 'join' || joined ? 'qr' : null;
}

/** The contact a code went to, partly hidden: "(•••) •••-4567", or "d•••@example.com". */
export function maskContact(raw: string): string {
  const c = readContact(raw);
  if (!c) return raw.trim();
  if (c.kind === 'phone') return `(•••) •••-${c.value.slice(-4)}`;
  const [name, domain] = raw.trim().split('@');
  return `${name.slice(0, 1)}•••@${domain}`;
}
