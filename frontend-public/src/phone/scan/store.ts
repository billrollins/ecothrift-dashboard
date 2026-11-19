/**
 * The scanner's one store (PLAN-SCANNER.md section 4): session, open, trip (cart), me, Member QR (card), sign-in options
 * and test tags, with hooks. It does what react-query did for the live scanner (useThriftPlus.ts), with no library:
 *
 * - **Session:** read from `lib/member.ts`, the one member of the phone site (the top bar reads the same answer). Loaded
 *   once; every new answer (fetched or published by a sign-in) re-derives it, numbered so a late answer cannot undo a
 *   sign-in. `open` comes from the same `session/` answer (403 THRIFT_PLUS_OFF), never from a second request, and is
 *   asked again after each sign-in or sign-out (staff test mode).
 * - **A new session forgets the last person:** Member QR and me dropped, localStorage `tp-my-card` removed, the trip
 *   reloaded.
 * - **Trip:** fetched once per session; every change replaces it with the server's answer (no optimistic update); a
 *   failed change stays silent. Undo puts lines back one at a time (`restoreLines`).
 * - **Me:** reloaded each time a screen that shows it mounts (the last data stays on screen meanwhile); again after the
 *   news switch or a removal; a removal that answers `signed_out` ends the session.
 * - **Member QR:** shown at once from localStorage `tp-my-card`, fetched again only when older than 60 seconds.
 * - **Test tags:** fetched once, only in type-only mode. **Sign-in options:** fetched once.
 * - One retry on `cart/`, `me/`, `me/card/`; nothing refetches on focus; they reload when the phone comes back online.
 * - Every action exposes `pending` through `useAction`, and a second tap while pending sends nothing.
 *
 * Not in the entry chunk: only the scanner (lazy) and the Thrift+ page import this file.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { fetchSession, lastSessionAnswer, onSessionAnswer, publishSession, type SessionAnswer } from '../lib/member'
import * as api from './api'
import type { MyCard, TestTag, ThriftPlusMe } from './api'
import type {
  EmailSignIn,
  PriceFeel,
  SignInOptions,
  ThriftPlusCart,
  ThriftPlusCartLine,
  ThriftPlusItemCard,
  ThriftPlusMember,
  ThriftPlusSession,
} from './core'

/** The Member QR kept on the phone, so it shows with no signal (the live scanner's key). */
export const MY_CARD_KEY = 'tp-my-card'
/** The Member QR is fetched again only when the copy on screen is older than this. */
export const CARD_FRESH_MS = 60_000

/** One thing the store loads: the last data (kept while it reloads), the last error, and whether a load is out. */
export type Loaded<T> = { data: T | undefined; error: unknown; loading: boolean; at: number }

export type ScanState = {
  /** Null until the first `session/` answer. */
  session: ThriftPlusSession | null
  /** False while Thrift+ is off for this phone; null until the first answer (offline counts as open). */
  open: boolean | null
  options: SignInOptions | null
  cart: Loaded<ThriftPlusCart>
  me: Loaded<ThriftPlusMe>
  /** The Member QR. */
  myCard: Loaded<MyCard>
  testTags: Loaded<TestTag[]>
}

const empty = <T,>(data?: T): Loaded<T> => ({ data, error: null, loading: false, at: 0 })

function cachedCard(): MyCard | undefined {
  try {
    const raw = localStorage.getItem(MY_CARD_KEY)
    return raw ? (JSON.parse(raw) as MyCard) : undefined
  } catch {
    return undefined
  }
}

function fresh(): ScanState {
  return { session: null, open: null, options: null, cart: empty(), me: empty(), myCard: empty(cachedCard()), testTags: empty() }
}

let state: ScanState = fresh()
const listeners = new Set<() => void>()
/** How many mounted screens want each resource (so a new session or coming back online reloads only what is shown). */
const wanted = { cart: 0, me: 0, myCard: 0 }
/** Each load takes a number; an answer from before a newer load (or a new session) is dropped. */
const loadSeq = { cart: 0, me: 0, myCard: 0, testTags: 0, options: 0 }

function setState(patch: Partial<ScanState>) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** The whole state, or a slice: `useScanStore((s) => s.cart)`. The pick must return a part of the state as it is (a new
 *  object each call would render forever). */
export function useScanStore<T>(pick: (s: ScanState) => T): T {
  const get = useCallback(() => pick(state), [pick])
  return useSyncExternalStore(subscribe, get, get)
}

export function getScanState(): ScanState {
  return state
}

