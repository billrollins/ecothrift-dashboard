/**
 * The Thrift+ scanner app's real API (thrift_plus_rewards Phase 4). It has the same functions and
 * types as `thriftPlusMock.ts`, so the scanner swaps its import one-to-one.
 *
 * - **Members:** a member session is an httpOnly cookie on `/api/thriftplus/public/`
 *   (apps/thriftplus/public_views.py). This client never uses the staff `api` instance or its
 *   token: a staff login and a member session never mix.
 * - **Guests:** the cart and history stay on the phone (localStorage). Only tag lookups and signals
 *   go to the server.
 * - **Totals:** the trip's units, tag prices and the ThriftBucks it collects (the server's for a member,
 *   `computeCartTotals` from the mock for a guest). The scanner shows only ThriftBucks: Thrift+ credit, kept
 *   ThriftBucks and any instant redemption are worked out at the register (B1, B3, V8).
 */
import axios from 'axios';
import {
  computeCartTotals,
  ThriftPlusError,
  type EmailSignIn,
  type PriceFeel,
  type SignInPurpose,
  type TagLookup,
  type ThriftPlusCart,
  type ThriftPlusCartLine,
  type ThriftPlusHistoryEntry,
  type ThriftPlusItemCard,
  type ThriftPlusMember,
  type ThriftPlusSession,
} from './thriftPlusMock';

export { computeCartTotals, ThriftPlusError };
export type {
  EmailSignIn,
  PriceFeel,
  SignInPurpose,
  TagLookup,
  ThriftPlusCart,
  ThriftPlusCartLine,
  ThriftPlusHistoryEntry,
  ThriftPlusItemCard,
  ThriftPlusMember,
  ThriftPlusSession,
};

const http = axios.create({ baseURL: '/api/thriftplus/public', withCredentials: true });

// Thrift+ is behind a switch (owner, 2026-10-07). Before launch, staff open /scan?preview=<code>; the phone keeps the
// code and sends it with every call, and the server lets that phone in.
const PREVIEW_KEY = 'thriftPlus.preview';

export function setPreviewCode(code: string | null): void {
  try {
    if (code) window.localStorage.setItem(PREVIEW_KEY, code);
    else window.localStorage.removeItem(PREVIEW_KEY);
  } catch {
    // Private mode: the preview lasts this page only.
  }
}

http.interceptors.request.use((config) => {
  try {
    const code = window.localStorage.getItem(PREVIEW_KEY);
    if (code) config.headers.set('X-ThriftPlus-Preview', code);
  } catch {
    // No storage: no preview.
  }
  return config;
});

/** False while Thrift+ is off for this phone (the server answers THRIFT_PLUS_OFF). Offline counts as open. */
export async function isOpen(): Promise<boolean> {
  try {
    await http.get('/session/');
    return true;
  } catch (err) {
    const code = axios.isAxiosError(err) ? (err.response?.data as { code?: string } | undefined)?.code : undefined;
    return code !== 'THRIFT_PLUS_OFF';
  }
}

const LS = {
  guest: 'thriftPlus.real.guest',
  cart: 'thriftPlus.real.guestCart',
  history: 'thriftPlus.real.guestHistory',
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the guest cart just doesn't persist.
  }
}

/**
 * The server's message, or a plain fallback. It carries the server's `code`, and for a 429 the seconds to wait
 * (`retry_after`, or the Retry-After header) as `retryAfter`.
 */
function problem(err: unknown, fallback: string): ThriftPlusError {
  if (axios.isAxiosError(err)) {
    const body = (err.response?.data ?? {}) as { detail?: unknown; code?: unknown; retry_after?: unknown };
    const code = typeof body.code === 'string' ? body.code : undefined;
    const wait = Number(body.retry_after ?? err.response?.headers?.['retry-after']);
    const retryAfter = Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : undefined;
    if (typeof body.detail === 'string' && body.detail) return new ThriftPlusError(body.detail, code, retryAfter);
    if (!err.response) return new ThriftPlusError('Could not reach the store. Check your signal and try again.');
    return new ThriftPlusError(fallback, code, retryAfter);
  }
  return new ThriftPlusError(fallback);
}

