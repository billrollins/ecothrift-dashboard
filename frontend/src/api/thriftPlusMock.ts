/**
 * Thrift+ customer price scanner: a fake server, for tests only (critic review THR-21: no live file is named
 * "mock"). The live types and helpers are in `thriftPlusTypes.ts`; the live API is `thriftPlusScanner.api.ts`.
 * Below is the original note.
 *
 * Thrift+ customer price scanner: the data module.
 *
 * Everything the scanner reads or writes goes through the functions in the
 * "Contract" section, so the real Thrift+ API (data_platform, 10/07) replaces
 * this file one-to-one: same function names, same types, same shapes. Types
 * follow the DRF conventions used elsewhere (snake_case, money as decimal
 * strings like "12.50").
 *
 * Live today: tag lookup pulls the real item from inventory
 * (GET /api/inventory/items/lookup/<sku>/, public). Mock today: the customer
 * account (sign-in, kept ThriftBucks, Thrift+ credit), the ThriftBucks (a random
 * 0% to 80% of the price, fixed per tag), and the cart and history (kept on this
 * phone). The scanner shows only ThriftBucks: redeeming them instantly is done
 * at the register (B1, V8), so there is no choice here.
 *
 * `thriftPlusMockControls` at the bottom is mock-only. The real API drops it.
 */
import axios from 'axios';
import { apiPublic } from './client';
import {
  readContact,
  ThriftPlusError,
  toCents,
  fromCents,
  computeCartTotals,
  type Money,
  type ThriftPlusCategory,
  type ThriftPlusItemCard,
  type TagLookup,
  type ThriftPlusMember,
  type FinishStep,
  type SignInOptions,
  type CodeSent,
  type Contact,
  type ThriftPlusSession,
  type SignInPurpose,
  type EmailSignIn,
  type ThriftPlusCartLine,
  type ThriftPlusCartTotals,
  type ThriftPlusCart,
  type ThriftPlusHistoryEntry,
  type PriceFeelReason,
  type PriceFeel,
} from './thriftPlusTypes';
// The tests that use this file as a fake server import the types from here too.
export * from './thriftPlusTypes';

// ---------------------------------------------------------------------------
// Mapping a live inventory item to a card
// ---------------------------------------------------------------------------

/** GET /api/inventory/items/lookup/<sku>/ (ItemPublicSerializer). */
interface PublicItemDTO {
  sku: string;
  title: string;
  brand: string;
  category: string;
  price: string;
  status: string;
  condition: string;
  source: string;
  estimated_retail_value: string | null;
  savings_pct: number | null;
  processing_notes: string | null;
}

/** Whole words only, plural allowed ("hat" must not match "that"). First match wins. */
const words = (list: string) => new RegExp(String.raw`\b(${list})(e?s)?\b`, 'i');

const CATEGORY_WORDS: Array<[ThriftPlusCategory, RegExp]> = [
  ['clothing', words('clothing|clothes|apparel|shoe|boot|sneaker|shirt|jacket|dress|pant|jean|coat|hat|handbag|purse|sweater|hoodie')],
  ['bedding', words('bedding|quilt|comforter|sheet|pillow|blanket|towel|linen|curtain|bath')],
  ['baby', words('baby|babie|infant|toddler|stroller|nursery')],
  ['toys', words('toy|game|lego|puzzle|doll')],
  ['tools', words('tool|drill|saw|hardware|wrench|dewalt|milwaukee|ryobi|power tool')],
  ['outdoor', words('outdoor|patio|garden|lawn|grill|yard')],
  ['sporting', words('sport|sporting good|fitness|exercise|bike|bicycle|camping|fishing|golf')],
  ['lighting', words('lighting|light|lamp|chandelier|sconce')],
  ['appliances', words('appliance|vacuum|microwave|washer|dryer|fridge|refrigerator|air fryer|heater|fan')],
  ['kitchen', words('kitchen|cookware|bakeware|dining|dish|cup|mug|blender|mixer|coffee|pan|pot|cutlery|kitchen & dining')],
  ['electronics', words('electronic|tv|television|computer|laptop|phone|audio|speaker|camera|headphone|gaming|video game')],
  ['furniture', words('furniture|chair|table|desk|sofa|couch|dresser|cabinet|shelf|shelves|bed frame|ottoman|bookcase')],
  ['books_media', words('book|media|dvd|vinyl|record|cd')],
  ['home_decor', words('decor|home decor|wall art|frame|vase|rug|mirror|candle')],
];

