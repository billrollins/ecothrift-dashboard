/**
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
 * account (sign-in, cover, banked rewards), the reward (a random 0% to 80% of
 * the price, fixed per tag), the bank-or-rebate choice (the real API alerts
 * the register), and the cart and history (kept on this phone).
 *
 * `thriftPlusMockControls` at the bottom is mock-only. The real API drops it.
 */
import axios from 'axios';
import { apiPublic } from './client';

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
  /** Today's member reward on this item ("You'd earn +$X"). "0.00" when there is none. */
  reward: Money;
  /** price - reward, before the monthly cover. */
  member_price: Money;
  /** The same reward if the member banks it: banked rewards earn BANK_EXTRA_PCT more. */
  reward_banked: Money;
  /** 18+ item: sells only to ID-verified cards. */
  age_restricted: boolean;
  /** false = final sale even for members (as-is, clothing and soft goods, 18+). */
  returnable: boolean;
  /** false = sold or off the floor. It cannot go in the cart. */
  available: boolean;
}

export type TagLookup =
  | { status: 'found'; item: ThriftPlusItemCard }
  | { status: 'not_found'; sku: string }
  | { status: 'error'; sku: string; message: string };

/** The monthly cover: the first $10 of rewards each month covers the card. */
export interface ThriftPlusCover {
  /** Calendar month, "2026-09". */
  month: string;
  /** The cover for the month, "10.00". */
  amount: Money;
  /** Rewards applied to the cover so far this month. */
  covered: Money;
  /** amount - covered, never below 0. */
  remaining: Money;
  is_covered: boolean;
  /** The day it resets, "2026-10-01". */
  resets_on: string;
}

export interface ThriftPlusMember {
  first_name: string;
  email: string;
  /** Optional short login name; email always works too. */
  username: string | null;
  /** Last 4 of the card code, for display. null until a card is attached at the register. */
  card_last4: string | null;
  /** ID checked at signup; required for 18+ items and returns. */
  verified_18: boolean;
  cover: ThriftPlusCover;
  /** Rewards the member chose to bank for a later trip. */
  banked_rewards: Money;
  /** Store credit balance. */
  credit_balance: Money;
}

export type ThriftPlusSession =
  | { status: 'signed_out' }
  | { status: 'guest' }
  | { status: 'member'; member: ThriftPlusMember };

export interface ThriftPlusCartLine {
  item: ThriftPlusItemCard;
  qty: number;
  /** ISO timestamp. */
  added_at: string;
}

/**
 * What happens to this trip's rewards: banked for later, or taken off today's
 * price. Asked on the first add; the register gets an alert with the answer,
 * and the cashier asks too. Banking pays BANK_EXTRA_PCT more.
 */
export type RewardChoice = 'bank' | 'instant';

/** Banked rewards are worth this much more than an instant rebate (owner, 09-25). */
export const BANK_EXTRA_PCT = 5;

/** Cart totals. An estimate: the register is the source of truth. */
export interface ThriftPlusCartTotals {
  /** Units (sum of qty). */
  item_count: number;
  /** Sum of tag prices x qty: what a guest pays. */
  price_total: Money;
  /** Sum of member rewards x qty. */
  reward_total: Money;
  /** The part of reward_total that fills this month's cover (for a guest: as a new member would). */
  to_cover: Money;
  /** Instant rebate: reward_total - to_cover, taken off at the register. 0 when banking. */
  savings: Money;
  /** What banking this cart would add to banked rewards: (reward_total - to_cover) plus bank_extra_pct. */
  bank_value: Money;
  /** The extra part of bank_value, i.e. what banking adds over an instant rebate. */
  bank_extra: Money;
  /** The banking extra in percent (5). */
  bank_extra_pct: number;
  /** bank_value when the member chose to bank, else 0. */
  to_bank: Money;
  /** price_total - savings: the member's estimate, before tax. */
  member_total: Money;
}