let member: ThriftPlusMember | null = null;

async function isMember(): Promise<boolean> {
  if (member) return true;
  const s = await getSession();
  return s.status === 'member';
}

// ── Session ─────────────────────────────────────────────────────────────────

/** The scanner's settings (owner 2026-10-10): the price as the big number (the default). */
export interface ScannerSettings {
  priceFirst: boolean;
}

export async function fetchScannerSettings(): Promise<ScannerSettings> {
  try {
    const { data } = await http.get<{ price_first?: boolean }>('/session/');
    return { priceFirst: data.price_first !== false };
  } catch {
    return { priceFirst: true };
  }
}

export async function getSession(): Promise<ThriftPlusSession> {
  try {
    const { data } = await http.get<ThriftPlusSession>('/session/');
    if (data.status === 'member') {
      member = data.member;
      return data;
    }
  } catch {
    // Offline: fall through to what the phone knows.
  }
  member = null;
  return readJson(LS.guest, false) ? { status: 'guest' } : { status: 'signed_out' };
}

export async function signIn(login: string, password: string): Promise<ThriftPlusSession> {
  try {
    const { data } = await http.post<ThriftPlusSession>('/session/password/', { login: login.trim(), password });
    if (data.status === 'member') member = data.member;
    writeJson(LS.guest, null);
    return data;
  } catch (err) {
    throw problem(err, "That email or password isn't right.");
  }
}

// ── Email sign-in and joining (owner 2026-10-15, APP D9; rulebook J8, J11) ────
// No passwords for members and no texts: every email carries a link (`/scan?signin=<token>`) and a 6-digit code, each
// works once for 15 minutes. "Sent" is the same answer whether or not the email is a member's.

/** Join with a name and email. A new email gets a pending membership and a join email. */
export async function joinThriftPlus(name: string, email: string): Promise<{ status: 'sent' }> {
  try {
    const { data } = await http.post<{ status: 'sent' }>('/join/', { name: name.trim(), email: email.trim() });
    return data;
  } catch (err) {
    throw problem(err, 'Could not send the email. Try again.');
  }
}

/** "Email me a link": a member (active or pending) gets a sign-in email. */
export async function requestSignInEmail(email: string): Promise<{ status: 'sent' }> {
  try {
    const { data } = await http.post<{ status: 'sent' }>('/session/email/', { email: email.trim() });
    return data;
  } catch (err) {
    throw problem(err, 'Could not send the email. Try again.');
  }
}

function emailSignedIn(data: EmailSignIn): EmailSignIn {
  if (data.status === 'member') member = data.member;
  writeJson(LS.guest, null);
  return data;
}

/** The email's link opened `/scan?signin=<token>`: sign in (and confirm the email). `purpose` says which email it was. */
export async function signInWithLink(token: string): Promise<EmailSignIn> {
  try {
    const { data } = await http.post<EmailSignIn>('/session/link/', { token });
    return emailSignedIn(data);
  } catch (err) {
    throw problem(err, "That link didn't work. Send a new one.");
  }
}

/** The 6-digit code from the email, typed on the screen that asked for it. */
export async function signInWithCode(email: string, code: string): Promise<EmailSignIn> {
  try {
    const { data } = await http.post<EmailSignIn>('/session/code/', { email: email.trim(), code: code.trim() });
    return emailSignedIn(data);
  } catch (err) {
    throw problem(err, "That code didn't work. Check it and try again.");
  }
}

export async function continueAsGuest(): Promise<ThriftPlusSession> {
  writeJson(LS.guest, true);
  member = null;
  return { status: 'guest' };
}

export async function signOut(): Promise<ThriftPlusSession> {
  try {
    await http.post('/session/sign-out/');
  } catch {
    // Signing out locally still works offline.
  }
  member = null;
  writeJson(LS.guest, null);
  writeJson(LS.cart, null);
  writeJson(LS.history, null);
  return { status: 'signed_out' };
}