const CATEGORY_LABELS: Record<ThriftPlusCategory, string> = {
  furniture: 'Furniture',
  electronics: 'Electronics',
  appliances: 'Appliances',
  kitchen: 'Kitchen',
  home_decor: 'Home decor',
  bedding: 'Bedding and linens',
  lighting: 'Lighting',
  toys: 'Toys and games',
  tools: 'Tools',
  outdoor: 'Outdoor',
  sporting: 'Sports and outdoors',
  books_media: 'Books and media',
  clothing: 'Clothing',
  baby: 'Baby',
  other: 'Home goods',
};

const CONDITION_LABELS: Record<string, string> = {
  new: 'New',
  like_new: 'Like new',
  very_good: 'Very good',
  good: 'Good',
  fair: 'Fair',
  salvage: 'For parts',
};

export function categoryFor(text: string): ThriftPlusCategory {
  for (const [key, re] of CATEGORY_WORDS) if (re.test(text)) return key;
  return 'other';
}

/**
 * The card title in 28 characters or fewer, cut at a whole word and never
 * with an ellipsis (the real API will send an AI-written short title).
 */
export function shortTitle(title: string, max = 28): string {
  const clean = title.replace(/\s+/g, ' ').trim() || 'Item';
  if (clean.length <= max) return clean;
  let out = '';
  for (const w of clean.split(' ')) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > max) break;
    out = next;
  }
  // A first word longer than the limit is cut hard rather than dropped.
  return (out || clean.slice(0, max)).replace(/[\s,;:/(&-]+$/, '');
}

function hashCode(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Mock reward: a random 0% to 80% of the price, fixed per tag so a rescan shows
 * the same number. Rounded down to a dime. The real reward engine replaces this.
 */
export function mockRewardCents(sku: string, priceCents: number): number {
  const pct = (hashCode(sku) % 8001) / 10000;
  return Math.floor((priceCents * pct) / 10) * 10;
}

function cardFrom(
  base: Omit<ThriftPlusItemCard, 'member_price' | 'reward' | 'category_label'> & { reward?: Money },
): ThriftPlusItemCard {
  const priceCents = toCents(base.price);
  const rewardCents = base.reward != null ? toCents(base.reward) : mockRewardCents(base.sku, priceCents);
  return {
    ...base,
    category_label: CATEGORY_LABELS[base.category],
    reward: fromCents(rewardCents),
    member_price: fromCents(priceCents - rewardCents),
  };
}

export function itemFromPublic(dto: PublicItemDTO): ThriftPlusItemCard {
  const category = categoryFor(`${dto.category} ${dto.title}`);
  const condition = CONDITION_LABELS[dto.condition] ?? '';
  const details = [dto.brand?.trim(), condition, dto.processing_notes?.trim()].filter(
    (s): s is string => !!s,
  );
  const unavailable = ['sold', 'scrapped', 'lost'].includes(dto.status);
  const finalSale =
    dto.condition === 'salvage' || category === 'clothing' || category === 'bedding';
  const retail = toCents(dto.estimated_retail_value) > toCents(dto.price) ? dto.estimated_retail_value : null;
  return cardFrom({
    sku: dto.sku,
    title: shortTitle(dto.title),
    category,
    details: details.length ? details : [CATEGORY_LABELS[category]],
    retail_price: retail ? fromCents(toCents(retail)) : null,
    price: fromCents(toCents(dto.price)),
    age_restricted: false,
    returnable: !finalSale,
    available: !unavailable,
  });
}

// ---------------------------------------------------------------------------
// Sample tags (work without a database, e.g. on a laptop)
// ---------------------------------------------------------------------------

type Sample = Omit<ThriftPlusItemCard, 'member_price' | 'category_label' | 'age_restricted' | 'returnable' | 'available'> &
  Partial<Pick<ThriftPlusItemCard, 'age_restricted' | 'returnable' | 'available'>>;

const SAMPLES: Sample[] = [
  { sku: 'TP0000001', title: 'Cordless Drill Kit', category: 'tools', details: ['DeWalt 20V', 'Two batteries and charger', 'Tested, works'], retail_price: '100.00', price: '60.00', reward: '15.00' },
  { sku: 'TP0000002', title: 'KitchenAid stand mixer', category: 'kitchen', details: ['KitchenAid, 5 qt', 'Tested, works'], retail_price: '449.99', price: '179.99', reward: '32.40' },
  { sku: 'TP0000003', title: 'Mid-century accent chair', category: 'furniture', details: ['Walnut legs, teal fabric'], retail_price: '289.00', price: '89.99', reward: '12.00' },
  { sku: 'TP0000004', title: 'Samsung 50 in 4K TV', category: 'electronics', details: ['Samsung, remote included', 'Tested, works'], retail_price: '399.99', price: '199.99', reward: '26.00' },
  { sku: 'TP0000005', title: 'LEGO Classic brick box', category: 'toys', details: ['LEGO, 790 pieces', 'Sealed box'], retail_price: '59.99', price: '24.99', reward: '3.60' },
  { sku: 'TP0000006', title: 'Brass table lamp', category: 'lighting', details: ['Linen shade, 26 in'], retail_price: '79.99', price: '19.99', reward: '0.00' },
  { sku: 'TP0000007', title: 'Nike running shoes, men 10', category: 'clothing', details: ['Nike', 'Like new'], retail_price: '120.00', price: '29.99', reward: '4.00', returnable: false },
  { sku: 'TP0000008', title: 'Patio set, 4 pc', category: 'outdoor', details: ['Wicker, cushions included'], retail_price: '599.00', price: '149.99', reward: '18.00', available: false },
];

const SAMPLE_CARDS = new Map(
  SAMPLES.map((s) => [
    s.sku,
    cardFrom({ ...s, age_restricted: s.age_restricted ?? false, returnable: s.returnable ?? true, available: s.available ?? true }),
  ]),
);

// ---------------------------------------------------------------------------
// Mock state (this phone's localStorage; the real API keeps it per account)
// ---------------------------------------------------------------------------

const HISTORY_MAX = 300;
const LS = {
  session: 'thriftPlus.session',
  cart: 'thriftPlus.cart',
  history: 'thriftPlus.history',
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
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the demo just won't survive a reload.
  }
}

