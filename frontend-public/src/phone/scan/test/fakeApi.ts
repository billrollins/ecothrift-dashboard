/**
 * The scanner's fake server, for tests only: the live tests' `frontend/src/api/thriftPlusMock.ts` ported without axios,
 * one level lower. The live tests replaced the API module with the mock; here the REAL `scan/api.ts` and the store run,
 * and `fetch` answers from this in-memory server (same samples, same codes, same answers, same words). What the phone
 * keeps (the non-member trip, the Member QR copy) stays in localStorage under the live keys, as in production.
 *
 *   const fake = installFakeApi()       // in beforeEach: stubs global fetch, resets everything
 *   fake.signIn('dana')                 // a member session, as "Staff sign in" would make (the mock's signIn)
 *   fake.requestSignInEmail('a@b.co')   // an emailed link and code in fake.outbox()
 *   fake.setOpen(false)                 // Thrift+ off: session/ answers 403 THRIFT_PLUS_OFF
 *   fake.calls()                        // every request: method, path, query, body
 */
import { vi } from 'vitest'
import {
  computeCartTotals,
  fromCents,
  readContact,
  ThriftPlusError,
  toCents,
  type EmailSignIn,
  type FinishStep,
  type SignInOptions,
  type SignInPurpose,
  type ThriftPlusCartLine,
  type ThriftPlusCategory,
  type ThriftPlusItemCard,
  type ThriftPlusMember,
  type ThriftPlusSession,
} from '../core'

// ── Sample tags (the mock's) ────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ThriftPlusCategory, string> = {
  furniture: 'Furniture', electronics: 'Electronics', appliances: 'Appliances', kitchen: 'Kitchen', home_decor: 'Home decor',
  bedding: 'Bedding and linens', lighting: 'Lighting', toys: 'Toys and games', tools: 'Tools', outdoor: 'Outdoor',
  sporting: 'Sports and outdoors', books_media: 'Books and media', clothing: 'Clothing', baby: 'Baby', other: 'Home goods',
}

type Sample = Omit<ThriftPlusItemCard, 'member_price' | 'category_label' | 'age_restricted' | 'returnable' | 'available'> &
  Partial<Pick<ThriftPlusItemCard, 'age_restricted' | 'returnable' | 'available'>>

const SAMPLES: Sample[] = [
  { sku: 'TP0000001', title: 'Cordless Drill Kit', category: 'tools', details: ['DeWalt 20V', 'Two batteries and charger', 'Tested, works'], retail_price: '100.00', price: '60.00', reward: '15.00' },
  { sku: 'TP0000002', title: 'KitchenAid stand mixer', category: 'kitchen', details: ['KitchenAid, 5 qt', 'Tested, works'], retail_price: '449.99', price: '179.99', reward: '32.40' },
  { sku: 'TP0000003', title: 'Mid-century accent chair', category: 'furniture', details: ['Walnut legs, teal fabric'], retail_price: '289.00', price: '89.99', reward: '12.00' },
  { sku: 'TP0000004', title: 'Samsung 50 in 4K TV', category: 'electronics', details: ['Samsung, remote included', 'Tested, works'], retail_price: '399.99', price: '199.99', reward: '26.00' },
  { sku: 'TP0000005', title: 'LEGO Classic brick box', category: 'toys', details: ['LEGO, 790 pieces', 'Sealed box'], retail_price: '59.99', price: '24.99', reward: '3.60' },
  { sku: 'TP0000006', title: 'Brass table lamp', category: 'lighting', details: ['Linen shade, 26 in'], retail_price: '79.99', price: '19.99', reward: '0.00' },
  { sku: 'TP0000007', title: 'Nike running shoes, men 10', category: 'clothing', details: ['Nike', 'Like new'], retail_price: '120.00', price: '29.99', reward: '4.00', returnable: false },
  { sku: 'TP0000008', title: 'Patio set, 4 pc', category: 'outdoor', details: ['Wicker, cushions included'], retail_price: '599.00', price: '149.99', reward: '18.00', available: false },
]

function cardOf(s: Sample): ThriftPlusItemCard {
  return {
    ...s,
    category_label: CATEGORY_LABELS[s.category],
    member_price: fromCents(toCents(s.price) - toCents(s.reward)),
    age_restricted: s.age_restricted ?? false,
    returnable: s.returnable ?? true,
    available: s.available ?? true,
  }
}

