/**
 * The Thrift+ scanner's API client for the phone site: the live `frontend/src/api/thriftPlusScanner.api.ts` rebuilt on
 * fetch (no axios), with the SAME function names, types, error words and stored keys, so the views and tests port one
 * to one and a phone can switch between the old and the new scanner (rollback) with nothing lost.
 *
 * - **Members:** the member session is an httpOnly cookie on `/api/thriftplus/public/` (same origin, sent with every
 *   call). A staff login and a member session never mix.
 * - **Guests** (a non-member scanning): the trip and history stay on the phone (localStorage, the old keys). Only tag
 *   lookups and signals go to the server.
 * - **Totals:** units, tag prices and the ThriftBucks the trip collects. ThriftBucks only (B1, B3, V8).
 * - **Preview:** a staff phone's `?preview=<code>` is kept in localStorage and sent as `X-ThriftPlus-Preview`.
 * - **Session:** `session/` is asked through `lib/member.ts`, the one member of the whole phone site, so the top bar and
 *   the scanner never disagree. `readSession()` gives the store the session and whether Thrift+ is open from ONE answer.
 *
 * Dropped (no screen called them): `history/` reads, `history/clear/`, `join/`, `session/email/`, `session/code/`,
 * `fetchScannerSettings`. Guest history is still written, so a rollback sees the same data.
 */
import { fetchSession, lastSessionAnswer, PREVIEW_KEY, publishSession, type SessionAnswer } from '../lib/member'
import {
  computeCartTotals,
  readContact,
  ThriftPlusError,
  type CodeSent,
  type Contact,
  type EmailSignIn,
  type FinishStep,
  type PriceFeel,
  type SignInOptions,
  type SignInPurpose,
  type TagLookup,
  type ThriftPlusCart,
  type ThriftPlusCartLine,
  type ThriftPlusHistoryEntry,
  type ThriftPlusItemCard,
  type ThriftPlusMember,
  type ThriftPlusSession,
} from './core'

export { computeCartTotals, readContact, ThriftPlusError }
export type {
  CodeSent,
  Contact,
  EmailSignIn,
  FinishStep,
  PriceFeel,
  SignInOptions,
  SignInPurpose,
  TagLookup,
  ThriftPlusCart,
  ThriftPlusCartLine,
  ThriftPlusHistoryEntry,
  ThriftPlusItemCard,
  ThriftPlusMember,
  ThriftPlusSession,
}

export const BASE = '/api/thriftplus/public'

/** The localStorage keys, the same as the live scanner's (a phone moving between the two keeps its trip). */
export const LS = {
  guest: 'thriftPlus.real.guest',
  cart: 'thriftPlus.real.guestCart',
  history: 'thriftPlus.real.guestHistory',
  preview: PREVIEW_KEY,
} as const

// ── The fetch wrapper ───────────────────────────────────────────────────────

/** The server answered with an error status. `body` is its JSON ({} when none). */
export class HttpError extends Error {
  status: number
  body: Record<string, unknown>
  retryAfterHeader: string | null

  constructor(status: number, body: Record<string, unknown>, retryAfterHeader: string | null) {
    super(`Request failed with status code ${status}`)
    this.name = 'HttpError'
    this.status = status
    this.body = body
    this.retryAfterHeader = retryAfterHeader
  }
}

/** No answer at all (offline, the store's signal, a blocked request). */
export class NetworkError extends Error {
  constructor() {
    super('Network Error')
    this.name = 'NetworkError'
  }
}

function previewCode(): string | null {
  try {
    return window.localStorage.getItem(PREVIEW_KEY)
  } catch {
    return null
  }
}

/** Thrift+ is behind a switch (owner, 2026-10-07): before launch, staff open /scan?preview=<code>; the phone keeps it. */
export function setPreviewCode(code: string | null): void {
  try {
    if (code) window.localStorage.setItem(PREVIEW_KEY, code)
    else window.localStorage.removeItem(PREVIEW_KEY)
  } catch {
    // Private mode: the preview lasts this page only.
  }
}

type Call = { body?: unknown; params?: Record<string, string | number> }