interface StoredSession {
  status: 'guest' | 'member';
  email?: string;
  username?: string | null;
  /** Email sign-in (owner 2026-10-15, APP D9): who joined, and whether they're finished at a register. */
  first_name?: string;
  ready?: boolean;
  kind?: 'password' | 'email' | 'phone';
  /** Join v2: the selfie and signature taken in the app, and a phone confirmed by its code. */
  selfie?: boolean;
  signed?: boolean;
  phone_verified?: boolean;
  /** Join v2: who this is in `state.joins` (an email or a +1 phone number). */
  contact?: string;
  /** Phase 3: a mobile number added with a checked code (+1 and 10 digits). */
  phone?: string;
}

export type MockSignal =
  | { kind: 'scan' | 'add' | 'pass'; sku: string; at: string }
  | { kind: 'feel'; sku: string; at: string; feel: PriceFeel };

/**
 * An email or text the mock "sent": its link token (emails only) and 6-digit code (one use, 15 minutes, 5 wrong codes
 * kill it). `to` is the email (lower case) or the phone number as +1 and 10 digits.
 */
export interface MockEmail {
  to: string;
  channel: 'sms' | 'email';
  purpose: SignInPurpose;
  token: string;
  code: string;
  sentAt: number;
  used: boolean;
  wrong: number;
}

interface MockJoin {
  first_name: string;
  verified: boolean;
  selfie: boolean;
  signed: boolean;
}

/** Mock: texts on, Google off (no client id), like a server with Twilio set up and no Google yet. */
const DEFAULT_OPTIONS: SignInOptions = { google_client_id: null, phone: true, email: true };

const state = {
  latencyMs: 120,
  signals: [] as MockSignal[],
  emails: [] as MockEmail[],
  /** Joined online (pending until a register finishes them), by lower-cased email or +1 phone number. */
  joins: new Map<string, MockJoin>(),
  /** What `sign-in-options/` answers (Join v2). */
  options: { ...DEFAULT_OPTIONS } as SignInOptions,
  /** The selfies and signatures sent from the app (Join v2), newest last. */
  finished: [] as Array<{ step: FinishStep; contact: string; terms_version?: string }>,
  /** Phase 3 (owner 2026-10-20): members with no phone must add one. Off by default so older flows stay as they were. */
  requirePhone: false,
};

function wait(ms = state.latencyMs): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

