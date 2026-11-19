/**
 * The scanner shell's state machine (PLAN-SCANNER.md row 1), pure so it is tested on its own: which screen /scan shows
 * for the address and the session. The same URL contract as the live scanner (`?view= ?tag= ?signin= ?type= ?preview=
 * ?reset=`); since the coordinator's call 1 the scanner has no tabs: Bucks, My QR and Account are on /thriftplus.
 */
import { hasFinishSteps, type ThriftPlusMember, type ThriftPlusSession } from './core'
import type { SignInStart, ThriftPlusShow } from './contracts'

/** `/scan?type=1` tests without a camera for this browser tab; `?type=0` turns the camera back on (the live key). */
export const TYPE_ONLY_KEY = 'tp-type-only'

/** Testing without a camera: /scan?type=1 (this browser tab), ?type=0 turns the camera back on. */
export function typeOnlyMode(): boolean {
  try {
    return sessionStorage.getItem(TYPE_ONLY_KEY) === '1' || new URLSearchParams(window.location.search).get('type') === '1'
  } catch {
    return new URLSearchParams(window.location.search).get('type') === '1'
  }
}

/** Keep `?type=` for this tab (the live page did it on every render with the param). */
export function rememberTypeOnly(typeParam: string | null): void {
  if (typeParam === null) return
  try {
    if (typeParam === '0') sessionStorage.removeItem(TYPE_ONLY_KEY)
    else sessionStorage.setItem(TYPE_ONLY_KEY, '1')
  } catch {
    /* private mode: the flag lasts for this page only */
  }
}

/** The member's views of the old tabs, now sections of /thriftplus (`join` signed in opened the Member QR). */
const SHOW: Record<string, ThriftPlusShow> = { qr: 'qr', card: 'qr', join: 'qr', bucks: 'bucks', account: 'account' }

export function showOfView(view: string | null): ThriftPlusShow | null {
  return view ? SHOW[view] ?? null : null
}

export const THRIFT_PLUS_PATH = '/thriftplus'

export function handoverTo(show: ThriftPlusShow): string {
  return `${THRIFT_PLUS_PATH}?show=${show}`
}

/** An old password reset link (owner 2026-10-16: no customer passwords): the sign-in screen says how to sign in now. */
export const RESET_NOTICE = "No passwords anymore. We'll send you a code instead."

export type Screen =
  | { kind: 'soon' }
  | { kind: 'signin'; start: SignInStart; notice: string }
  | { kind: 'spinner' }
  | { kind: 'handover'; to: string }
  | { kind: 'phone'; member: ThriftPlusMember }
  | { kind: 'finish'; member: ThriftPlusMember }
  | { kind: 'trip'; session: Exclude<ThriftPlusSession, { status: 'signed_out' }> }

export type ScreenInput = {
  /** From `session/`: false while Thrift+ is off for this phone; null not known yet. */
  open: boolean | null
  /** "Staff sign in" was tapped on Coming soon. */
  staff: boolean
  /** `?reset=` is on the address. */
  reset: boolean
  /** `?signin=<token>` is on the address (signing in now). */
  signingIn: boolean
  session: ThriftPlusSession | null
  view: string | null
  /** This visit opened a tag's QR while signed out: it scans as a non-member, for this visit only. */
  linkGuest: boolean
  /** A used or expired link's words. */
  linkError: string
}

/**
 * The live page's order (ThriftPlusScannerPage.tsx, TripScanner.tsx): Coming soon (or the staff form) while Thrift+ is
 * off; an old reset link; the spinner while a link signs in or the session is unknown; sign in or Join; then for a
 * member: Add your mobile number (required), Finish joining (required while steps are left, or `?view=finish`), the
 * Thrift+ page for the old tabs, else the trip.
 */
export function screenOf(i: ScreenInput): Screen {
  if (i.open === false) return i.staff ? { kind: 'signin', start: 'staff', notice: '' } : { kind: 'soon' }
  if (i.reset) return { kind: 'signin', start: 'email', notice: RESET_NOTICE }
  if (i.signingIn || !i.session) return { kind: 'spinner' }
  const s = i.session
  const joinAsked = i.view === 'join'
  if (s.status === 'signed_out' && !(i.linkGuest && !joinAsked)) {
    return { kind: 'signin', start: joinAsked ? 'join' : 'email', notice: i.linkError }
  }
  if (s.status === 'guest' && joinAsked) return { kind: 'signin', start: 'join', notice: i.linkError }
  if (s.status === 'member') {
    const m = s.member
    if (m.needs_phone) return { kind: 'phone', member: m }
    if (i.view === 'finish' || hasFinishSteps(m)) return { kind: 'finish', member: m }
    const show = showOfView(i.view)
    if (show) return { kind: 'handover', to: handoverTo(show) }
    return { kind: 'trip', session: s }
  }
  return { kind: 'trip', session: { status: 'guest' } }
}