export const SAMPLE_CARDS = new Map(SAMPLES.map((s) => [s.sku, cardOf(s)]))

// ── Server state ────────────────────────────────────────────────────────────

interface ServerSession {
  email: string
  username: string | null
  first_name?: string
  ready: boolean
  kind?: 'password' | 'email' | 'phone'
  selfie?: boolean
  signed?: boolean
  phone_verified?: boolean
  contact?: string
  phone?: string
  /** A staff or practice member: let in while Thrift+ is off (the live staff test mode). */
  tester?: boolean
}

/** A text or email the fake "sent": its link token (emails only) and 6-digit code (one use, 15 minutes, 5 wrong kill it). */
export interface FakeMessage {
  to: string
  channel: 'sms' | 'email'
  purpose: SignInPurpose
  token: string
  code: string
  sentAt: number
  used: boolean
  wrong: number
}

interface Join {
  first_name: string
  verified: boolean
  selfie: boolean
  signed: boolean
}

export type FakeCall = { method: string; path: string; query: Record<string, string>; body: unknown }

const DEFAULT_OPTIONS: SignInOptions = { google_client_id: null, phone: true, email: true }
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const EMAIL_MINUTES = 15
const BASE = '/api/thriftplus/public'

function freshState() {
  return {
    latencyMs: 0,
    open: true,
    offline: false,
    session: null as ServerSession | null,
    messages: [] as FakeMessage[],
    joins: new Map<string, Join>(),
    options: { ...DEFAULT_OPTIONS } as SignInOptions,
    finished: [] as Array<{ step: FinishStep; contact: string; terms_version?: string }>,
    requirePhone: false,
    cart: [] as ThriftPlusCartLine[],
    signals: [] as Array<{ kind: string; sku: string; body?: unknown }>,
    calls: [] as FakeCall[],
    tags: new Map<string, ThriftPlusItemCard | null>(),
    testTags: [] as Array<{ sku: string; title: string; price: string; reward: string }>,
    me: null as Record<string, unknown> | null,
    fail: [] as Array<{ method: string; path: string; status: number; body: unknown; times: number }>,
  }
}

let state = freshState()

function memberOfSession(s: ServerSession): ThriftPlusMember {
  const ready = s.ready
  const selfie = ready || !!s.selfie
  const signed = ready || !!s.signed
  const steps: FinishStep[] = ready ? [] : [...(selfie ? [] : ['selfie' as const]), ...(signed ? [] : ['sign' as const])]
  return {
    first_name: s.first_name || 'Dana',
    email: s.email,
    username: s.username,
    card_last4: ready ? '4821' : null,
    verified_18: ready,
    banked_rewards: ready ? '27.50' : '0.00',
    bucks_available: ready ? '27.50' : '0.00',
    credit_balance: '0.00',
    ready,
    email_verified: s.email !== '',
    selfie,
    signed,
    phone_verified: !!s.phone_verified,
    finish_steps: steps,
    needs_phone: state.requirePhone && !s.phone && s.kind !== 'phone',
    phone: s.phone ? s.phone.replace(/\D/g, '').slice(-10) : '',
    ...(s.kind ? { session_kind: s.kind } : {}),
    ...(s.tester && !state.open ? { test_mode: true } : {}),
  }
}

function sessionPayload(): ThriftPlusSession {
  return state.session ? { status: 'member', member: memberOfSession(state.session) } : { status: 'signed_out' }
}

function send(to: string, purpose: SignInPurpose, channel: 'sms' | 'email' = 'email'): void {
  const n = state.messages.length + 1
  state.messages.push({ to, channel, purpose, token: `mock-link-${n}`, code: String(100000 + ((n * 271_829) % 900_000)), sentAt: Date.now(), used: false, wrong: 0 })
}

const newJoin = (first: string): Join => ({ first_name: first, verified: false, selfie: false, signed: false })
const expired = (m: FakeMessage) => m.wrong >= 5 || Date.now() - m.sentAt > EMAIL_MINUTES * 60_000