function nowIso(): string {
  return new Date().toISOString();
}

function readSession(): ThriftPlusSession {
  const s = readJson<StoredSession | null>(LS.session, null);
  if (!s) return { status: 'signed_out' };
  if (s.status === 'guest') return { status: 'guest' };
  const ready = s.ready ?? true;
  const selfie = ready || !!s.selfie;
  const signed = ready || !!s.signed;
  const steps: FinishStep[] = ready ? [] : [...(selfie ? [] : ['selfie' as const]), ...(signed ? [] : ['sign' as const])];
  return {
    status: 'member',
    member: {
      first_name: s.first_name || 'Dana',
      email: s.email ?? 'member@example.com',
      username: s.username ?? null,
      card_last4: ready ? '4821' : null,
      verified_18: ready,
      banked_rewards: ready ? '27.50' : '0.00',
      bucks_available: ready ? '27.50' : '0.00',
      credit_balance: '0.00',
      ready,
      email_verified: s.email !== '', // a member who joined by phone has no email
      selfie,
      signed,
      phone_verified: !!s.phone_verified,
      finish_steps: steps,
      needs_phone: state.requirePhone && !s.phone && s.kind !== 'phone',
      phone: s.phone ? s.phone.replace(/\D/g, '').slice(-10) : '',
      ...(s.kind ? { session_kind: s.kind } : {}),
    },
  };
}

function readCartLines(): ThriftPlusCartLine[] {
  const raw = readJson<unknown>(LS.cart, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is ThriftPlusCartLine =>
      !!l && typeof l === 'object' && !!(l as ThriftPlusCartLine).item?.sku && Number((l as ThriftPlusCartLine).qty) > 0,
  );
}

function cartOf(lines: ThriftPlusCartLine[]): ThriftPlusCart {
  return { lines, totals: computeCartTotals(lines) };
}

function readHistory(): ThriftPlusHistoryEntry[] {
  const raw = readJson<unknown>(LS.history, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is ThriftPlusHistoryEntry => !!e && typeof e === 'object' && !!(e as ThriftPlusHistoryEntry).item?.sku);
}

/** Newest first, one row per tag. */
function touchHistory(item: ThriftPlusItemCard, patch: Partial<ThriftPlusHistoryEntry> = {}): void {
  const rest = readHistory().filter((e) => e.item.sku !== item.sku);
  const prev = readHistory().find((e) => e.item.sku === item.sku);
  const entry: ThriftPlusHistoryEntry = {
    item,
    scanned_at: patch.scanned_at ?? prev?.scanned_at ?? nowIso(),
    decision: patch.decision !== undefined ? patch.decision : prev?.decision ?? null,
  };
  writeJson(LS.history, [entry, ...rest].slice(0, HISTORY_MAX));
}

function setDecision(sku: string, decision: 'added' | 'passed'): void {
  const hist = readHistory();
  const i = hist.findIndex((e) => e.item.sku === sku);
  if (i < 0) return;
  hist[i] = { ...hist[i], decision };
  writeJson(LS.history, hist);
}

function record(signal: MockSignal): void {
  state.signals.push(signal);
}

// ---------------------------------------------------------------------------
// Contract: the functions the real API replaces
// ---------------------------------------------------------------------------

export async function getSession(): Promise<ThriftPlusSession> {
  return readSession();
}

/**
 * Email (or username) and password. Email always works; a username is an
 * optional shortcut. Mock: any login of 3+ characters and password of 4+.
 */
export async function signIn(login: string, password: string): Promise<ThriftPlusSession> {
  await wait();
  const who = login.trim();
  if (who.length < 3) throw new Error('Enter your email or username.');
  if (password.length < 4) throw new Error('Enter your password.');
  const isEmail = who.includes('@');
  writeJson(LS.session, {
    status: 'member',
    email: isEmail ? who.toLowerCase() : `${who.toLowerCase()}@example.com`,
    username: isEmail ? null : who,
  } satisfies StoredSession);
  return readSession();
}

/** "Forgot password?": email a reset link. Mock: nothing is sent. */
export async function requestPasswordReset(email: string): Promise<{ sent_to: string }> {
  await wait();
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('Enter the email on your account.');
  return { sent_to: e };
}

/**
 * Scan the QR on the back of a Thrift+ card, then the last 4 digits of the
 * member's phone as the check. Mock: any code of 6+ characters and any 4 digits.
 */