/** One call to `/api/thriftplus/public<path>`: cookies sent, JSON in and out (FormData as it is), the preview header. */
async function call<T>(method: 'GET' | 'POST', path: string, { body, params }: Call = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const code = previewCode()
  if (code) headers['X-ThriftPlus-Preview'] = code
  let payload: BodyInit | undefined
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    payload = body // the browser sets the multipart boundary itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const query = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}` : ''
  let r: Response
  try {
    r = await fetch(`${BASE}${path}${query}`, { method, credentials: 'include', headers, body: payload })
  } catch {
    throw new NetworkError()
  }
  let data: unknown = {}
  try {
    const text = await r.text()
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }
  if (!r.ok) throw new HttpError(r.status, (data && typeof data === 'object' ? data : {}) as Record<string, unknown>, r.headers.get('retry-after'))
  return data as T
}

const get = <T>(path: string, params?: Call['params']) => call<T>('GET', path, { params })
const post = <T>(path: string, body?: unknown) => call<T>('POST', path, { body })

// ── Words ───────────────────────────────────────────────────────────────────

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode or full storage: the guest cart just doesn't persist.
  }
}

/** "in 3 minutes", "in a minute", "in a moment": a 429's wait in plain words. */
function waitWords(seconds: number | undefined): string {
  if (!seconds || seconds < 45) return 'in a moment'
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? 'in a minute' : `in ${minutes} minutes`
}

/**
 * Join v2's answers in the app's own short, plain words (owner 2026-10-19: "SMOOTH and CLEAR and SIMPLE"), whatever
 * the server's `detail` says. Other codes keep the server's words. The same table as the live client.
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
}

/** The server's message, or a plain fallback, carrying the server's `code` and a 429's wait (`retryAfter`). */
export function problem(err: unknown, fallback: string): ThriftPlusError {
  if (err instanceof HttpError || err instanceof NetworkError) {
    const body = (err instanceof HttpError ? err.body : {}) as { detail?: unknown; code?: unknown; retry_after?: unknown }
    const code = typeof body.code === 'string' ? body.code : undefined
    const wait = Number(body.retry_after ?? (err instanceof HttpError ? err.retryAfterHeader : undefined))
    const retryAfter = Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : undefined
    const plain = code ? PLAIN[code] : undefined
    if (plain) return new ThriftPlusError(plain(retryAfter), code, retryAfter)
    if (typeof body.detail === 'string' && body.detail) return new ThriftPlusError(body.detail, code, retryAfter)
    if (err instanceof NetworkError) return new ThriftPlusError('Could not reach the store. Check your signal and try again.')
    return new ThriftPlusError(fallback, code, retryAfter)
  }
  return new ThriftPlusError(fallback)
}

// ── Session ─────────────────────────────────────────────────────────────────

/** The member as this module last knew them (the live client's memo): decides member calls vs the phone's own trip. */
let member: ThriftPlusMember | null = null

async function isMember(): Promise<boolean> {
  if (member) return true
  const s = await getSession()
  return s.status === 'member'
}

/** What one `session/` answer says: who is here, and whether Thrift+ is open to this phone. */
export function sessionOfAnswer(a: SessionAnswer | null): { session: ThriftPlusSession; open: boolean } {
  const body = (a?.body ?? null) as { status?: string; member?: ThriftPlusMember; code?: string; black_friday?: boolean } | null
  // Thrift+ is off for this phone: the server answers 403 THRIFT_PLUS_OFF. Offline counts as open.
  const open = !(a && a.status === 403 && body?.code === 'THRIFT_PLUS_OFF')
  if (a && a.status === 200 && body?.status === 'member' && body.member) {
    member = body.member
    return { session: { status: 'member', member: body.member }, open }
  }
  member = null
  // Signed out, an error or offline: what the phone knows.
  // Black Friday (#220): the server says so, and a signed-out phone scans at once (route.ts).
  const bf = a?.status === 200 && body?.black_friday === true
  return {
    session: readJson(LS.guest, false) ? { status: 'guest' } : bf ? { status: 'signed_out', black_friday: true } : { status: 'signed_out' },
    open,
  }
}

/**
 * The session and `open` from one `session/` request (the store's load). `reuse`: take this page load's answer when
 * `lib/member.ts` already has one (the top bar asked first), instead of a second request.
 */
export async function readSession({ reuse = false }: { reuse?: boolean } = {}): Promise<{ session: ThriftPlusSession; open: boolean }> {
  const known = reuse ? lastSessionAnswer() : null
  const a = known ?? (await fetchSession()) ?? lastSessionAnswer()
  return sessionOfAnswer(a)
}