// ── Session ─────────────────────────────────────────────────────────────────

let sessionAsked = false

/** A new person (signed in, out, or scanning without signing in): forget the last one's Member QR and account, on the
 *  phone too, and reload the trip. */
function forgetLastPerson() {
  loadSeq.me += 1
  loadSeq.myCard += 1
  loadSeq.cart += 1
  try {
    localStorage.removeItem(MY_CARD_KEY)
  } catch {
    /* private mode: nothing was kept */
  }
  setState({ me: empty(), myCard: empty(), cart: empty() })
}

function sameSession(a: ThriftPlusSession | null, b: ThriftPlusSession | null): boolean {
  if (!a || !b) return a === b
  return a.status === b.status
}

/** Every `session/` answer (fetched by anyone on the site, or published by a sign-in) lands here. */
function onAnswer(a: SessionAnswer) {
  const { session, open } = api.sessionOfAnswer(a)
  const before = state.session
  const patch: Partial<ScanState> = { session }
  // A published session (a sign-in's answer) says nothing about the switch: `open` only comes from the server.
  if (!a.published || state.open === null) patch.open = a.published ? true : open
  setState(patch)
  if (before && !sameSession(before, session)) forgetLastPerson()
}

onSessionAnswer(onAnswer)
{
  // The top bar may have asked already (this page load): the scanner opens on that answer with no second request.
  const known = lastSessionAnswer()
  if (known) onAnswer(known)
}

/** Load the session once (the top bar's answer of this page load counts). */
export function loadSession(): void {
  if (state.session || sessionAsked) return
  sessionAsked = true
  const known = lastSessionAnswer()
  if (known) {
    onAnswer(known)
    return
  }
  void fetchSession().then((a) => {
    // Overtaken by a newer answer: that one already landed. No answer at all cannot happen (offline is an answer).
    if (!a && !state.session) sessionAsked = false
  })
}

/** Ask `session/` again: whether Thrift+ is open to this phone after a sign-in or sign-out (staff test mode). */
export function reloadSession(): Promise<unknown> {
  sessionAsked = true
  return fetchSession()
}

/** After a sign-in, a sign-out or scanning without signing in. */
function newSession(session: ThriftPlusSession) {
  setState({ session })
  forgetLastPerson()
  void reloadSession()
}

function sessionOf(r: EmailSignIn): ThriftPlusSession {
  const { purpose: _purpose, ...session } = r
  return session as ThriftPlusSession
}

/** `{session, open}`. `enabled` false holds the first load (while a texted or emailed link signs in). */
export function useScanSession(enabled = true): { session: ThriftPlusSession | null; open: boolean | null } {
  const session = useScanStore(pickSession)
  const open = useScanStore(pickOpen)
  useEffect(() => {
    if (enabled) loadSession()
  }, [enabled])
  return { session, open }
}
function pickSession(s: ScanState) { return s.session }
function pickOpen(s: ScanState) { return s.open }

/** The member, or null (signed out, scanning without signing in, or not known yet). */
export function useScanMember(): ThriftPlusMember | null {
  const session = useScanStore(pickSession)
  return session?.status === 'member' ? session.member : null
}

// ── Loads with one retry ────────────────────────────────────────────────────

async function once<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (retries <= 0) throw err
    return once(fn, retries - 1)
  }
}

type Key = 'cart' | 'me' | 'myCard' | 'testTags'

async function load<T>(key: Key, fn: () => Promise<T>, retries: number): Promise<T | undefined> {
  const mine = ++loadSeq[key]
  setState({ [key]: { ...(state[key] as Loaded<T>), loading: true } } as Partial<ScanState>)
  try {
    const data = await once(fn, retries)
    if (mine === loadSeq[key]) setState({ [key]: { data, error: null, loading: false, at: Date.now() } } as Partial<ScanState>)
    return data
  } catch (error) {
    if (mine === loadSeq[key]) setState({ [key]: { ...(state[key] as Loaded<T>), error, loading: false } } as Partial<ScanState>)
    return undefined
  }
}

export function loadCart() {
  return load('cart', api.getCart, 1)
}

export function loadMe() {
  return load('me', api.getMe, 1)
}

export async function loadCard() {
  const card = await load('myCard', api.getMyCard, 1)
  if (card) {
    try {
      localStorage.setItem(MY_CARD_KEY, JSON.stringify(card))
    } catch {
      /* private mode: it just won't be there offline */
    }
  }
  return card
}