export async function signInWithCard(cardCode: string, phoneLast4: string): Promise<ThriftPlusSession> {
  await wait();
  if (cardCode.trim().length < 6) throw new Error('That card did not read. Scan it again.');
  if (!/^\d{4}$/.test(phoneLast4.trim())) throw new Error('Enter the last 4 digits of your phone.');
  writeJson(LS.session, { status: 'member', email: 'member@example.com', username: null } satisfies StoredSession);
  return readSession();
}

// Email sign-in and joining (owner 2026-10-15, APP D9; rulebook J8, J11), and Join v2 (owner 2026-10-19): Google, a
// texted code or an emailed one. Every email carries a link and a 6-digit code; a text carries the code. Each works
// once for 15 minutes. The answers never say whether a contact is a member's. Mock: nothing is sent
// (`thriftPlusMockControls.outbox()` shows what would be), and any contact that hasn't joined here counts as an active
// member's.

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_MINUTES = 15;

function sendEmail(to: string, purpose: SignInPurpose, channel: 'sms' | 'email' = 'email'): void {
  const n = state.emails.length + 1;
  state.emails.push({
    to,
    channel,
    purpose,
    token: `mock-link-${n}`,
    code: String(100000 + ((n * 271_829) % 900_000)),
    sentAt: Date.now(),
    used: false,
    wrong: 0,
  });
}

function newJoin(first: string): MockJoin {
  return { first_name: first, verified: false, selfie: false, signed: false };
}

/** Join with a name and email: a pending membership and a join email (an email already a member's gets a sign-in email). */
export async function joinThriftPlus(first: string, last: string, email: string): Promise<{ status: 'sent' }> {
  await wait();
  const who = first.replace(/\s+/g, ' ').trim();
  const to = email.trim().toLowerCase();
  if (!who || !last.trim()) throw new ThriftPlusError('Enter your first and last name.', 'NAME_NEEDED');
  if (!EMAIL_RE.test(to)) throw new ThriftPlusError('Check your email address.', 'EMAIL_BAD');
  const joined = state.joins.get(to);
  if (!joined) state.joins.set(to, newJoin(who));
  sendEmail(to, !joined || !joined.verified ? 'join' : 'sign_in');
  return { status: 'sent' };
}

/** "Email me a link": always the same answer. */
export async function requestSignInEmail(email: string): Promise<{ status: 'sent' }> {
  await wait();
  const to = email.trim().toLowerCase();
  if (!EMAIL_RE.test(to)) throw new ThriftPlusError('Check your email address.', 'EMAIL_BAD');
  const joined = state.joins.get(to);
  sendEmail(to, joined && !joined.verified ? 'join' : 'sign_in');
  return { status: 'sent' };
}

/** Signed in as `contact` (an email or a +1 phone number), by a code, a link or Google. */
function signInAs(contact: string, purpose: SignInPurpose): EmailSignIn {
  const joined = state.joins.get(contact);
  if (joined) joined.verified = true;
  const byPhone = contact.startsWith('+');
  writeJson(LS.session, {
    status: 'member',
    email: byPhone ? '' : contact,
    username: null,
    first_name: joined?.first_name,
    ready: !joined, // joined online: not ready until a register finishes it (J2)
    kind: byPhone ? 'phone' : 'email',
    selfie: joined?.selfie,
    signed: joined?.signed,
    phone_verified: byPhone,
    contact,
  } satisfies StoredSession);
  return { ...readSession(), purpose };
}

function signedInBy(sent: MockEmail): EmailSignIn {
  sent.used = true;
  return signInAs(sent.to, sent.purpose);
}

/** Past its 15 minutes, or killed by 5 wrong codes. */
const expired = (sent: MockEmail) => sent.wrong >= 5 || Date.now() - sent.sentAt > EMAIL_MINUTES * 60_000;

/** The link in the email: `/scan?signin=<token>`. */
export async function signInWithLink(token: string): Promise<EmailSignIn> {
  await wait();
  const sent = state.emails.find((e) => e.token === token && e.channel === 'email');
  if (!sent) throw new ThriftPlusError("That link didn't work. Send a new one.", 'LINK_BAD');
  if (sent.used) throw new ThriftPlusError('That link has already been used. Send a new one.', 'LINK_USED');
  if (expired(sent)) throw new ThriftPlusError('That link has expired. Send a new one.', 'LINK_EXPIRED');
  return signedInBy(sent);
}