function signInAs(contact: string, purpose: SignInPurpose): EmailSignIn {
  const joined = state.joins.get(contact)
  if (joined) joined.verified = true
  const byPhone = contact.startsWith('+')
  state.session = {
    email: byPhone ? '' : contact, username: null, first_name: joined?.first_name, ready: !joined, kind: byPhone ? 'phone' : 'email',
    selfie: joined?.selfie, signed: joined?.signed, phone_verified: byPhone, contact,
  }
  state.cart = []
  return { ...sessionPayload(), purpose }
}

function checkSent(to: string, code: string): EmailSignIn {
  const sent = [...state.messages].reverse().find((m) => m.to === to && !m.used)
  if (!sent) throw new ThriftPlusError("That code didn't work. Check it and try again.", 'CODE_BAD')
  if (expired(sent) && sent.channel === 'sms') throw new ThriftPlusError("That code didn't work. Check it and try again.", 'CODE_BAD')
  if (expired(sent)) throw new ThriftPlusError('That code has expired. Send a new one.', 'CODE_EXPIRED')
  if (code.trim() !== sent.code) {
    sent.wrong += 1
    throw new ThriftPlusError("That code didn't work. Check it and try again.", 'CODE_BAD')
  }
  sent.used = true
  return signInAs(sent.to, sent.purpose)
}

function googlePerson(credential: string): { email: string; given_name: string } | null {
  try {
    const part = credential.split('.')[1] ?? ''
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
    const email = typeof json.email === 'string' ? json.email.trim().toLowerCase() : ''
    return EMAIL_RE.test(email) ? { email, given_name: String(json.given_name ?? '') } : null
  } catch {
    return null
  }
}

function pendingJoin(): { join: Join; contact: string; s: ServerSession } {
  const s = state.session
  if (!s) throw new ThriftPlusError('Sign in first.', 'NOT_SIGNED_IN')
  const contact = s.contact ?? ''
  const join = state.joins.get(contact)
  if (s.ready || !join) throw new ThriftPlusError('Your membership is already finished. Ask at the register to change it.', 'NOT_PENDING')
  return { join, contact, s }
}

/** Owner 2026-11-03 (J8): a phone join with the selfie and I agree is a member at once. */
function finishedOnPhone(join: Join, contact: string, s: ServerSession) {
  if (join.selfie && join.signed && !contact.includes('@')) s.ready = true
}

const cartPayload = () => ({ lines: state.cart, totals: computeCartTotals(state.cart) })

class Answer {
  constructor(public status: number, public body: unknown, public headers: Record<string, string> = {}) {}
}

const fail = (status: number, detail: string, code: string) => new Answer(status, { detail, code })

function needMember(): ServerSession {
  if (!state.session) throw new Answer(403, { detail: 'Sign in first.', code: 'NOT_SIGNED_IN' })
  return state.session
}

// ── Routes ──────────────────────────────────────────────────────────────────

type Handler = (body: Record<string, unknown>, query: Record<string, string>, raw: unknown) => unknown

/** Routes open while Thrift+ is off (the live SIGN_IN set). */
const SIGN_IN = new Set(['POST session/password/', 'POST session/link/', 'POST google/', 'POST code/check/', 'GET sign-in-options/'])