function setCart(cart: ThriftPlusCart) {
  loadSeq.cart += 1
  setState({ cart: { data: cart, error: null, loading: false, at: Date.now() } })
}

function useWanted(key: keyof typeof wanted) {
  useEffect(() => {
    wanted[key] += 1
    return () => {
      wanted[key] -= 1
    }
  }, [key])
}

/** The trip: loaded once per session (after the session is known). */
export function useCart(): Loaded<ThriftPlusCart> {
  const cart = useScanStore(pickCart)
  const session = useScanStore(pickSession)
  useWanted('cart')
  useEffect(() => {
    // A screen that opens on a failed load tries again (react-query refetched an errored query on mount).
    if (state.session && state.cart.error && !state.cart.data && !state.cart.loading) void loadCart()
  }, [])
  useEffect(() => {
    if (session && !cart.at && !cart.loading && !cart.error) void loadCart()
  }, [session, cart.at, cart.loading, cart.error])
  return cart
}
function pickCart(s: ScanState) { return s.cart }

/** The member's balance and account: reloaded each time a screen using it mounts; the last data stays meanwhile. */
export function useMe(enabled = true): Loaded<ThriftPlusMe> {
  const me = useScanStore(pickMe)
  useWanted('me')
  useEffect(() => {
    if (enabled) void loadMe()
  }, [enabled])
  return me
}
function pickMe(s: ScanState) { return s.me }

/** The Member QR: at once from the phone's copy; fetched when there is none or it is older than 60 seconds. */
export function useMyCard(enabled = true): Loaded<MyCard> {
  const card = useScanStore(pickCard)
  useWanted('myCard')
  useEffect(() => {
    if (!enabled) return
    const c = state.myCard
    if (!c.loading && (!c.data || Date.now() - c.at > CARD_FRESH_MS)) void loadCard()
  }, [enabled])
  return card
}
function pickCard(s: ScanState) { return s.myCard }

/** The staff test mode's tags (type-only mode): fetched once. */
export function useTestTags(enabled: boolean): Loaded<TestTag[]> {
  const tags = useScanStore(pickTestTags)
  useEffect(() => {
    const t = state.testTags
    if (enabled && !t.at && !t.loading && !t.error) void load('testTags', api.fetchTestTags, 0)
  }, [enabled])
  return tags
}
function pickTestTags(s: ScanState) { return s.testTags }

/** The ways in (Join v2): fetched once. Null until they come (the sign-in screen shows email-only meanwhile). */
export function useSignInOptions(): SignInOptions | null {
  const options = useScanStore(pickOptions)
  useEffect(() => {
    if (state.options) return
    const mine = ++loadSeq.options
    void api.getSignInOptions().then((o) => {
      if (mine === loadSeq.options) setState({ options: o })
    })
  }, [])
  return options
}
function pickOptions(s: ScanState) { return s.options }

if (typeof window !== 'undefined') {
  // React-query's default the live scanner had: reload what is on screen when the phone comes back online.
  window.addEventListener('online', () => {
    if (wanted.cart > 0) void loadCart()
    if (wanted.me > 0) void loadMe()
    if (wanted.myCard > 0) void loadCard()
  })
}

// ── Actions ─────────────────────────────────────────────────────────────────
// Each one calls the API and puts the answer in the store. Views call them through `useAction` (pending, error).