/** The newest code sent to `to`, checked: wrong ones count, five kill it. */
function checkSent(to: string, code: string): EmailSignIn {
  const sent = [...state.emails].reverse().find((e) => e.to === to && !e.used);
  if (!sent) throw new ThriftPlusError("That code didn't work. Check it and try again.", 'CODE_BAD');
  // A texted code never says expired (the server's phone codes answer CODE_BAD only).
  if (expired(sent) && sent.channel === 'sms') throw new ThriftPlusError("That code didn't work. Check it and try again.", 'CODE_BAD');
  if (expired(sent)) throw new ThriftPlusError('That code has expired. Send a new one.', 'CODE_EXPIRED');
  if (code.trim() !== sent.code) {
    sent.wrong += 1;
    throw new ThriftPlusError("That code didn't work. Check it and try again.", 'CODE_BAD');
  }
  return signedInBy(sent);
}

/** The 6-digit code from the email, typed in the app: the newest one sent to that email. */
export async function signInWithCode(email: string, code: string): Promise<EmailSignIn> {
  await wait();
  return checkSent(email.trim().toLowerCase(), code);
}

// ── Join v2 (owner 2026-10-19): Google, a phone or an email; then a selfie and a signature in the app ─────────

/** The ways in: Google only with a client id; texts only when the server has phone set up. */
export async function getSignInOptions(): Promise<SignInOptions> {
  return { ...state.options };
}

/**
 * "Send my code" (`code/send/`): with both names a join, without them a sign-in. A phone number gets a text, an email
 * an email (its link and code). The same answer whether or not the contact is a member's.
 */
export async function sendCode(contact: string, first = '', last = ''): Promise<CodeSent> {
  await wait();
  const who = first.replace(/\s+/g, ' ').trim();
  const hasLast = !!last.trim();
  if (!!who !== hasLast) throw new ThriftPlusError('Enter your first and last name.', 'NAME_NEEDED');
  const read = readContact(contact);
  if (!read) throw new ThriftPlusError('Enter a US phone number or an email.', 'CONTACT_BAD');
  if (read.kind === 'phone' && !state.options.phone) throw new ThriftPlusError('Enter your email.', 'PHONE_OFF');
  const channel = read.kind === 'phone' ? 'sms' : 'email';
  const joined = state.joins.get(read.value);
  if (who && !joined) state.joins.set(read.value, newJoin(who));
  const pending = who ? !joined || !joined.verified : !!joined && !joined.verified;
  sendEmail(read.value, pending ? 'join' : 'sign_in', channel);
  return { status: 'sent', channel };
}

/** "Enter the 6-digit code" (`code/check/`): signs in like the emailed code. */
export async function checkCode(contact: string, code: string): Promise<EmailSignIn> {
  await wait();
  const read = readContact(contact);
  if (!read) throw new ThriftPlusError("That code didn't work. Check it and try again.", 'CODE_BAD');
  return checkSent(read.value, code);
}

/** Google's ID token, read like the server does (mock: the payload is not checked against Google). */
function googlePerson(credential: string): { email: string; given_name: string; family_name: string } | null {
  try {
    const part = credential.split('.')[1] ?? '';
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    const email = typeof json.email === 'string' ? json.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) return null;
    return { email, given_name: String(json.given_name ?? ''), family_name: String(json.family_name ?? '') };
  } catch {
    return null;
  }
}

/** "Continue with Google" (`google/`): a new email joins (pending, Google's name), a known one signs in. */
export async function signInWithGoogle(credential: string): Promise<EmailSignIn> {
  await wait();
  if (!state.options.google_client_id) throw new ThriftPlusError('Google sign-in is off. Use your email or phone.', 'GOOGLE_OFF');
  const person = googlePerson(credential);
  if (!person) throw new ThriftPlusError("Google didn't sign you in. Try again, or use your email or phone.", 'GOOGLE_BAD');
  const joined = state.joins.get(person.email);
  if (!joined) state.joins.set(person.email, newJoin(person.given_name.trim() || 'Member'));
  return signInAs(person.email, joined ? 'sign_in' : 'join');
}