// ── Guest cart and history (on the phone) ──────────────────────────────────

function guestLines(): ThriftPlusCartLine[] {
  return readJson<ThriftPlusCartLine[]>(LS.cart, []).filter((l) => l?.item?.sku && l.qty > 0);
}

function guestCart(lines: ThriftPlusCartLine[] = guestLines()): ThriftPlusCart {
  return { lines, totals: computeCartTotals(lines) };
}

function guestHistory(): ThriftPlusHistoryEntry[] {
  return readJson<ThriftPlusHistoryEntry[]>(LS.history, []);
}

function touchGuestHistory(item: ThriftPlusItemCard, decision?: 'added' | 'passed'): void {
  const rows = guestHistory().filter((e) => e.item.sku !== item.sku);
  const prior = guestHistory().find((e) => e.item.sku === item.sku);
  rows.unshift({ item, scanned_at: new Date().toISOString(), decision: decision ?? prior?.decision ?? null });
  writeJson(LS.history, rows.slice(0, 300));
}

// ── Tags, cart, signals ─────────────────────────────────────────────────────

/** A tag to pick in the scanner's test mode (staff only, owner 2026-10-10). */
export interface TestTag {
  sku: string;
  title: string;
  price: string;
  reward: string;
}

export async function fetchTestTags(): Promise<TestTag[]> {
  const { data } = await http.get<{ tags: TestTag[] }>('/test-tags/');
  return data.tags;
}

/** One tag. `again`: a second look from This trip (APP D12), which the server doesn't count as a scan. */
export async function lookupTag(sku: string, { again = false }: { again?: boolean } = {}): Promise<TagLookup> {
  const code = sku.trim().toUpperCase();
  try {
    const url = `/tag/${encodeURIComponent(code)}/`;
    const { data } = again ? await http.get<TagLookup>(url, { params: { again: 1 } }) : await http.get<TagLookup>(url);
    if (data.status === 'found' && !member) touchGuestHistory(data.item);
    return data;
  } catch {
    return { status: 'error', sku: code, message: 'Could not reach the store. Check your signal and scan again.' };
  }
}

export async function getCart(): Promise<ThriftPlusCart> {
  if (!(await isMember())) return guestCart();
  const { data } = await http.get<ThriftPlusCart>('/cart/');
  return data;
}

export async function addToCart(item: ThriftPlusItemCard): Promise<ThriftPlusCart> {
  if (!item.available) throw new Error(`${item.title} is no longer on the floor.`);
  if (!(await isMember())) {
    const lines = guestLines();
    if (!lines.some((l) => l.item.sku === item.sku)) lines.unshift({ item, qty: 1, added_at: new Date().toISOString() });
    writeJson(LS.cart, lines);
    touchGuestHistory(item, 'added');
    void http.post('/added/', { sku: item.sku }).catch(() => undefined); // counts the add, anonymously
    return guestCart(lines);
  }
  try {
    const { data } = await http.post<ThriftPlusCart>('/cart/add/', { sku: item.sku });
    return data;
  } catch (err) {
    throw problem(err, 'Could not add that. Try again.');
  }
}

export async function setCartQty(sku: string, qty: number): Promise<ThriftPlusCart> {
  const n = Math.max(0, Math.min(99, Math.floor(qty)));
  if (!(await isMember())) {
    const lines = guestLines().map((l) => (l.item.sku === sku ? { ...l, qty: n } : l)).filter((l) => l.qty > 0);
    writeJson(LS.cart, lines);
    return guestCart(lines);
  }
  const { data } = await http.post<ThriftPlusCart>('/cart/qty/', { sku, qty: n });
  return data;
}

export async function removeFromCart(sku: string): Promise<ThriftPlusCart> {
  return setCartQty(sku, 0);
}

