/**
 * Thrift+ customer scanner: the types the server answers with and the helpers the scanner and the Staff app use.
 * Money is a decimal string ("12.50"), like DRF. Moved out of the old `thriftPlusMock.ts` (critic review THR-21), which
 * is now only a fake server for tests.
 */

// ---------------------------------------------------------------------------
// Types (the contract the real API matches)
// ---------------------------------------------------------------------------

/** Dollars as a decimal string, like DRF's DecimalField: "12.50". */
export type Money = string;

/** Drives the category icon on the item card. */
export type ThriftPlusCategory =
  | 'furniture'
  | 'electronics'
  | 'appliances'
  | 'kitchen'
  | 'home_decor'
  | 'bedding'
  | 'lighting'
  | 'toys'
  | 'tools'
  | 'outdoor'
  | 'sporting'
  | 'books_media'
  | 'clothing'
  | 'baby'
  | 'other';

/** What one tag scan shows. */
export interface ThriftPlusItemCard {
  /** The code on the tag (QR or barcode), e.g. "ITM0048211". */
  sku: string;
  /** Short title for the card, 28 characters max. */
  title: string;
  category: ThriftPlusCategory;
  /** Category words under the title, e.g. "Tools". */
  category_label: string;
  /** Lines for "Details" (brand, condition, staff notes). */
  details: string[];
  /** New retail, shown struck through. null hides it. */
  retail_price: Money | null;
  /** Our tag price. Guests always pay this. */
  price: Money;
  /** Today's member reward on this item ("You'd collect +$X"). "0.00" when there is none. */
  reward: Money;
  /** price - reward. */
  member_price: Money;
  /** 18+ item: sells only to ID-verified cards. */
  age_restricted: boolean;
  /** false = AS IS: no Thrift+ 3-day returns (W6's guide, e.g. clothing and soft goods, AS IS words). */
  returnable: boolean;
  /** The store is closed on a day of the 3-day window: when returns end (owner 2026-10-20). '' or absent when not. */
  return_note?: string;
  /** false = sold or off the floor. It cannot go in the cart. */
  available: boolean;
}

export type TagLookup =
  | { status: 'found'; item: ThriftPlusItemCard }
  | { status: 'not_found'; sku: string }
  | { status: 'error'; sku: string; message: string };

export interface ThriftPlusMember {
  first_name: string;
  email: string;
  /** Optional short login name; email always works too. */
  username: string | null;
  /** Last 4 of the card code, for display. null until a card is attached at the register. */
  card_last4: string | null;
  /** ID checked at signup; required for 18+ items and returns. */
  verified_18: boolean;
  /** Kept ThriftBucks (a number, never "$"): all of them, today's too. */
  banked_rewards: Money;
  /** The part usable today (B5): today's ThriftBucks are ready tomorrow morning. Missing on older servers. */
  bucks_available?: Money;
  /** Thrift+ credit (dollars, from 3-day returns). */
  credit_balance: Money;
  /**
   * How this session signed in: an emailed link or code (owner 2026-10-15, J11), a texted code (Join v2, 2026-10-19), a
   * password, or an old card session.
   */
  session_kind?: 'password' | 'card' | 'email' | 'phone';
  /** False until they set up an email and password. (Real API only.) */
  has_login?: boolean;
  /** Thrift+ is still off: a staff or practice member is testing it. (Real API only.) */
  test_mode?: boolean;
  /**
   * False while the membership is pending: joined online, not finished at a register yet (J2, J8; owner 2026-10-15,
   * APP D9). It collects and uses nothing until then. Missing means ready (older servers).
   */
  ready?: boolean;
  /** The email was confirmed by its link or code (J11). */
  email_verified?: boolean;
  /** Join v2 (owner 2026-10-19): they have a selfie on file (taken in the app or at a register). Missing on older servers. */
  selfie?: boolean;
  /** Join v2: their signature on the terms is on file. */
  signed?: boolean;
  /** Join v2: their phone number was confirmed by a texted code. */
  phone_verified?: boolean;
  /** Join v2: what's left in the app before the register, in order. Empty when done or active; missing on older servers. */
  finish_steps?: FinishStep[];
  /** Phone first (owner 2026-10-20): no mobile number on file, so the app asks for one (with a texted code) before anything else. */
  needs_phone?: boolean;
  /** The mobile number on file, 10 digits ('' when none). Missing on older servers. */
  phone?: string;
}

