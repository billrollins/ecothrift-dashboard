/**
 * The Thrift+ scanner app's real API (thrift_plus_rewards Phase 4). It has the same functions and
 * types as `thriftPlusMock.ts`, so the scanner swaps its import one-to-one.
 *
 * - **Members:** a member session is an httpOnly cookie on `/api/thriftplus/public/`
 *   (apps/thriftplus/public_views.py). This client never uses the staff `api` instance or its
 *   token: a staff login and a member session never mix.
 * - **Guests:** the cart and history stay on the phone (localStorage). Only tag lookups and signals
 *   go to the server.
 * - **Totals:** the server computes a member's cart totals with the register's math (cover first,
 *   then instant or banking at 1.05x). A guest's are `computeCartTotals` from the mock.
 */
import axios from 'axios';
import {
  computeCartTotals,
  type PriceFeel,
  type RewardChoice,
  type TagLookup,
  type ThriftPlusCart,
  type ThriftPlusCartLine,
  type ThriftPlusHistoryEntry,
  type ThriftPlusItemCard,
  type ThriftPlusMember,
  type ThriftPlusSession,
} from './thriftPlusMock';

export { computeCartTotals };
export type {
  PriceFeel,
  RewardChoice,
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

/** The server's message, or a plain fallback. */
function problem(err: unknown, fallback: string): Error {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string' && detail) return new Error(detail);
    if (!err.response) return new Error('Could not reach the store. Check your signal and try again.');
  }
  return new Error(fallback);
}

let member: ThriftPlusMember | null = null;

async function isMember(): Promise<boolean> {
  if (member) return true;
  const s = await getSession();
  return s.status === 'member';
}

// ── Session ─────────────────────────────────────────────────────────────────

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

export async function requestPasswordReset(email: string): Promise<{ sent_to: string }> {
  try {
    const { data } = await http.post<{ sent_to: string }>('/session/reset/', { email: email.trim() });
    return data;
  } catch (err) {
    throw problem(err, 'Could not send the email. Try again.');
  }
}

/** The link in the reset email opens `/scan?reset=<token>`; this sets the new password and signs in. */
export async function confirmPasswordReset(token: string, password: string): Promise<ThriftPlusSession> {
  try {
    const { data } = await http.post<ThriftPlusSession>('/session/reset/confirm/', { token, password });
    if (data.status === 'member') member = data.member;
    return data;
  } catch (err) {
    throw problem(err, 'That reset link has expired. Ask for a new one.');
  }
}

export async function signInWithCard(cardCode: string, phoneLast4: string): Promise<ThriftPlusSession> {
  try {
    const { data } = await http.post<ThriftPlusSession>('/session/card/', { card_code: cardCode.trim(), phone_last4: phoneLast4.trim() });
    if (data.status === 'member') member = data.member;
    writeJson(LS.guest, null);
    return data;
  } catch (err) {
    throw problem(err, "That card and phone number don't match.");
  }
}

/** A member signed in with their card sets up an email and password (only if they have none). */
export async function setUpLogin(email: string, password: string, username?: string): Promise<ThriftPlusSession> {
  try {
    const { data } = await http.post<ThriftPlusSession>('/login/', { email: email.trim(), password, username: username?.trim() || undefined });
    if (data.status === 'member') member = data.member;
    return data;
  } catch (err) {
    throw problem(err, 'Could not set up your login.');
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
  return { lines, reward_choice: null, totals: computeCartTotals(lines, null, null) };
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

export async function lookupTag(sku: string): Promise<TagLookup> {
  const code = sku.trim().toUpperCase();
  try {
    const { data } = await http.get<TagLookup>(`/tag/${encodeURIComponent(code)}/`);
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

/** Members only: the trip's bank-or-rebate answer. The register sees it when the card is scanned. */
export async function setRewardChoice(choice: RewardChoice): Promise<ThriftPlusCart> {
  if (!(await isMember())) return guestCart();
  const { data } = await http.post<ThriftPlusCart>('/cart/choice/', { choice });
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

export async function sendPriceFeel(sku: string, feel: PriceFeel): Promise<void> {
  await http.post('/feel/', { sku, reason: feel.reason, would_pay: feel.would_pay }).catch(() => undefined);
}

// ── The portal ──────────────────────────────────────────────────────────────

export interface ThriftPlusMe {
  banked: string;
  credit: string;
  cover: ThriftPlusMember['cover'];
  people: { id: number; first_name: string; role: 'primary' | 'secondary'; verified_18: boolean; is_you: boolean; cards: { id: number; last4: string; status: string }[] }[];
  money: { kind: 'cover' | 'bank' | 'credit'; amount: string; reason: string; created_at: string }[];
  /** False for a card session: changes need the email and password. */
  can_change: boolean;
  /** Your email (T74): receipts and updates follow the address; store news can be turned off. */
  emails?: { updates: boolean; news: boolean; has_email: boolean; note: string };
}

export async function getMe(): Promise<ThriftPlusMe> {
  const { data } = await http.get<ThriftPlusMe>('/me/');
  return data;
}

export async function reportCardLost(cardId: number): Promise<ThriftPlusMe> {
  try {
    const { data } = await http.post<ThriftPlusMe>('/me/card-lost/', { card: cardId });
    return data;
  } catch (err) {
    throw problem(err, 'Could not stop that card. Ask at the register.');
  }
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
