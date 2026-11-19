/**
 * Tiny on purpose (the shell imports it into the entry chunk): is the new scanner on for this visit, and leaving
 * "Scan without signing in" before opening sign-in.
 *
 * The middleware (apps/core/middleware.py) stamps `"scan": true` into the home feed it puts in the page when /scan would
 * give this visitor the phone scanner (the second switch `storefront.phone_scan`, or the `eco_site=phone` cookie). Then
 * the shell links to /scan as a route; otherwise (or when the page came without a stamp) as a full page load, and the
 * server decides which scanner answers.
 */
import { bootNow } from '../lib/boot'
import { publishSession } from '../lib/member'

/** True when /scan is the phone scanner for this visit (a route of the phone site). */
export function scanIsRoute(): boolean {
  return (bootNow() as { scan?: unknown } | null)?.scan === true
}

/** The live scanner's keys for a phone scanning without signing in (scan/api.ts `LS`). */
const GUEST_KEYS = ['thriftPlus.real.guest', 'thriftPlus.real.guestCart', 'thriftPlus.real.guestHistory']

/**
 * The top bar's "Sign in" on a phone scanning without signing in: leave that first (as the live scanner's pill did:
 * its sign-out cleared the same three keys), or /scan would open the camera instead of sign-in.
 */
export function leaveGuest(): void {
  try {
    if (!localStorage.getItem(GUEST_KEYS[0])) return
    GUEST_KEYS.forEach((k) => localStorage.removeItem(k))
  } catch {
    return
  }
  publishSession({ status: 'signed_out' })
}
