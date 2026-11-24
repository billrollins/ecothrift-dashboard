/**
 * Black Friday (#220, owner 2026-11-24: "Guests can go to website and start scanning with VERY little interference"):
 * a signed-out phone opens straight to scanning as a non-member; Join still opens the join when asked for.
 */
import { describe, expect, it } from 'vitest'
import { screenOf, type ScreenInput } from './route'

const base: ScreenInput = {
  open: true, staff: false, reset: false, signingIn: false, session: null, view: null, linkGuest: false, linkError: '',
}

describe('the scanner on Black Friday', () => {
  it('scans at once for a signed-out phone', () => {
    expect(screenOf({ ...base, session: { status: 'signed_out', black_friday: true } })).toEqual({
      kind: 'trip', session: { status: 'guest', black_friday: true },
    })
  })

  it('still opens the join when asked, and asks to sign in on any other day', () => {
    expect(screenOf({ ...base, view: 'join', session: { status: 'signed_out', black_friday: true } }).kind).toBe('signin')
    expect(screenOf({ ...base, session: { status: 'signed_out' } }).kind).toBe('signin')
  })
})
