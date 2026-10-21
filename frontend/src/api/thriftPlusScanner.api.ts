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
 *   `computeCartTotals` for a guest). The scanner shows only ThriftBucks: Thrift+ credit, kept
 *   ThriftBucks and any instant redemption are worked out at the register (B1, B3, V8).
 */
import axios from 'axios';
import {
  computeCartTotals,
  readContact,
  ThriftPlusError,
  type CodeSent,
  type Contact,
  type EmailSignIn,
  type FinishStep,
  type PriceFeel,
  type SignInPurpose,
  type TagLookup,
  type ThriftPlusCart,
  type ThriftPlusCartLine,
  type ThriftPlusHistoryEntry,
  type ThriftPlusItemCard,
  type ThriftPlusMember,
  type ThriftPlusSession,
  type SignInOptions,
} from './thriftPlusTypes';

export { computeCartTotals, readContact, ThriftPlusError };
export type {
  CodeSent,
  Contact,
  EmailSignIn,
  FinishStep,
  SignInOptions,
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

/** "in 3 minutes", "in a minute", "in a moment": a 429's wait in plain words. */
function waitWords(seconds: number | undefined): string {
  if (!seconds || seconds < 45) return 'in a moment';
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? 'in a minute' : `in ${minutes} minutes`;
}

/**
 * Join v2's answers in the app's own short, plain words (owner 2026-10-19: "SMOOTH and CLEAR and SIMPLE"), whatever
 * the server's `detail` says. Other codes keep the server's words.
 */
const PLAIN: Record<string, (retryAfter?: number) => string> = {
  MEMBERSHIP_OFF: () => 'This membership is not active. Ask at the register.',
  NOT_PENDING: () => 'Your membership is already finished. Ask at the register to change it.',
  PHOTO_NEEDED: () => 'Take your selfie first.',
  PHOTO_BAD: () => "That photo didn't work. Take your selfie again.",
  PHOTO_TOO_BIG: () => 'That photo is too big. Take your selfie again.',
  SIGNATURE_BAD: () => 'The signature did not save. Clear it and sign again.',
  TOO_MANY: (s) => `Too many codes. Try again ${waitWords(s)}.`,
  LOCKED: (s) => `Too many tries. Try again ${waitWords(s)}.`,
  CONTACT_BAD: () => 'Enter a US phone number or an email.',
  PHONE_OFF: () => 'Texts are off right now. Enter your email.',
  PHONE_TAKEN: () => 'That number is already on a Thrift+ membership. Ask at the register.',
  PHONE_SET: () => 'Ask at the register to change your number.',
  TEXTS_OFF: () => 'Texts to this number are turned off. Use Google, or ask at the register.',
  GOOGLE_OFF: () => 'Google sign-in is off. Use your email or phone.',
  GOOGLE_BAD: () => "Google didn't sign you in. Try again, or use your email or phone.",
  NAME_NEEDED: () => 'Enter your first and last name.',
};

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
    const plain = code ? PLAIN[code] : undefined;
    if (plain) return new ThriftPlusError(plain(retryAfter), code, retryAfter);
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

/** Join with a first name, last name (both required, owner 2026-10-16) and email. A new email gets a pending
 * membership and a join email. */
export async function joinThriftPlus(first: string, last: string, email: string): Promise<{ status: 'sent' }> {
  try {
    const { data } = await http.post<{ status: 'sent' }>('/join/', {
      first_name: first.trim(), last_name: last.trim(), email: email.trim(),
    });
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

// ── Join v2 (owner 2026-10-19): Google, a phone or an email; then a selfie and a signature in the app ─────────
// One box takes a phone number or an email. "Send my code" with both names is a join, without them a sign-in; the
// answer is the same whether or not the contact is a member's. A signed-in pending member then takes a selfie and
// signs the terms here, so the register only checks the photo ID.

/** The ways in this server offers. Unreachable or older: email only (no Google button, no phone). */
export async function getSignInOptions(): Promise<SignInOptions> {
  try {
    const { data } = await http.get<Partial<SignInOptions>>('/sign-in-options/');
    return { google_client_id: data.google_client_id || null, phone: data.phone === true, email: true };
  } catch {
    return { google_client_id: null, phone: false, email: true };
  }
}

/** "Send my code": a text to a phone number, or an email (its link and code) to an email. Names only for a join. */
export async function sendCode(contact: string, first = '', last = ''): Promise<CodeSent> {
  const names = first.trim() || last.trim() ? { first_name: first.trim(), last_name: last.trim() } : {};
  try {
    const { data } = await http.post<CodeSent>('/code/send/', { contact: contact.trim(), ...names });
    return data;
  } catch (err) {
    throw problem(err, 'Could not send the code. Try again.');
  }
}

/** The 6-digit code from the text or the email. */
export async function checkCode(contact: string, code: string): Promise<EmailSignIn> {
  try {
    const { data } = await http.post<EmailSignIn>('/code/check/', { contact: contact.trim(), code: code.trim() });
    return emailSignedIn(data);
  } catch (err) {
    throw problem(err, "That code didn't work. Check it and try again.");
  }
}

/** "Continue with Google": Google's ID token (Google Identity Services). A new email joins with Google's name. */
export async function signInWithGoogle(credential: string): Promise<EmailSignIn> {
  try {
    const { data } = await http.post<EmailSignIn>('/google/', { credential });
    return emailSignedIn(data);
  } catch (err) {
    throw problem(err, "Google didn't sign you in. Try again, or use your email or phone.");
  }
}

/** The member out of a session answer: `me/selfie/`, `me/signature/` and `me/phone/` answer the session payload. */
function memberOf(data: unknown): ThriftPlusMember {
  const d = data as { status?: string; member?: ThriftPlusMember };
  return d && d.status === 'member' && d.member ? d.member : (data as ThriftPlusMember);
}

/**
 * "Use this photo": the selfie of a pending member (an active member's photo is changed by staff). Send a JPEG the app
 * redrew (FinishJoining.tsx): the server reads images with Pillow and refuses HEIC.
 */
export async function uploadSelfie(photo: Blob): Promise<ThriftPlusMember> {
  const form = new FormData();
  form.append('photo', photo, photo.type === 'image/png' ? 'selfie.png' : 'selfie.jpg');
  try {
    const { data } = await http.post<ThriftPlusMember>('/me/selfie/', form);
    member = memberOf(data);
    return member;
  } catch (err) {
    throw problem(err, 'Could not save your photo. Try again.');
  }
}

/** "Sign": the signature as a PNG data URL, and the terms version it was signed under. */
export async function signTerms(signature: string, termsVersion: string): Promise<ThriftPlusMember> {
  try {
    const { data } = await http.post<ThriftPlusMember>('/me/signature/', { signature, terms_version: termsVersion });
    member = memberOf(data);
    return member;
  } catch (err) {
    throw problem(err, 'Could not save your signature. Try again.');
  }
}

// ── Phone first (owner 2026-10-20): a member with no phone adds one with a texted code ─────────────────────

/** "Send my code" for the number being added: a text with a 6-digit code to that number. */
export async function sendPhoneCode(phone: string): Promise<{ status: 'sent' }> {
  try {
    const { data } = await http.post<{ status: 'sent' }>('/me/phone/send/', { phone: phone.trim() });
    return data;
  } catch (err) {
    throw problem(err, 'Could not send the code. Try again.');
  }
}

/** The code from that text: the phone is saved, and the member (with `needs_phone` now false) comes back. */
export async function savePhone(phone: string, code: string): Promise<ThriftPlusMember> {
  try {
    const { data } = await http.post<ThriftPlusMember>('/me/phone/', { phone: phone.trim(), code: code.trim() });
    member = memberOf(data);
    return member;
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
  /** The Account tab (owner 2026-10-20): your name, phone (digits) and photo. Missing on older servers. */
  you?: { name: string; phone: string; photo_url: string | null };
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
