/**
 * The contracts between the scanner's pieces (PLAN-SCANNER.md section 6). S0 (this file, ScanApp.tsx, store.ts, api.ts,
 * core/, ui.tsx) is the shell; each later piece REPLACES ONLY its own stub `index.tsx` (and adds files beside it) and
 * keeps these exports and props exactly:
 *
 * | Piece | Folder | Exports from its index.tsx |
 * |---|---|---|
 * | S1 sign-in | `signin/` | default `SignIn` (SignInProps), `AddPhone` (AddPhoneProps) |
 * | S2 finish joining | `finish/` | default `FinishJoining` (FinishProps), `TERMS_VERSION` |
 * | S3 camera | `camera/` | default `Camera` (CameraProps), `CameraHelp`, `TurnUpright`, `SidewaysScanPill`, `SidewaysGotIt` |
 * | S4 trip | `trip/` | default `Trip` (TripProps), `TripList` (TripListProps, for pages/ThriftPlus.tsx) |
 * | S5 member | `member/` | `HomeScreenCard`, `Wallet`, `Balance`, `Account` (for pages/ThriftPlus.tsx) |
 *
 * Data: every piece reads and writes through `../store` (hooks and `actions`, with `useAction` for pending/error) and
 * never calls `fetch` or `../api` for state the store keeps. Pure helpers come from `../core` (the live scanner's own
 * logic, unchanged). Shared look: `../ui` and `../scan.css` (prefix `sa-`); each piece has its own CSS file and prefix
 * (S1 `si-`, S2 `fj-`, S3 `cm-`, S4 `tr-`, S5 `mb-`), imported by its own index.tsx only.
 *
 * Words: every pinned line of PLAN-SCANNER.md section 2 stays word for word, including the ones that break a newer rule
 * (coordinator's call 4). Motion: a fade of 120 ms or less; swipe to add or pass and slide to remove stay (call 3).
 * ThriftBucks only: no dollar "pay today" figure, no dollar trip total the server does not send (call 2).
 */
import type { ReactNode } from 'react'
import type { ThriftPlusCartLine, ThriftPlusMember, ThriftPlusSession, useQrCamera } from './core'

/** "Lock upright" where the browser can lock the screen (Android); null where it cannot (iPhones). core `useUprightLock()`. */
export type UprightLock = { locked: boolean; toggle: () => void }

/** What `useQrCamera()` (core, unchanged) returns: the trip owns the hook, the camera piece draws it. */
export type QrCamera = ReturnType<typeof useQrCamera>

// ── S1 sign-in (rows 4-7, 10, 11, 13) ───────────────────────────────────────

/**
 * Where the sign-in screen opens: `email` (signed out: the phone box first, "Joined with an email? Use your email"),
 * `join` (`?view=join`), `staff` ("Staff sign in": the Dash email and password form, also straight from Coming soon).
 */
export type SignInStart = 'email' | 'join' | 'staff'

export type SignInProps = {
  start: SignInStart
  /**
   * A line in an alert at the top (role="alert"): a used or expired link's words ("That link has already been used.
   * Send a new one."), or for an old reset link "No passwords anymore. We'll send you a code instead.". '' = none.
   */
  notice: string
}
// SignIn owns, inside its own screens: Join (C2), the code entry (C4), "Scan without signing in" (actions.continueAsGuest,
// and it takes `view=join` off the address, replace, as the live screen does), the store's sign-in QR (C5: put the token
// in `?signin=` with setSearchParams, ScanApp signs in), Google, and the code screen's "signed in in another tab" check
// (store `reloadSession()`: the answer lands in the store by itself). After a code or Google sign-in it sets `?view=`
// from core `viewAfterSignIn(answer, joined)` (replace): ScanApp then shows the right screen from the session (finish,
// the Thrift+ page's QR, or the trip). It never navigates anywhere else.

/** "Add your mobile number" (C6a): required, no skip; the save replaces the session and ScanApp moves on. */
export type AddPhoneProps = { firstName: string; onSignOut: () => void }

// ── S2 finish joining (row 14) ──────────────────────────────────────────────

/**
 * Finish joining: the selfie (actions.uploadSelfie with core `selfieJpeg`), then "I agree" (actions.signTerms with
 * TERMS_VERSION, which must equal frontend/src/pages/thriftplus/scanner/FinishJoining.tsx's). Each answer replaces the
 * session. `onDone` ("You're a Thrift+ member" then on): ScanApp opens /thriftplus with the QR showing.
 */
export type FinishProps = { member: ThriftPlusMember; onDone: () => void; onSignOut: () => void }

// ── S3 camera (rows 15, 16, 26, 27) ─────────────────────────────────────────

export type CameraProps = {
  /** The live camera (S4 calls core `useQrCamera` and passes it here). */
  camera: QrCamera
  /** A short flash on the viewfinder when a code is read. */
  flash: boolean
  /** A typed tag number ("Tag number" field) or a test tag picked in type-only mode. */
  onCode: (code: string) => void
  /** "Camera not working?": S4 opens `CameraHelp`. */
  onHelp: () => void
  /** `?type=1` (route.ts `typeOnlyMode()`): no camera, the tag box and the test tags (store `useTestTags`). */
  typeOnly: boolean
  lock: UprightLock | null
  /** A sideways phone: the camera fills the screen. */
  fullBleed: boolean
  /** An answer or a tag sits on top (the camera keeps running underneath, paused). */
  underneath: boolean
}
export type CameraHelpProps = { onClose: () => void; onRetry: () => void }
export type TurnUprightProps = { lock: UprightLock | null }

// ── S4 trip (rows 12, 17-20) ────────────────────────────────────────────────

export type TripProps = {
  /** A member, or a non-member scanning (also a signed-out phone that opened a tag's QR: not kept). */
  session: Exclude<ThriftPlusSession, { status: 'signed_out' }>
  /** "Get Thrift+" under a tag opened from its QR: ScanApp shows Join (`?view=join`). */
  onJoin: () => void
}
// Trip owns the state machine of the live TripScanner (scan, card, trip, item), the camera hook, the answers, Pass and
// Add, the trip's lines with Undo, the sheets (about, info, price feel), the keyboard, and `?tag=<SKU>` (opened once,
// then taken off the address with replace). A `?tag=` that arrives while Trip is mounted (the top bar's search on
// /scan) must open too. It shows HomeScreenCard (S5) as the banner for members.

/** The trip's lines and totals band, also shown on /thriftplus (pages/ThriftPlus.tsx). Reads the store's cart. */
export type TripListProps = { onOpen?: (line: ThriftPlusCartLine) => void; children?: ReactNode }

// ── S5 member (rows 21-25; coordinator's call 1: no tabs on /scan, these are sections of /thriftplus) ─────────

/** /scan?view=qr|card|join (signed in) -> /thriftplus?show=qr; view=bucks -> show=bucks; view=account -> show=account. */
export type ThriftPlusShow = 'qr' | 'bucks' | 'account'

export type HomeScreenCardProps = { variant: 'banner' | 'account' }
export type WalletProps = { member: ThriftPlusMember }
export type BalanceProps = { member: ThriftPlusMember; tripTotal: number }
export type AccountProps = { member: ThriftPlusMember; onSignOut: () => void }