export async function clearCart(): Promise<ThriftPlusCart> {
  if (!(await isMember())) {
    writeJson(LS.cart, []);
    return guestCart([]);
  }
  const { data } = await http.post<ThriftPlusCart>('/cart/clear/');
  return data;
}

export async function passItem(sku: string): Promise<void> {
  if (!member) {
    const prior = guestHistory().find((e) => e.item.sku === sku);
    if (prior) touchGuestHistory(prior.item, 'passed');
  }
  await http.post('/pass/', { sku }).catch(() => undefined);
}

export async function getHistory(): Promise<ThriftPlusHistoryEntry[]> {
  if (!(await isMember())) return guestHistory();
  const { data } = await http.get<ThriftPlusHistoryEntry[]>('/history/');
  return data;
}

/** "Clear my scans" (owner 2026-10-10): members' old scans are hidden (kept on the server); a guest's are emptied. */
export async function clearHistory(): Promise<ThriftPlusHistoryEntry[]> {
  if (!(await isMember())) {
    writeJson(LS.history, []);
    return [];
  }
  const { data } = await http.post<ThriftPlusHistoryEntry[]>('/history/clear/');
  return data;
}

export async function sendPriceFeel(sku: string, feel: PriceFeel): Promise<void> {
  await http.post('/feel/', { sku, reason: feel.reason, would_pay: feel.would_pay }).catch(() => undefined);
}

// ── The portal ──────────────────────────────────────────────────────────────

export interface ThriftPlusMe {
  /** Kept ThriftBucks (a number, never "$"): all of them, today's too. */
  banked: string;
  /** The part usable today (B5); today's are ready tomorrow morning. */
  available?: string;
  /** Thrift+ credit (dollars). */
  credit: string;
  people: { id: number; first_name: string; role: 'primary' | 'secondary'; verified_18: boolean; is_you: boolean; cards: { id: number; last4: string; status: string }[] }[];
  /** Recent ThriftBucks ('bank') and Thrift+ credit rows. Older servers may send retired kinds; the screen skips them. */
  money: { kind: 'bank' | 'credit' | string; amount: string; reason: string; created_at: string }[];
  /** Kept ThriftBucks in the order they are used: soonest use-by first (Thrift+ credit is `credit`, used before these). */
  rewards?: { amount: string; earned_on: string; use_by: string; past_due: boolean; usable_from?: string; usable?: boolean }[];
  /** False for an old card session: changes need the email and password. */
  can_change: boolean;
  /** Your email (T74): receipts and updates follow the address; store news can be turned off. */
  emails?: { updates: boolean; news: boolean; has_email: boolean; note: string };
}

/** The code behind the app's Member QR (owner 2026-10-14: no card, APP D6): the QR the register scans. */
export interface MyCard {
  code: string;
  /** "4021 5583 1907", for a cashier to type. */
  display: string;
  /** What the QR holds: TP + the 12 digits (the register's card scan reads it as is). */
  qr: string;
  first_name: string;
  /** False until the account is finished at a register (J2). */
  ready: boolean;
}

export async function getMyCard(): Promise<MyCard> {
  const { data } = await http.get<MyCard>('/me/card/');
  return data;
}

export async function getMe(): Promise<ThriftPlusMe> {
  const { data } = await http.get<ThriftPlusMe>('/me/');
  return data;
}

/** Turn your store news emails off (any sign-in) or back on (the password sign-in). */
export async function setMyNews(on: boolean): Promise<ThriftPlusMe> {
  try {
    const { data } = await http.post<ThriftPlusMe>('/me/emails/', { news: on });
    return data;
  } catch (err) {
    throw problem(err, 'Could not change that. Ask at the register.');
  }
}

/** The primary takes the second adult off, or the second adult leaves. */
export async function removePerson(personId: number): Promise<ThriftPlusMe | { status: 'signed_out' }> {
  try {
    const { data } = await http.post<ThriftPlusMe | { status: 'signed_out' }>('/me/remove-person/', { person: personId });
    return data;
  } catch (err) {
    throw problem(err, 'Could not do that. Ask at the register.');
  }
}