/** False while Thrift+ is off for this phone (the server answers THRIFT_PLUS_OFF). Offline counts as open. */
export async function isOpen(): Promise<boolean> {
  return (await readSession()).open
}

export async function getSession(): Promise<ThriftPlusSession> {
  return (await readSession()).session
}

/** A sign-in's answer: the module's memo, the guest flag cleared, and the one member of the phone site told. */
function signedIn<T extends ThriftPlusSession>(data: T): T {
  if (data.status === 'member') member = data.member
  writeJson(LS.guest, null)
  publishSession(data.status === 'member' ? { status: 'member', member: data.member } : { status: 'signed_out' })
  return data
}

/** "Staff sign in": a Dash email and password (customers have no password since 2026-10-15). */
export async function signIn(login: string, password: string): Promise<ThriftPlusSession> {
  try {
    return signedIn(await post<ThriftPlusSession>('/session/password/', { login: login.trim(), password }))
  } catch (err) {
    throw problem(err, "That email or password isn't right.")
  }
}

/** The texted or emailed link opened `/scan?signin=<token>`: sign in. `purpose` says which message it was. */
export async function signInWithLink(token: string): Promise<EmailSignIn> {
  try {
    return signedIn(await post<EmailSignIn>('/session/link/', { token }))
  } catch (err) {
    throw problem(err, "That link didn't work. Send a new one.")
  }
}

// ── Join v2 (owner 2026-10-19): Google, a phone or an email; then a selfie and "I agree" in the app ──────────

/** The ways in this server offers. Unreachable or older: email only (no Google button, no phone). */
export async function getSignInOptions(): Promise<SignInOptions> {
  try {
    const data = await get<Partial<SignInOptions>>('/sign-in-options/')
    return { google_client_id: data.google_client_id || null, phone: data.phone === true, email: true }
  } catch {
    return { google_client_id: null, phone: false, email: true }
  }
}

/** "Send my code": a text to a phone number, or an email (its link and code) to an email. Names only for a join. */
export async function sendCode(contact: string, first = '', last = ''): Promise<CodeSent> {
  const names = first.trim() || last.trim() ? { first_name: first.trim(), last_name: last.trim() } : {}
  try {
    return await post<CodeSent>('/code/send/', { contact: contact.trim(), ...names })
  } catch (err) {
    throw problem(err, 'Could not send the code. Try again.')
  }
}

/** The 6-digit code from the text or the email. */
export async function checkCode(contact: string, code: string): Promise<EmailSignIn> {
  try {
    return signedIn(await post<EmailSignIn>('/code/check/', { contact: contact.trim(), code: code.trim() }))
  } catch (err) {
    throw problem(err, "That code didn't work. Check it and try again.")
  }
}

/** "Continue with Google": Google's ID token (Google Identity Services). A new email joins with Google's name. */
export async function signInWithGoogle(credential: string): Promise<EmailSignIn> {
  try {
    return signedIn(await post<EmailSignIn>('/google/', { credential }))
  } catch (err) {
    throw problem(err, "Google didn't sign you in. Try again, or use your email or phone.")
  }
}

/** The member out of a session answer: `me/selfie/`, `me/signature/` and `me/phone/` answer the session payload. */
function memberOf(data: unknown): ThriftPlusMember {
  const d = data as { status?: string; member?: ThriftPlusMember }
  return d && d.status === 'member' && d.member ? d.member : (data as ThriftPlusMember)
}

/** A finished step's answer: the member replaces the session (the steps advance), everywhere on the site. */
function memberNow(data: unknown): ThriftPlusMember {
  member = memberOf(data)
  publishSession({ status: 'member', member })
  return member
}

/**
 * "Use this photo": the selfie of a pending member. Send a JPEG the app redrew (core/photo.ts `selfieJpeg`): the server
 * reads images with Pillow and refuses HEIC.
 */
export async function uploadSelfie(photo: Blob): Promise<ThriftPlusMember> {
  const form = new FormData()
  form.append('photo', photo, photo.type === 'image/png' ? 'selfie.png' : 'selfie.jpg')
  try {
    return memberNow(await post<unknown>('/me/selfie/', form))
  } catch (err) {
    throw problem(err, 'Could not save your photo. Try again.')
  }
}

/** "I agree" (owner 2026-11-03: a tap, no drawing): the terms version they agreed to. */
export async function signTerms(termsVersion: string): Promise<ThriftPlusMember> {
  try {
    return memberNow(await post<unknown>('/me/signature/', { agree: true, terms_version: termsVersion }))
  } catch (err) {
    throw problem(err, 'That did not save. Tap I agree again.')
  }
}