/** The signed-in pending member's join, or the error the server gives anyone else. */
function pendingJoin(): { stored: StoredSession; join: MockJoin; contact: string } {
  const stored = readJson<StoredSession | null>(LS.session, null);
  const contact = stored?.contact ?? '';
  const join = state.joins.get(contact);
  if (!stored || stored.status !== 'member') throw new ThriftPlusError('Sign in first.', 'NOT_SIGNED_IN');
  if (stored.ready !== false || !join) throw new ThriftPlusError('Your membership is already finished. Ask at the register to change it.', 'NOT_PENDING');
  return { stored, join, contact };
}

function memberNow(): ThriftPlusMember {
  const s = readSession();
  if (s.status !== 'member') throw new ThriftPlusError('Sign in first.', 'NOT_SIGNED_IN');
  return s.member;
}

/** "Use this photo" (`me/selfie/`, multipart `photo`): images only, 8 MB at most. */
export async function uploadSelfie(photo: Blob): Promise<ThriftPlusMember> {
  await wait();
  const { stored, join, contact } = pendingJoin();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) throw new ThriftPlusError('That file is not a photo. Take your selfie again.', 'PHOTO_BAD');
  if (!photo.size) throw new ThriftPlusError('Take your selfie first.', 'PHOTO_NEEDED');
  if (photo.size > 8 * 1024 * 1024) throw new ThriftPlusError('That photo is too big. Take your selfie again.', 'PHOTO_TOO_BIG');
  join.selfie = true;
  writeJson(LS.session, { ...stored, selfie: true } satisfies StoredSession);
  state.finished.push({ step: 'selfie', contact });
  return memberNow();
}

/** "Sign" (`me/signature/`): the signature as a PNG data URL, and the terms version it was signed under. */
export async function signTerms(signature: string, termsVersion: string): Promise<ThriftPlusMember> {
  await wait();
  const { stored, join, contact } = pendingJoin();
  if (!signature.startsWith('data:image/png;base64,')) throw new ThriftPlusError('The signature did not save. Clear it and sign again.', 'SIGNATURE_BAD');
  join.signed = true;
  writeJson(LS.session, { ...stored, signed: true } satisfies StoredSession);
  state.finished.push({ step: 'sign', contact, terms_version: termsVersion });
  return memberNow();
}

/** Phase 3: "Send my code" for the number a signed-in member adds (`me/phone/send/`). */
export async function sendPhoneCode(phone: string): Promise<{ status: 'sent' }> {
  await wait();
  const read = readContact(phone);
  if (!read || read.kind !== 'phone') throw new ThriftPlusError('Enter a US phone number or an email.', 'CONTACT_BAD');
  if (!state.options.phone) throw new ThriftPlusError('Texts are off right now. Enter your email.', 'PHONE_OFF');
  sendEmail(read.value, 'sign_in', 'sms');
  return { status: 'sent' };
}

/** Phase 3: the code from that text saves the phone (`me/phone/`); the member comes back with `needs_phone` false. */
export async function savePhone(phone: string, code: string): Promise<ThriftPlusMember> {
  await wait();
  const stored = readJson<StoredSession | null>(LS.session, null);
  if (!stored || stored.status !== 'member') throw new ThriftPlusError('Sign in first.', 'NOT_SIGNED_IN');
  const read = readContact(phone);
  const bad = new ThriftPlusError("That code didn't work. Check it and try again.", 'CODE_BAD');
  if (!read || read.kind !== 'phone') throw bad;
  const sent = [...state.emails].reverse().find((e) => e.to === read.value && e.channel === 'sms' && !e.used);
  if (!sent || expired(sent)) throw bad;
  if (code.trim() !== sent.code) {
    sent.wrong += 1;
    throw bad;
  }
  sent.used = true;
  writeJson(LS.session, { ...stored, phone: read.value, phone_verified: true } satisfies StoredSession);
  return memberNow();
}

/** Scan without an account: guests see what members would collect. */
export async function continueAsGuest(): Promise<ThriftPlusSession> {
  writeJson(LS.session, { status: 'guest' } satisfies StoredSession);
  return readSession();
}

export async function signOut(): Promise<ThriftPlusSession> {
  writeJson(LS.session, null);
  return readSession();
}