export interface ThriftPlusCart {
  lines: ThriftPlusCartLine[];
  /** null until the member answers (first add). Guests are never asked. */
  reward_choice: RewardChoice | null;
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

/** A reward in cents plus the banking extra, rounded down to the cent like the register. */
export function withBankExtra(cents: number): number {
  return Math.floor((cents * (100 + BANK_EXTRA_PCT)) / 100);
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
  base: Omit<ThriftPlusItemCard, 'member_price' | 'reward_banked' | 'reward' | 'category_label'> & { reward?: Money },
): ThriftPlusItemCard {
  const priceCents = toCents(base.price);
  const rewardCents = base.reward != null ? toCents(base.reward) : mockRewardCents(base.sku, priceCents);
  return {
    ...base,
    category_label: CATEGORY_LABELS[base.category],
    reward: fromCents(rewardCents),
    member_price: fromCents(priceCents - rewardCents),
    reward_banked: fromCents(withBankExtra(rewardCents)),
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

type Sample = Omit<ThriftPlusItemCard, 'member_price' | 'reward_banked' | 'category_label' | 'age_restricted' | 'returnable' | 'available'> &
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

const COVER_AMOUNT_CENTS = 1000;
const HISTORY_MAX = 300;
const LS = {
  session: 'thriftPlus.session',
  cart: 'thriftPlus.cart',
  history: 'thriftPlus.history',
  choice: 'thriftPlus.rewardChoice',
  covered: 'thriftPlus.mockCovered',
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
}

export type MockSignal =
  | { kind: 'scan' | 'add' | 'pass'; sku: string; at: string }
  | { kind: 'feel'; sku: string; at: string; feel: PriceFeel }
  | { kind: 'choice'; sku: ''; at: string; choice: RewardChoice };

const state = {
  latencyMs: 120,
  signals: [] as MockSignal[],
};

function wait(ms = state.latencyMs): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

function nowIso(): string {
  return new Date().toISOString();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function coverFor(coveredCents: number, today = new Date()): ThriftPlusCover {
  const y = today.getFullYear();
  const m = today.getMonth();
  const next = new Date(y, m + 1, 1);
  const covered = Math.max(0, Math.min(coveredCents, COVER_AMOUNT_CENTS));
  return {
    month: `${y}-${pad2(m + 1)}`,
    amount: fromCents(COVER_AMOUNT_CENTS),
    covered: fromCents(covered),
    remaining: fromCents(COVER_AMOUNT_CENTS - covered),
    is_covered: covered >= COVER_AMOUNT_CENTS,
    resets_on: `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-01`,
  };
}

function readSession(): ThriftPlusSession {
  const s = readJson<StoredSession | null>(LS.session, null);
  if (!s) return { status: 'signed_out' };
  if (s.status === 'guest') return { status: 'guest' };
  return {
    status: 'member',
    member: {
      first_name: 'Dana',
      email: s.email || 'member@example.com',
      username: s.username ?? null,
      card_last4: '4821',
      verified_18: true,
      cover: coverFor(readJson<number>(LS.covered, 640)),
      banked_rewards: '27.50',
      credit_balance: '0.00',
    },
  };
}

function memberOf(session: ThriftPlusSession): ThriftPlusMember | null {
  return session.status === 'member' ? session.member : null;
}

/**
 * Cart totals, the way the register will estimate them: rewards first fill
 * what is left of this month's cover, and only the rest comes off the price.
 */
export function computeCartTotals(
  lines: Array<{ item: ThriftPlusItemCard; qty: number }>,
  member: ThriftPlusMember | null,
  choice: RewardChoice | null = null,
): ThriftPlusCartTotals {
  let units = 0;
  let priceCents = 0;
  let rewardCents = 0;
  for (const { item, qty } of lines) {
    units += qty;
    priceCents += toCents(item.price) * qty;
    rewardCents += toCents(item.reward) * qty;
  }
  const coverLeft = member ? toCents(member.cover.remaining) : COVER_AMOUNT_CENTS;
  const toCover = Math.min(coverLeft, rewardCents);
  const past = rewardCents - toCover;
  // Banking is for members who chose it; everyone else is shown the instant rebate.
  const banking = !!member && choice === 'bank';
  const savings = banking ? 0 : past;
  return {
    item_count: units,
    price_total: fromCents(priceCents),
    reward_total: fromCents(rewardCents),
    to_cover: fromCents(toCover),
    savings: fromCents(savings),
    bank_value: fromCents(withBankExtra(past)),
    bank_extra: fromCents(withBankExtra(past) - past),
    bank_extra_pct: BANK_EXTRA_PCT,
    to_bank: fromCents(banking ? withBankExtra(past) : 0),
    member_total: fromCents(priceCents - savings),
  };
}

/** Items saved on the phone by an older version lack newer fields; fill them in. */
function upgradeItem(item: ThriftPlusItemCard): ThriftPlusItemCard {
  return item.reward_banked ? item : { ...item, reward_banked: fromCents(withBankExtra(toCents(item.reward))) };
}

function readCartLines(): ThriftPlusCartLine[] {
  const raw = readJson<unknown>(LS.cart, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (l): l is ThriftPlusCartLine =>
        !!l && typeof l === 'object' && !!(l as ThriftPlusCartLine).item?.sku && Number((l as ThriftPlusCartLine).qty) > 0,
    )
    .map((l) => ({ ...l, item: upgradeItem(l.item) }));
}

function readChoice(): RewardChoice | null {
  const c = readJson<unknown>(LS.choice, null);
  return c === 'bank' || c === 'instant' ? c : null;
}

function cartOf(lines: ThriftPlusCartLine[]): ThriftPlusCart {
  const member = memberOf(readSession());
  const choice = member ? readChoice() : null;
  return { lines, reward_choice: choice, totals: computeCartTotals(lines, member, choice) };
}

function readHistory(): ThriftPlusHistoryEntry[] {
  const raw = readJson<unknown>(LS.history, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is ThriftPlusHistoryEntry => !!e && typeof e === 'object' && !!(e as ThriftPlusHistoryEntry).item?.sku)
    .map((e) => ({ ...e, item: upgradeItem(e.item) }));
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

/** Scan without an account: guests see what members would earn. */
export async function continueAsGuest(): Promise<ThriftPlusSession> {
  writeJson(LS.session, { status: 'guest' } satisfies StoredSession);
  return readSession();
}

export async function signOut(): Promise<ThriftPlusSession> {
  writeJson(LS.session, null);
  writeJson(LS.choice, null);
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
  // A new trip asks bank-or-rebate again.
  writeJson(LS.choice, null);
  return cartOf([]);
}

/** The bank-or-rebate answer for this trip. The real API alerts the register. */
export async function setRewardChoice(choice: RewardChoice): Promise<ThriftPlusCart> {
  writeJson(LS.choice, choice);
  record({ kind: 'choice', sku: '', at: nowIso(), choice });
  return cartOf(readCartLines());
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
  /** Month-to-date cover for the mock member, in cents. */
  setCoveredCents(cents: number): void {
    writeJson(LS.covered, cents);
  },
  setLatency(ms: number): void {
    state.latencyMs = ms;
  },
  /** Forget everything on this phone. */
  reset(): void {
    state.signals = [];
    for (const key of Object.values(LS)) writeJson(key, null);
  },
};