/** Join v2 (owner 2026-10-19): the steps a pending member finishes in the app, then shows the QR and an ID at a register. */
export type FinishStep = 'selfie' | 'sign';

/** The ways in this server offers (`sign-in-options/`): Google only with a client id, texts only when phone is on. */
export interface SignInOptions {
  google_client_id: string | null;
  phone: boolean;
  email: true;
}

/** "Send my code": where the 6-digit code went. */
export interface CodeSent {
  status: 'sent';
  channel: 'sms' | 'email';
}

/** What a "Phone or email" box holds: a US phone number (as +1 and 10 digits) or an email (lower case); null for neither. */
export type Contact = { kind: 'phone'; value: string } | { kind: 'email'; value: string };

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Reads the one box: 10 digits (or 1 and 10 digits) in any format is a phone number; an address with an @ is an email. */
export function readContact(raw: string): Contact | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.includes('@')) return EMAIL_SHAPE.test(text) ? { kind: 'email', value: text.toLowerCase() } : null;
  if (/[^\d\s().+-]/.test(text)) return null;
  const digits = text.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return ten.length === 10 ? { kind: 'phone', value: `+1${ten}` } : null;
}

export type ThriftPlusSession =
  | { status: 'signed_out' }
  | { status: 'guest' }
  | { status: 'member'; member: ThriftPlusMember };

/** Which email a link or code came from (owner 2026-10-15, APP D9): `join` confirms the email; `sign_in` signs in. */
export type SignInPurpose = 'join' | 'sign_in';

/** A link or code sign-in: the session, and which email it came from. */
export type EmailSignIn = ThriftPlusSession & { purpose: SignInPurpose };

/**
 * An error with the server's words as its message, the server's `code` (CODE_BAD, TOO_SOON, ...) and, for a 429,
 * the seconds to wait (`retry_after`).
 */
export class ThriftPlusError extends Error {
  code?: string;
  retryAfter?: number;

  constructor(message: string, code?: string, retryAfter?: number) {
    super(message);
    this.name = 'ThriftPlusError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export interface ThriftPlusCartLine {
  item: ThriftPlusItemCard;
  qty: number;
  /** ISO timestamp. */
  added_at: string;
}

/** Trip totals. An estimate: the register is the source of truth (it prices tax, credit and kept ThriftBucks). */
export interface ThriftPlusCartTotals {
  /** Units (sum of qty). */
  item_count: number;
  /** Sum of tag prices x qty. */
  price_total: Money;
  /** The ThriftBucks this trip collects (sum of each tag's ThriftBucks x qty), kept in full by default. */
  reward_total: Money;
}

export interface ThriftPlusCart {
  lines: ThriftPlusCartLine[];
  totals: ThriftPlusCartTotals;
}

export interface ThriftPlusHistoryEntry {
  item: ThriftPlusItemCard;
  /** ISO timestamp of the latest scan of this tag. */
  scanned_at: string;
  /** What they did with the card. null = still open or closed without a swipe. */
  decision: 'added' | 'passed' | null;
}

/** "Price feel off?" quick survey. */
export type PriceFeelReason = 'too_high' | 'retail_wrong' | 'wrong_info' | 'too_low' | 'other';

export interface PriceFeel {
  reason: PriceFeelReason;
  /** "Too high" only: the "I'd buy it at" price they picked (15%, 25% or 35% under), if any. */
  would_pay: Money | null;
}

// ---------------------------------------------------------------------------
// Money helpers (cents inside, decimal strings out)
// ---------------------------------------------------------------------------

export function toCents(m: Money | null | undefined): number {
  const n = Number.parseFloat(m ?? '');
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromCents(c: number): Money {
  return (c / 100).toFixed(2);
}

/**
 * Trip totals: the units, the tag prices and the ThriftBucks the trip collects. Nothing comes off in the
 * scanner: the register works out Thrift+ credit, kept ThriftBucks and any instant redemption (B1, B3).
 */
export function computeCartTotals(lines: Array<{ item: ThriftPlusItemCard; qty: number }>): ThriftPlusCartTotals {
  let units = 0;
  let priceCents = 0;
  let rewardCents = 0;
  for (const { item, qty } of lines) {
    units += qty;
    priceCents += toCents(item.price) * qty;
    rewardCents += toCents(item.reward) * qty;
  }
  return {
    item_count: units,
    price_total: fromCents(priceCents),
    reward_total: fromCents(rewardCents),
  };
}