/** Look up a scanned tag and log the scan. */
export async function lookupTag(sku: string): Promise<TagLookup> {
  const code = sku.trim().toUpperCase();
  let item = SAMPLE_CARDS.get(code) ?? null;
  if (item) {
    await wait();
  } else {
    try {
      const { data } = await apiPublic.get<PublicItemDTO>(`/inventory/items/lookup/${encodeURIComponent(code)}/`);
      item = itemFromPublic(data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return { status: 'not_found', sku: code };
      return { status: 'error', sku: code, message: 'Could not reach the store. Check your signal and scan again.' };
    }
  }
  touchHistory(item, { scanned_at: nowIso(), decision: null });
  record({ kind: 'scan', sku: code, at: nowIso() });
  return { status: 'found', item };
}

export async function getCart(): Promise<ThriftPlusCart> {
  return cartOf(readCartLines());
}

/** Swipe right, or Add from history. A tag already in the cart stays at its quantity. */
export async function addToCart(item: ThriftPlusItemCard): Promise<ThriftPlusCart> {
  if (!item.available) throw new Error(`${item.title} is no longer on the floor.`);
  const lines = readCartLines();
  if (!lines.some((l) => l.item.sku === item.sku)) {
    lines.unshift({ item, qty: 1, added_at: nowIso() });
    writeJson(LS.cart, lines);
  }
  if (!readHistory().some((e) => e.item.sku === item.sku)) touchHistory(item);
  setDecision(item.sku, 'added');
  record({ kind: 'add', sku: item.sku, at: nowIso() });
  return cartOf(lines);
}

/** Cart quantity. 0 removes the line. */
export async function setCartQty(sku: string, qty: number): Promise<ThriftPlusCart> {
  const n = Math.max(0, Math.min(99, Math.floor(qty)));
  const lines = readCartLines()
    .map((l) => (l.item.sku === sku ? { ...l, qty: n } : l))
    .filter((l) => l.qty > 0);
  writeJson(LS.cart, lines);
  return cartOf(lines);
}

export async function removeFromCart(sku: string): Promise<ThriftPlusCart> {
  return setCartQty(sku, 0);
}

export async function clearCart(): Promise<ThriftPlusCart> {
  writeJson(LS.cart, []);
  return cartOf([]);
}

/** Swipe left. Logs a pass. */
export async function passItem(sku: string): Promise<void> {
  setDecision(sku, 'passed');
  record({ kind: 'pass', sku, at: nowIso() });
}

/** Every tag this customer scanned, newest first. */
export async function getHistory(): Promise<ThriftPlusHistoryEntry[]> {
  return readHistory();
}

/** "Price feel off?" answer for one item. */
export async function sendPriceFeel(sku: string, feel: PriceFeel): Promise<void> {
  record({ kind: 'feel', sku, at: nowIso(), feel });
}

// ---------------------------------------------------------------------------
// Mock-only controls (not part of the contract)
// ---------------------------------------------------------------------------

export const thriftPlusMockControls = {
  /** Tags that work without the database, for "Try a sample tag". */
  sampleTags(): Array<{ sku: string; title: string }> {
    return SAMPLES.map((s) => ({ sku: s.sku, title: s.title }));
  },
  signals(): MockSignal[] {
    return [...state.signals];
  },
  setLatency(ms: number): void {
    state.latencyMs = ms;
  },
  /** The sign-in and join emails the mock "sent", oldest first (owner 2026-10-15, APP D9). */
  outbox(): MockEmail[] {
    return state.emails.map((e) => ({ ...e }));
  },
  /** What `sign-in-options/` answers (Join v2): set a Google client id to show "Continue with Google". */
  setSignInOptions(options: Partial<SignInOptions>): void {
    state.options = { ...state.options, ...options, email: true };
  },
  /** A Google ID token for the mock's `google/` (Join v2): unsigned, with Google's email and name. */
  googleCredential(email: string, givenName = '', familyName = ''): string {
    const part = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${part({ alg: 'none' })}.${part({ email, given_name: givenName, family_name: familyName })}.mock`;
  },
  /** Phase 3: members with no phone are asked for one (the server's `needs_phone`). */
  setRequirePhone(on: boolean): void {
    state.requirePhone = on;
  },
  /** The selfies and signatures sent from the app (Join v2), oldest first. */
  finished(): Array<{ step: FinishStep; contact: string; terms_version?: string }> {
    return state.finished.map((f) => ({ ...f }));
  },
  /** Forget everything on this phone. */
  reset(): void {
    state.signals = [];
    state.emails = [];
    state.joins.clear();
    state.options = { ...DEFAULT_OPTIONS };
    state.finished = [];
    state.requirePhone = false;
    for (const key of Object.values(LS)) writeJson(key, null);
  },
};
