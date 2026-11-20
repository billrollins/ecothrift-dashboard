/**
 * The Thrift+ scanner in the phone site (`/scan`; PLAN-SCANNER.md, piece S0). The route shell and its state machine
 * (route.ts `screenOf`), with the same URL contract as the live scanner (frontend/src/pages/thriftplus/scanner/
 * ThriftPlusScannerPage.tsx):
 *
 * - `?preview=<code>`: a staff phone before launch; kept on the phone (every call sends it), then off the address.
 * - `?type=1` / `?type=0`: test without a camera for this tab (sessionStorage `tp-type-only`).
 * - `?reset=`: an old password reset link; the sign-in screen says how to sign in now.
 * - `?signin=<token>`: a texted or emailed link signs this phone in, once; the token comes off the address and the view
 *   is set from `viewAfterSignIn` (finish, qr, or the scanner). A used or expired link shows its words on sign-in.
 * - `?view=join`: Join when signed out or scanning without signing in; signed in, the Member QR.
 * - `?view=qr|card|bucks|account` (signed in): the scanner has no tabs of its own since the coordinator's call 1, so
 *   these hand over to /thriftplus (`?show=qr|bucks|account`), which piece S5 builds. `/qr`, `/card`, `/join` still
 *   302 to /scan on the server.
 * - `?view=finish`: Finish joining (also forced while a pending member has steps left; after Add your mobile number).
 * - `?tag=<SKU>`: a price tag's QR; a signed-out phone sees the item as a non-member for this visit (piece S4 opens it).
 * - Thrift+ off for this phone (`session/` 403 THRIFT_PLUS_OFF): Coming soon, with "Staff sign in".
 *
 * Each screen is a later piece (contracts.ts). The whole scanner is one lazy chunk, loaded only on /scan.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { setPreviewCode } from './api'
import { TurnUpright } from './camera'
import { useSideways, useStandaloneLock, useUprightLock, viewAfterSignIn, type EmailSignIn } from './core'
import FinishJoining from './finish'
import { rememberTypeOnly, screenOf } from './route'
import SignIn, { AddPhone } from './signin'
import { actions, useAction, useScanSession } from './store'
import Trip from './trip'
import { Button, SpinnerScreen, VersionTag } from './ui'

export default function ScanApp() {
  const [params, setParams] = useSearchParams()
  // A phone held sideways: the trip keeps scanning (its own screens); every other screen asks to turn upright.
  const sideways = useSideways()
  const lock = useUprightLock()
  useStandaloneLock()

  // A staff phone before launch (owner 2026-10-07): kept on the phone, then off the address.
  const preview = params.get('preview')
  if (preview) setPreviewCode(preview)
  useEffect(() => {
    if (!preview) return
    // The top bar may have asked session/ before the code was kept: ask again with it (open to this phone now).
    void actions.reloadSession()
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('preview')
      return next
    }, { replace: true })
  }, [preview]) // eslint-disable-line react-hooks/exhaustive-deps

  rememberTypeOnly(params.get('type'))

  // The texted or emailed link: signs this phone in, once.
  const signinToken = params.get('signin')
  const [linkError, setLinkError] = useState('')
  const linkTried = useRef<string | null>(null)
  const link = useAction(actions.signInWithLink)
  useEffect(() => {
    if (!signinToken || linkTried.current === signinToken) return
    linkTried.current = signinToken
    void (async () => {
      let signed: EmailSignIn | null = null
      try {
        signed = await link.run(signinToken)
        setLinkError('')
      } catch (e) {
        setLinkError(e instanceof Error && e.message ? e.message : "That link didn't work. Send a new one.")
      }
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('signin')
        const view = signed ? viewAfterSignIn(signed) : null
        if (view) next.set('view', view)
        return next
      }, { replace: true })
    })()
  }, [signinToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Held while a link signs in, so an answer from before it can't sign the phone back out.
  const { session, open } = useScanSession(!signinToken)
  const view = params.get('view')

  // A tag's QR on a signed-out phone: the item as a non-member, this visit only (the next visit is signed out again).
  const linkGuest = useRef(false)
  if (params.get('tag') && session?.status === 'signed_out') linkGuest.current = true

  const [staff, setStaff] = useState(false)
  const screen = screenOf({
    open,
    staff,
    reset: params.get('reset') !== null,
    signingIn: !!signinToken,
    session,
    view,
    linkGuest: linkGuest.current,
    linkError,
  })

  useEffect(() => {
    const prev = document.title
    document.title = 'Thrift+ price scanner'
    // The decoder is NOT warmed here: it loads when the scanning view opens (trip/index.tsx), so a phone that only signs
    // in never fetches the 1 MB WebAssembly file.
    return () => {
      document.title = prev
    }
  }, [])

  // The scanner has the whole screen on every view (owner's walk, Dash Update #185): the site's logo row and search row
  // step aside while /scan is open (scan.css, `html[data-scan]`); the bottom bar stays, it is the way home. The value is
  // the screen's kind. A layout effect, so the rows are gone before the first paint of a screen.
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-scan', screen.kind)
  }, [screen.kind])
  useLayoutEffect(() => () => document.documentElement.removeAttribute('data-scan'), [])

  // Finish joining is required (owner 2026-10-20): its address says so, replaced so Back never walks it.
  useEffect(() => {
    if (screen.kind === 'finish' && view !== 'finish') setParams({ view: 'finish' }, { replace: true })
  }, [screen.kind, view, setParams])

  const signOut = useAction(actions.signOut)
  // Sign out (Finish joining, Add your mobile number): the address goes back to a bare /scan with the sign-in screen,
  // never /scan?view=finish over sign-in (Dash Update #185). Cleared once the sign-out has landed, so the screen that
  // was up cannot put its own view back first.
  const leave = () => {
    void signOut.run(undefined).then(
      () => setParams(new URLSearchParams(), { replace: true }),
      () => undefined,
    )
  }

  let body
  switch (screen.kind) {
    case 'soon':
      body = <ComingSoon onStaff={() => setStaff(true)} />
      break
    case 'signin':
      body = <SignIn start={screen.start} notice={screen.notice} />
      break
    case 'spinner':
      body = <SpinnerScreen />
      break
    case 'handover':
      body = <Navigate to={screen.to} replace />
      break
    case 'phone':
      body = <AddPhone firstName={screen.member.first_name} onSignOut={leave} />
      break
    case 'finish':
      body = (
        <FinishJoining
          member={screen.member}
          onDone={() => setParams({ view: 'qr' }, { replace: true })}
          onSignOut={leave}
        />
      )
      break
    case 'trip':
      body = <Trip session={screen.session} onJoin={() => setParams({ view: 'join' })} />
      break
  }

  const member = session?.status === 'member' ? session.member : null
  return (
    <section className="sa" data-testid="scan-app" data-screen={screen.kind}>
      {screen.kind === 'trip' && member?.test_mode ? (
        <div className="sa-test" role="status" data-testid="test-mode-bar">
          Test mode: Thrift+ isn&apos;t open to customers yet
        </div>
      ) : null}
      {body}
      <VersionTag />
      {sideways && screen.kind !== 'trip' ? <TurnUpright lock={lock} /> : null}
    </section>
  )
}

/** Thrift+ is off: what a customer sees at /scan until launch. Staff can sign in to test it (2026-10-10). */
function ComingSoon({ onStaff }: { onStaff: () => void }) {
  return (
    <div className="sa-soon" data-testid="coming-soon">
      <div className="disp">Thrift+</div>
      <h1>Coming soon</h1>
      <p>Ask at the register.</p>
      <Button kind="link" onClick={onStaff}>
        Staff sign in
      </Button>
    </div>
  )
}