// ── Phone first (owner 2026-10-20): a member with no phone adds one with a texted code ─────────────────────

/** "Send my code" for the number being added: a text with a 6-digit code to that number. */
export async function sendPhoneCode(phone: string): Promise<{ status: 'sent' }> {
  try {
    return await post<{ status: 'sent' }>('/me/phone/send/', { phone: phone.trim() })
  } catch (err) {
    throw problem(err, 'Could not send the code. Try again.')
  }
}

/** The code from that text: the phone is saved, and the member (with `needs_phone` now false) comes back. */
export async function savePhone(phone: string, code: string): Promise<ThriftPlusMember> {
  try {
    return memberNow(await post<unknown>('/me/phone/', { phone: phone.trim(), code: code.trim() }))
  } catch (err) {
    throw problem(err, "That code didn't work. Check it and try again.")
  }
}

/** "Scan without signing in": the phone keeps the trip. */
export async function continueAsGuest(): Promise<ThriftPlusSession> {
  writeJson(LS.guest, true)
  member = null
  return { status: 'guest' }
}

/** Sign out (the website's session ends too, server side). Works offline; the phone's trip and history go. */
export async function signOut(): Promise<ThriftPlusSession> {
  try {
    await post('/session/sign-out/')
  } catch {
    // Signing out locally still works offline.
  }
  member = null
  writeJson(LS.guest, null)
  writeJson(LS.cart, null)
  writeJson(LS.history, null)
  publishSession({ status: 'signed_out' })
  return { status: 'signed_out' }
}

// ── Guest cart and history (on the phone) ──────────────────────────────────

function guestLines(): ThriftPlusCartLine[] {
  return readJson<ThriftPlusCartLine[]>(LS.cart, []).filter((l) => l?.item?.sku && l.qty > 0)
}

function guestCart(lines: ThriftPlusCartLine[] = guestLines()): ThriftPlusCart {
  return { lines, totals: computeCartTotals(lines) }
}

function guestHistory(): ThriftPlusHistoryEntry[] {
  return readJson<ThriftPlusHistoryEntry[]>(LS.history, [])
}

function touchGuestHistory(item: ThriftPlusItemCard, decision?: 'added' | 'passed'): void {
  const rows = guestHistory().filter((e) => e.item.sku !== item.sku)
  const prior = guestHistory().find((e) => e.item.sku === item.sku)
  rows.unshift({ item, scanned_at: new Date().toISOString(), decision: decision ?? prior?.decision ?? null })
  writeJson(LS.history, rows.slice(0, 300))
}

// ── Tags, cart, signals ─────────────────────────────────────────────────────

/** A tag to pick in the scanner's test mode (staff only, owner 2026-10-10). */
export interface TestTag {
  sku: string
  title: string
  price: string
  reward: string
}

export async function fetchTestTags(): Promise<TestTag[]> {
  const data = await get<{ tags: TestTag[] }>('/test-tags/')
  return data.tags
}

/** One tag; never throws. `again`: a second look from the trip (APP D12), which the server doesn't count as a scan. */
export async function lookupTag(sku: string, { again = false }: { again?: boolean } = {}): Promise<TagLookup> {
  const code = sku.trim().toUpperCase()
  try {
    const path = `/tag/${encodeURIComponent(code)}/`
    const data = again ? await get<TagLookup>(path, { again: 1 }) : await get<TagLookup>(path)
    if (data.status === 'found' && !member) touchGuestHistory(data.item)
    return data
  } catch {
    return { status: 'error', sku: code, message: 'Could not reach the store. Check your signal and scan again.' }
  }
}

export async function getCart(): Promise<ThriftPlusCart> {
  if (!(await isMember())) return guestCart()
  return get<ThriftPlusCart>('/cart/')
}

export async function addToCart(item: ThriftPlusItemCard): Promise<ThriftPlusCart> {
  if (!item.available) throw new Error(`${item.title} is no longer on the floor.`)
  if (!(await isMember())) {
    const lines = guestLines()
    if (!lines.some((l) => l.item.sku === item.sku)) lines.unshift({ item, qty: 1, added_at: new Date().toISOString() })
    writeJson(LS.cart, lines)
    touchGuestHistory(item, 'added')
    void post('/added/', { sku: item.sku }).catch(() => undefined) // counts the add, anonymously
    return guestCart(lines)
  }
  try {
    return await post<ThriftPlusCart>('/cart/add/', { sku: item.sku })
  } catch (err) {
    throw problem(err, 'Could not add that. Try again.')
  }
}