export const actions = {
  // Sign-in (S1). A sign-in's answer is already published to the whole site by api.ts.
  async signIn({ login, password }: { login: string; password: string }): Promise<ThriftPlusSession> {
    const s = await api.signIn(login, password)
    newSession(s)
    return s
  },
  async continueAsGuest(): Promise<ThriftPlusSession> {
    const s = await api.continueAsGuest()
    newSession(s)
    return s
  },
  async signOut(): Promise<ThriftPlusSession> {
    const s = await api.signOut()
    newSession(s)
    return s
  },
  sendCode({ contact, first = '', last = '' }: { contact: string; first?: string; last?: string }) {
    return api.sendCode(contact, first, last)
  },
  async checkCode({ contact, code }: { contact: string; code: string }): Promise<EmailSignIn> {
    const r = await api.checkCode(contact, code)
    newSession(sessionOf(r))
    return r
  },
  async signInWithGoogle(credential: string): Promise<EmailSignIn> {
    const r = await api.signInWithGoogle(credential)
    newSession(sessionOf(r))
    return r
  },
  async signInWithLink(token: string): Promise<EmailSignIn> {
    const r = await api.signInWithLink(token)
    newSession(sessionOf(r))
    return r
  },
  /** Signed in elsewhere on this phone (the link in another tab, CheckCode's return check): take that session. */
  adopt(session: ThriftPlusSession): void {
    publishSession(session.status === 'member' ? { status: 'member', member: session.member } : { status: 'signed_out' })
    newSession(session)
  },
  // Finish joining (S2) and Add your mobile number (S1): each answer is the member, whose steps say what is left.
  uploadSelfie(photo: Blob): Promise<ThriftPlusMember> {
    return api.uploadSelfie(photo)
  },
  signTerms({ termsVersion }: { termsVersion: string }): Promise<ThriftPlusMember> {
    return api.signTerms(termsVersion)
  },
  sendPhoneCode(phone: string) {
    return api.sendPhoneCode(phone)
  },
  savePhone({ phone, code }: { phone: string; code: string }): Promise<ThriftPlusMember> {
    return api.savePhone(phone, code)
  },
  // The trip (S4). The server's answer replaces the trip; nothing changes on screen before it.
  async addToCart(item: ThriftPlusItemCard): Promise<ThriftPlusCart> {
    const cart = await api.addToCart(item)
    setCart(cart)
    return cart
  },
  async setCartQty({ sku, qty }: { sku: string; qty: number }): Promise<ThriftPlusCart> {
    const cart = await api.setCartQty(sku, qty)
    setCart(cart)
    return cart
  },
  async removeFromCart(sku: string): Promise<ThriftPlusCart> {
    const cart = await api.removeFromCart(sku)
    setCart(cart)
    return cart
  },
  async clearCart(): Promise<ThriftPlusCart> {
    const cart = await api.clearCart()
    setCart(cart)
    return cart
  },
  /** Undo: put lines back one at a time, so each answer builds on the last. A line sold since stays out. */
  async restoreLines(back: ThriftPlusCartLine[]): Promise<ThriftPlusCart | null> {
    let latest: ThriftPlusCart | null = null
    for (const line of back) {
      try {
        latest = await api.addToCart(line.item)
        if (line.qty > 1) latest = await api.setCartQty(line.item.sku, line.qty)
      } catch {
        /* sold since: it stays out */
      }
    }
    if (latest) setCart(latest)
    return latest
  },
  passItem(sku: string): Promise<void> {
    return api.passItem(sku)
  },
  sendPriceFeel({ sku, feel }: { sku: string; feel: PriceFeel }): Promise<void> {
    return api.sendPriceFeel(sku, feel)
  },
  // The member's own (S5).
  async setMyNews(on: boolean): Promise<ThriftPlusMe> {
    const me = await api.setMyNews(on)
    void loadMe()
    return me
  },
  async removePerson(personId: number): Promise<ThriftPlusMe | { status: 'signed_out' }> {
    const r = await api.removePerson(personId)
    if ('status' in r && r.status === 'signed_out') {
      publishSession({ status: 'signed_out' })
      newSession({ status: 'signed_out' })
    } else {
      void loadMe()
    }
    return r
  },
  reloadSession,
}

export type Actions = typeof actions

/**
 * An action with its state, like react-query's mutation: `run(arg)` returns the answer (and throws its error); `fire`
 * is the same with errors swallowed (they stay in `error`). A call while one is pending sends nothing and returns the
 * pending one. `reset` clears the error.
 */
export function useAction<A, R>(fn: (arg: A) => Promise<R>): {
  run: (arg: A) => Promise<R>
  fire: (arg: A) => void
  pending: boolean
  error: unknown
  reset: () => void
} {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const out = useRef<Promise<R> | null>(null)
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  const run = useCallback(
    (arg: A): Promise<R> => {
      if (out.current) return out.current
      setPending(true)
      setError(null)
      const p = (async () => {
        try {
          return await fn(arg)
        } catch (err) {
          if (live.current) setError(err)
          throw err
        } finally {
          out.current = null
          if (live.current) setPending(false)
        }
      })()
      out.current = p
      return p
    },
    [fn],
  )
  const fire = useCallback((arg: A) => void run(arg).catch(() => undefined), [run])
  const reset = useCallback(() => setError(null), [])
  return { run, fire, pending, error, reset }
}

/** Tests only: a fresh store (the member module and the API memo are reset by the test harness). */
export function _resetScanStore(): void {
  state = fresh()
  sessionAsked = false
  for (const k of Object.keys(loadSeq) as Array<keyof typeof loadSeq>) loadSeq[k] += 1
  listeners.forEach((fn) => fn())
}