const ROUTES: Record<string, Handler> = {
  'GET session/': () => sessionPayload(),
  'GET sign-in-options/': () => ({ ...state.options }),
  'POST session/password/': (b) => {
    const who = String(b.login ?? '').trim()
    if (who.length < 3 || String(b.password ?? '').length < 4) throw fail(401, "That email or password isn't right.", 'LOGIN_BAD')
    const isEmail = who.includes('@')
    state.session = { email: isEmail ? who.toLowerCase() : `${who.toLowerCase()}@example.com`, username: isEmail ? null : who, ready: true, kind: 'password', tester: true }
    state.cart = []
    return sessionPayload()
  },
  'POST session/link/': (b) => {
    const sent = state.messages.find((m) => m.token === b.token && m.channel === 'email')
    if (!sent) throw fail(400, "That link didn't work. Send a new one.", 'LINK_BAD')
    if (sent.used) throw fail(400, 'That link has already been used. Send a new one.', 'LINK_USED')
    if (expired(sent)) throw fail(400, 'That link has expired. Send a new one.', 'LINK_EXPIRED')
    sent.used = true
    return signInAs(sent.to, sent.purpose)
  },
  'POST code/send/': (b) => {
    const who = String(b.first_name ?? '').replace(/\s+/g, ' ').trim()
    const hasLast = !!String(b.last_name ?? '').trim()
    if (!!who !== hasLast) throw new ThriftPlusError('Enter your first and last name.', 'NAME_NEEDED')
    const read = readContact(String(b.contact ?? ''))
    if (!read) throw new ThriftPlusError('Enter a US phone number or an email.', 'CONTACT_BAD')
    if (read.kind === 'phone' && !state.options.phone) throw new ThriftPlusError('Enter your email.', 'PHONE_OFF')
    const channel = read.kind === 'phone' ? 'sms' : 'email'
    const joined = state.joins.get(read.value)
    if (who && !joined) state.joins.set(read.value, newJoin(who))
    const pending = who ? !joined || !joined.verified : !!joined && !joined.verified
    send(read.value, pending ? 'join' : 'sign_in', channel)
    return { status: 'sent', channel }
  },
  'POST code/check/': (b) => {
    const read = readContact(String(b.contact ?? ''))
    if (!read) throw new ThriftPlusError("That code didn't work. Check it and try again.", 'CODE_BAD')
    return checkSent(read.value, String(b.code ?? ''))
  },
  'POST google/': (b) => {
    if (!state.options.google_client_id) throw new ThriftPlusError('Google sign-in is off. Use your email or phone.', 'GOOGLE_OFF')
    const person = googlePerson(String(b.credential ?? ''))
    if (!person) throw new ThriftPlusError("Google didn't sign you in. Try again, or use your email or phone.", 'GOOGLE_BAD')
    const joined = state.joins.get(person.email)
    if (!joined) state.joins.set(person.email, newJoin(person.given_name.trim() || 'Member'))
    return signInAs(person.email, joined ? 'sign_in' : 'join')
  },
  'POST session/sign-out/': () => {
    state.session = null
    state.cart = []
    return { status: 'signed_out' }
  },
  'POST me/selfie/': (_b, _q, raw) => {
    const { join, contact, s } = pendingJoin()
    const photo = raw instanceof FormData ? raw.get('photo') : null
    if (!(photo instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
      throw new ThriftPlusError('That file is not a photo. Take your selfie again.', 'PHOTO_BAD')
    }
    if (!photo.size) throw new ThriftPlusError('Take your selfie first.', 'PHOTO_NEEDED')
    join.selfie = true
    s.selfie = true
    finishedOnPhone(join, contact, s)
    state.finished.push({ step: 'selfie', contact })
    return sessionPayload()
  },
  'POST me/signature/': (b) => {
    const { join, contact, s } = pendingJoin()
    join.signed = true
    s.signed = true
    finishedOnPhone(join, contact, s)
    state.finished.push({ step: 'sign', contact, terms_version: String(b.terms_version ?? '') })
    return sessionPayload()
  },
  'POST me/phone/send/': (b) => {
    needMember()
    const read = readContact(String(b.phone ?? ''))
    if (!read || read.kind !== 'phone') throw new ThriftPlusError('Enter a US phone number or an email.', 'CONTACT_BAD')
    if (!state.options.phone) throw new ThriftPlusError('Texts are off right now. Enter your email.', 'PHONE_OFF')
    send(read.value, 'sign_in', 'sms')
    return { status: 'sent' }
  },
  'POST me/phone/': (b) => {
    const s = needMember()
    const read = readContact(String(b.phone ?? ''))
    const bad = new ThriftPlusError("That code didn't work. Check it and try again.", 'CODE_BAD')
    if (!read || read.kind !== 'phone') throw bad
    const sent = [...state.messages].reverse().find((m) => m.to === read.value && m.channel === 'sms' && !m.used)
    if (!sent || expired(sent)) throw bad
    if (String(b.code ?? '').trim() !== sent.code) {
      sent.wrong += 1
      throw bad
    }
    sent.used = true
    s.phone = read.value
    s.phone_verified = true
    return sessionPayload()
  },
  'GET test-tags/': () => ({ tags: state.testTags }),
  'POST pass/': (b) => (state.signals.push({ kind: 'pass', sku: String(b.sku) }), {}),
  'POST added/': (b) => (state.signals.push({ kind: 'added', sku: String(b.sku) }), {}),
  'POST feel/': (b) => (state.signals.push({ kind: 'feel', sku: String(b.sku), body: b }), {}),
  'GET cart/': () => (needMember(), cartPayload()),
  'POST cart/add/': (b) => {
    needMember()
    const item = SAMPLE_CARDS.get(String(b.sku)) ?? state.tags.get(String(b.sku))
    if (!item) throw fail(404, 'We cannot find that item.', 'NOT_FOUND')
    if (!item.available) throw fail(400, `${item.title} is no longer on the floor.`, 'SOLD')
    if (!state.cart.some((l) => l.item.sku === item.sku)) state.cart.unshift({ item, qty: 1, added_at: new Date().toISOString() })
    return cartPayload()
  },
  'POST cart/qty/': (b) => {
    needMember()
    const n = Math.max(0, Math.min(99, Math.floor(Number(b.qty))))
    state.cart = state.cart.map((l) => (l.item.sku === b.sku ? { ...l, qty: n } : l)).filter((l) => l.qty > 0)
    return cartPayload()
  },
  'POST cart/clear/': () => (needMember(), (state.cart = []), cartPayload()),
  'GET me/': () => {
    needMember()
    return state.me ?? {
      banked: '10.25', credit: '8.56', can_change: true, people: [], money: [],
      rewards: [{ amount: '10.25', earned_on: '2026-10-02', use_by: '2026-11-01', past_due: false }],
    }
  },
  'GET me/card/': () => {
    const s = needMember()
    const m = memberOfSession(s)
    return { code: '402155831907', display: '4021 5583 1907', qr: 'TP402155831907', first_name: m.first_name, ready: m.ready !== false }
  },
  'POST me/emails/': (b) => (needMember(), { ...(ROUTES['GET me/']({}, {}, null) as object), emails: { updates: true, news: !!b.news, has_email: true, note: '' } }),
  'POST me/remove-person/': () => (needMember(), (state.session = null), { status: 'signed_out' }),
}

function route(method: string, sub: string, body: Record<string, unknown>, query: Record<string, string>, raw: unknown): Answer {
  const failing = state.fail.find((f) => f.method === method && f.path === sub && f.times > 0)
  if (failing) {
    failing.times -= 1
    return new Answer(failing.status, failing.body)
  }
  const key = `${method} ${sub}`
  const tester = !!state.session?.tester
  if (!state.open && !tester && !SIGN_IN.has(key)) return fail(403, 'Thrift+ opens soon. Ask at the register.', 'THRIFT_PLUS_OFF')
  const tag = method === 'GET' && sub.match(/^tag\/([^/]+)\/$/)
  if (tag) {
    const sku = decodeURIComponent(tag[1])
    const item = state.tags.has(sku) ? state.tags.get(sku) ?? null : SAMPLE_CARDS.get(sku) ?? null
    if (query.again !== '1') state.signals.push({ kind: 'scan', sku })
    return new Answer(200, item ? { status: 'found', item } : { status: 'not_found', sku })
  }
  const handler = ROUTES[key]
  if (!handler) return new Answer(404, { detail: 'Not found.' })
  try {
    return new Answer(200, handler(body, query, raw))
  } catch (err) {
    if (err instanceof Answer) return err
    if (err instanceof ThriftPlusError) return new Answer(err.code === 'TOO_MANY' || err.code === 'LOCKED' ? 429 : 400, { detail: err.message, code: err.code })
    throw err
  }
}

async function fakeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost')
  const method = (init.method || 'GET').toUpperCase()
  if (state.latencyMs > 0) await new Promise((r) => setTimeout(r, state.latencyMs))
  if (state.offline) throw new TypeError('Failed to fetch')
  if (!url.pathname.startsWith(`${BASE}/`)) return new Response('{}', { status: 404 })
  const sub = url.pathname.slice(BASE.length + 1)
  const raw = init.body
  let body: Record<string, unknown> = {}
  if (typeof raw === 'string') {
    try {
      body = JSON.parse(raw) as Record<string, unknown>
    } catch {
      body = {}
    }
  }
  const query = Object.fromEntries(url.searchParams.entries())
  state.calls.push({ method, path: sub, query, body: raw instanceof FormData ? raw : body })
  const a = route(method, sub, body, query, raw)
  return new Response(JSON.stringify(a.body ?? {}), { status: a.status, headers: { 'Content-Type': 'application/json', ...a.headers } })
}

