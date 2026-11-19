/**
 * Who is here: a Thrift+ member or not. ONE member for the whole phone site (PLAN-SCANNER.md section 4): this file holds
 * the one answer of `GET /api/thriftplus/public/session/` (the member cookie `tp_session`, same origin) and the top bar,
 * the home band and the scanner's store (`scan/store.ts`, loaded lazily with the scanner) all read it. A sign-in or a
 * sign-out in the scanner publishes the new session here (`publishSession`), so the top bar changes at once.
 *
 * Tiny on purpose (it is in the entry chunk): the request, the answer, a 5-minute copy in sessionStorage so the next page
 * knows at once. The first `useMember()` asks after the first paint. It also puts `data-member="yes|no|unknown"` on
 * <html>, so kit.css's `.if-in` / `.if-out` can swap without a re-render.
 */
import { useEffect, useSyncExternalStore } from 'react'

export const SESSION_URL = '/api/thriftplus/public/session/'
const KEY = 'eco.phone.member.v1'
const KEEP_MS = 5 * 60_000
/** The staff preview code (`/scan?preview=<code>`), sent with every Thrift+ call (scan/api.ts keeps it). */
export const PREVIEW_KEY = 'thriftPlus.preview'

export type Member = {
  first: string
  /** ThriftBucks they can use now. */
  bucks: number
  /** ISO date their ThriftBucks are good until at full value, or ''. */
  useBy: string
  /** False while a join made online is not finished at a register yet. */
  ready: boolean
}
export type MemberState = { status: 'unknown' | 'out' | 'member'; member: Member | null }

/**
 * The server's answer to `session/` as it came: `status` is the HTTP status (0: no answer, offline), `body` the JSON
 * (null when there was none). The scanner's store reads the whole of it (the member's steps, test mode, Thrift+ off).
 */
export type SessionAnswer = { status: number; body: unknown; published?: true }

type Saved = { at: number; state: MemberState }

const UNKNOWN: MemberState = { status: 'unknown', member: null }
let state: MemberState = readSaved() || UNKNOWN
let asked = false
/** The latest answer in this page load (null until one arrives or is published). */
let answer: SessionAnswer | null = null
/** Every request and every publish takes a number; an answer that is not the newest is dropped (a late answer can never
 *  undo a sign-in). */
let seq = 0
let inflight: { seq: number; promise: Promise<SessionAnswer | null> } | null = null
const listeners = new Set<() => void>()
const answerListeners = new Set<(a: SessionAnswer) => void>()

function readSaved(): MemberState | null {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY) : null
    if (!raw) return null
    const saved = JSON.parse(raw) as Saved
    if (!saved || Date.now() - saved.at > KEEP_MS || !saved.state) return null
    return saved.state
  } catch {
    return null
  }
}

function save(next: MemberState) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), state: next } satisfies Saved))
  } catch {
    /* private mode: ask again next page */
  }
}

function paintHtml() {
  if (typeof document === 'undefined') return
  const v = state.status === 'member' ? 'yes' : state.status === 'out' ? 'no' : 'unknown'
  document.documentElement.setAttribute('data-member', v)
}

function set(next: MemberState) {
  state = next
  paintHtml()
  listeners.forEach((fn) => fn())
}

/** The session payload as this page needs it (the endpoint sends more; only these few are kept). */
export function parseSession(body: unknown): MemberState {
  const b = body as { status?: string; member?: Record<string, unknown> } | null
  if (!b || b.status !== 'member' || !b.member) return { status: 'out', member: null }
  const m = b.member
  const bucks = Number(m.bucks_available ?? 0)
  return {
    status: 'member',
    member: {
      first: String(m.first_name || '').trim(),
      bucks: Number.isFinite(bucks) ? bucks : 0,
      useBy: typeof m.bucks_use_by === 'string' ? m.bucks_use_by : '',
      ready: m.ready !== false,
    },
  }
}

function apply(a: SessionAnswer) {
  answer = a
  if (a.status === 0) {
    // No answer (offline): keep what we knew; a phone that knew nothing counts as signed out.
    if (state.status === 'unknown') set({ status: 'out', member: null })
  } else {
    const next = a.status === 200 ? parseSession(a.body) : { status: 'out' as const, member: null }
    save(next)
    set(next)
  }
  answerListeners.forEach((fn) => fn(a))
}

function previewHeader(): Record<string, string> {
  try {
    const code = localStorage.getItem(PREVIEW_KEY)
    return code ? { 'X-ThriftPlus-Preview': code } : {}
  } catch {
    return {}
  }
}

/**
 * Ask the server now (one request; a call while the newest request is still out shares it). Resolves to the newest
 * answer, or null when this request was overtaken by a newer one before it came back.
 */
export function fetchSession(): Promise<SessionAnswer | null> {
  asked = true
  if (inflight && inflight.seq === seq) return inflight.promise
  const mine = ++seq
  const promise = (async (): Promise<SessionAnswer | null> => {
    let got: SessionAnswer
    try {
      const r = await fetch(SESSION_URL, { credentials: 'include', headers: { Accept: 'application/json', ...previewHeader() } })
      let body: unknown = null
      try {
        body = await r.json()
      } catch {
        body = null
      }
      got = { status: r.status, body }
    } catch {
      got = { status: 0, body: null }
    }
    if (inflight?.seq === mine) inflight = null
    if (mine !== seq) return null
    apply(got)
    return got
  })()
  inflight = { seq: mine, promise }
  return promise
}

/**
 * A new session from a sign-in, a sign-out or a finished step (scan/store.ts): becomes the answer at once, overtakes any
 * request still out, and updates the top bar. `body` is the session payload (`{status: 'member', member}` or
 * `{status: 'signed_out'}`).
 */
export function publishSession(body: unknown): void {
  asked = true
  seq += 1
  inflight = null
  apply({ status: 200, body, published: true })
}

/** The latest answer of this page load, or null when none came yet (a saved copy is not an answer). */
export function lastSessionAnswer(): SessionAnswer | null {
  return answer
}

/** Hear every new answer (fetched or published). Returns the unsubscribe. */
export function onSessionAnswer(fn: (a: SessionAnswer) => void): () => void {
  answerListeners.add(fn)
  return () => {
    answerListeners.delete(fn)
  }
}

/** Ask the server (once per page load unless `again`). */
export async function askSession(again = false): Promise<MemberState> {
  if (asked && !again) return state
  await fetchSession()
  return state
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function current() {
  return state
}

/** `{status, member}`. The first use asks `session/` after the first paint (a saved answer shows at once meanwhile). */
export function useMember(): MemberState {
  const value = useSyncExternalStore(subscribe, current, current)
  useEffect(() => {
    if (asked) return
    const saved = readSaved()
    if (saved) {
      asked = true
      if (saved !== state) set(saved)
      return
    }
    const t = window.setTimeout(() => {
      if (!asked) void fetchSession()
    }, 0)
    return () => window.clearTimeout(t)
  }, [])
  return value
}

paintHtml()

/** Tests only. */
export function _resetMember(next: MemberState = UNKNOWN) {
  asked = false
  answer = null
  inflight = null
  seq += 1
  set(next)
}