export async function setCartQty(sku: string, qty: number): Promise<ThriftPlusCart> {
  const n = Math.max(0, Math.min(99, Math.floor(qty)))
  if (!(await isMember())) {
    const lines = guestLines().map((l) => (l.item.sku === sku ? { ...l, qty: n } : l)).filter((l) => l.qty > 0)
    writeJson(LS.cart, lines)
    return guestCart(lines)
  }
  return post<ThriftPlusCart>('/cart/qty/', { sku, qty: n })
}

export async function removeFromCart(sku: string): Promise<ThriftPlusCart> {
  return setCartQty(sku, 0)
}

export async function clearCart(): Promise<ThriftPlusCart> {
  if (!(await isMember())) {
    writeJson(LS.cart, [])
    return guestCart([])
  }
  return post<ThriftPlusCart>('/cart/clear/')
}

export async function passItem(sku: string): Promise<void> {
  if (!member) {
    const prior = guestHistory().find((e) => e.item.sku === sku)
    if (prior) touchGuestHistory(prior.item, 'passed')
  }
  await post('/pass/', { sku }).catch(() => undefined)
}

export async function sendPriceFeel(sku: string, feel: PriceFeel): Promise<void> {
  await post('/feel/', { sku, reason: feel.reason, would_pay: feel.would_pay }).catch(() => undefined)
}

// ── The member's own: ThriftBucks, account, Member QR ─────────────────────────

export interface ThriftPlusMe {
  /** Kept ThriftBucks (a number, never "$"): all of them, today's too. */
  banked: string
  /** The part usable today (B5); today's are ready tomorrow morning. */
  available?: string
  /** Thrift+ credit (dollars). */
  credit: string
  people: { id: number; first_name: string; role: 'primary' | 'secondary'; verified_18: boolean; is_you: boolean; cards: { id: number; last4: string; status: string }[] }[]
  /** Recent ThriftBucks ('bank') and Thrift+ credit rows. Older servers may send retired kinds; the screen skips them. */
  money: { kind: 'bank' | 'credit' | string; amount: string; reason: string; created_at: string }[]
  /** Kept ThriftBucks in the order they are used: soonest use-by first. */
  rewards?: { amount: string; earned_on: string; use_by: string; past_due: boolean; usable_from?: string; usable?: boolean }[]
  /** False for an old card session: changes need the email and password. */
  can_change: boolean
  /** Your email (T74): receipts and updates follow the address; store news can be turned off. */
  emails?: { updates: boolean; news: boolean; has_email: boolean; note: string }
  /** The Account section (owner 2026-10-20): your name, phone (digits) and photo. Missing on older servers. */
  you?: { name: string; phone: string; photo_url: string | null }
}

/** The code behind the Member QR (owner 2026-10-14: no card, APP D6): the QR the register scans. */
export interface MyCard {
  code: string
  /** "4021 5583 1907", for a cashier to type. */
  display: string
  /** What the QR holds: TP + the 12 digits (the register's scan reads it as is). */
  qr: string
  first_name: string
  /** False until the account is finished at a register (J2). */
  ready: boolean
}

export async function getMyCard(): Promise<MyCard> {
  return get<MyCard>('/me/card/')
}

export async function getMe(): Promise<ThriftPlusMe> {
  return get<ThriftPlusMe>('/me/')
}

/** Turn your store news emails off (any sign-in) or back on (the password sign-in). */
export async function setMyNews(on: boolean): Promise<ThriftPlusMe> {
  try {
    return await post<ThriftPlusMe>('/me/emails/', { news: on })
  } catch (err) {
    throw problem(err, 'Could not change that. Ask at the register.')
  }
}

/** The primary takes the second adult off, or the second adult leaves (then the answer is `signed_out`). */
export async function removePerson(personId: number): Promise<ThriftPlusMe | { status: 'signed_out' }> {
  try {
    return await post<ThriftPlusMe | { status: 'signed_out' }>('/me/remove-person/', { person: personId })
  } catch (err) {
    throw problem(err, 'Could not do that. Ask at the register.')
  }
}

/** Tests only: forget the member memo. */
export function _resetApi(): void {
  member = null
}