// ── Controls ────────────────────────────────────────────────────────────────

export const fake = {
  reset(): void {
    state = freshState()
  },
  setLatency(ms: number): void {
    state.latencyMs = ms
  },
  /** Thrift+ open (true) or off (false: everything but signing in answers 403 THRIFT_PLUS_OFF, staff get through). */
  setOpen(open: boolean): void {
    state.open = open
  },
  /** No answer at all: every request rejects, as with no signal. */
  setOffline(offline: boolean): void {
    state.offline = offline
  },
  /** The next `times` calls to `METHOD path/` answer this status and body (`path` without the base, e.g. 'cart/'). */
  failNext(method: 'GET' | 'POST', path: string, status: number, body: unknown = {}, times = 1): void {
    state.fail.push({ method, path, status, body, times })
  },
  /** A member session, as "Staff sign in" makes it (the mock's `signIn`): ready, staff (let in while Thrift+ is off). */
  signIn(login = 'dana'): void {
    const isEmail = login.includes('@')
    state.session = { email: isEmail ? login.toLowerCase() : `${login.toLowerCase()}@example.com`, username: isEmail ? null : login, ready: true, kind: 'password', tester: true }
  },
  signOut(): void {
    state.session = null
  },
  /** The phone scans without signing in (the client's own flag, as `continueAsGuest` leaves it). */
  guestOnThisPhone(): void {
    window.localStorage.setItem('thriftPlus.real.guest', 'true')
  },
  /** "Email me a link": a sign-in email in the outbox (a pending joiner's is a join email). */
  requestSignInEmail(email: string): void {
    const to = email.trim().toLowerCase()
    const joined = state.joins.get(to)
    send(to, joined && !joined.verified ? 'join' : 'sign_in')
  },
  /** Joined online with a name and email: pending, with a join email in the outbox. */
  joinThriftPlus(first: string, _last: string, email: string): void {
    const to = email.trim().toLowerCase()
    const joined = state.joins.get(to)
    if (!joined) state.joins.set(to, newJoin(first.trim()))
    send(to, !joined || !joined.verified ? 'join' : 'sign_in')
  },
  /** Use a link now (as if opened elsewhere). */
  useLink(token: string): void {
    const sent = state.messages.find((m) => m.token === token)
    if (sent) {
      sent.used = true
      signInAs(sent.to, sent.purpose)
    }
  },
  outbox(): FakeMessage[] {
    return state.messages.map((m) => ({ ...m }))
  },
  lastCode(): string {
    return state.messages.at(-1)?.code ?? ''
  },
  setSignInOptions(options: Partial<SignInOptions>): void {
    state.options = { ...state.options, ...options, email: true }
  },
  googleCredential(email: string, givenName = '', familyName = ''): string {
    const part = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
    return `${part({ alg: 'none' })}.${part({ email, given_name: givenName, family_name: familyName })}.mock`
  },
  setRequirePhone(on: boolean): void {
    state.requirePhone = on
  },
  finished() {
    return state.finished.map((f) => ({ ...f }))
  },
  /** A tag the samples do not have (null: not found). */
  setTag(sku: string, item: ThriftPlusItemCard | null): void {
    state.tags.set(sku, item)
  },
  setTestTags(tags: Array<{ sku: string; title: string; price: string; reward: string }>): void {
    state.testTags = tags
  },
  setMe(me: Record<string, unknown> | null): void {
    state.me = me
  },
  sampleTags(): Array<{ sku: string; title: string }> {
    return SAMPLES.map((s) => ({ sku: s.sku, title: s.title }))
  },
  signals() {
    return [...state.signals]
  },
  calls(): FakeCall[] {
    return [...state.calls]
  },
  /** How many requests went to `METHOD path/`. */
  count(method: string, path: string): number {
    return state.calls.filter((c) => c.method === method && c.path === path).length
  },
  serverCart(): ThriftPlusCartLine[] {
    return [...state.cart]
  },
  isSignedIn(): boolean {
    return !!state.session
  },
}

export type FakeApi = typeof fake

/** Stub `fetch` with the fake server and reset it. Call in `beforeEach`; `vi.unstubAllGlobals()` takes it off. */
export function installFakeApi(): FakeApi {
  fake.reset()
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
  return fake
}
