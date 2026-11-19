/**
 * Piece S1, sign-in (PLAN-SCANNER.md rows 4-7, 10, 11, 13): the live `SignInScreen.tsx` rebuilt on the kit, with the
 * same steps and the same words. Customer sign-in (Join v2, owner 2026-10-19; rulebook J8, J11): no passwords for
 * members. "Continue with Google", or the "Mobile number" box and "Send my code", then the code screen (a text's code, or
 * an email's code or link behind "Joined with an email?"). "Join Thrift+" takes a name the same way. "At the store?"
 * reads the cashier's sign-in QR. "Staff sign in" opens the Dash email-and-password form: staff only (owner 2026-10-16,
 * "the only passwords are for staff"). "Scan without signing in" scans as a non-member.
 *
 * Look: the mockup's `pages/join.html` header band and fields; the live steps and words win over the mockup's ("Send my
 * code", never "Text me a code"). Each step is its own screen (no part opens in place); the space of every message is
 * kept, so nothing moves when one appears (owner 2026-11-19 night).
 *
 * Exports (contracts.ts): default `SignIn` (SignInProps), `AddPhone` (AddPhoneProps).
 */
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { SignInProps, SignInStart } from '../contracts'
import { readContact, viewAfterSignIn, type EmailSignIn } from '../core'
import { actions, useAction, useSignInOptions } from '../store'
import { Button, Field } from '../ui'
import { CheckCode, type SentCode } from './CheckCode'
import { GoogleButton } from './GoogleButton'
import { JoinForm } from './Join'
import { ContactField, Head, IconEye, Msg, SmallLink, TextConsent } from './parts'
import { StoreQrScan } from './StoreQrScan'
import './signin.css'

export { AddPhone } from './AddPhone'

type Mode = SignInStart | 'check' | 'store'

export default function SignIn({ start, notice }: SignInProps) {
  const send = useAction(actions.sendCode)
  const google = useAction(actions.signInWithGoogle)
  const guest = useAction(actions.continueAsGuest)
  const options = useSignInOptions()
  const phoneOn = options?.phone === true
  const googleId = options?.google_client_id ?? null
  const [params, setParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>(start)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [contact, setContact] = useState('')
  // "Joined with an email?": members from before phone-first (owner 2026-10-20) still sign in with their email.
  const [useEmail, setUseEmail] = useState(false)
  const [sent, setSent] = useState<SentCode | null>(null)
  const [err, setErr] = useState(notice)
  // Texts cost money (owner 2026-10-19): one tap sends once. Held while a send is in flight, and the last send's wait
  // is kept, so "Change" and "Send my code" again for the same contact go back to the code instead of sending again.
  const sending = useRef(false)
  const lastSend = useRef<{ key: string; until: number } | null>(null)

  // A used link's words (or an old reset link's) that arrive while this screen is up.
  const shownNotice = useRef(notice)
  useEffect(() => {
    if (notice === shownNotice.current) return
    shownNotice.current = notice
    setErr(notice)
  }, [notice])

  // The shell asks for another start while this screen is up (`?view=join` arrives, or Coming soon's staff form).
  const startRef = useRef(start)
  useEffect(() => {
    if (start === startRef.current) return
    startRef.current = start
    setErr('')
    setMode(start)
  }, [start])

  const go = (next: Mode) => {
    setErr('')
    setMode(next)
  }

  /** "Send my code" from the sign-in or the join screen: a text to a phone number, an email to an email. */
  const sendCode = async (kind: SentCode['kind']) => {
    setErr('')
    const typed = contact.trim()
    const read = readContact(typed)
    if (kind === 'join' && (!first.trim() || !last.trim())) {
      setErr('Enter your first and last name.')
      return
    }
    if (!read || (read.kind === 'phone' && !phoneOn)) {
      setErr(phoneOn ? (useEmail ? 'Enter your email or a US mobile number.' : 'Enter a US mobile number.') : 'Check your email address.')
      return
    }
    // Phone or Google (owner 2026-10-20). An email works only behind "Joined with an email?" on sign-in.
    if (phoneOn && read.kind === 'email' && !(useEmail && kind === 'sign_in')) {
      setErr('Enter your mobile number, or use Continue with Google.')
      return
    }
    const guess: SentCode['channel'] = read.kind === 'phone' ? 'sms' : 'email'
    const key = `${kind}:${read.value}`
    const waitLeft = lastSend.current?.key === key ? Math.ceil((lastSend.current.until - Date.now()) / 1000) : 0
    if (waitLeft > 0) {
      setSent({ kind, contact: typed, channel: sent?.channel ?? guess, first, last, wait: waitLeft })
      setMode('check')
      return
    }
    if (sending.current) return
    sending.current = true
    try {
      const r = await send.run(kind === 'join' ? { contact: typed, first, last } : { contact: typed })
      lastSend.current = { key, until: Date.now() + 30_000 }
      setSent({ kind, contact: typed, channel: r.channel ?? guess, first, last, wait: 30 })
      setMode('check')
    } catch (e) {
      const p = e as { code?: string; retryAfter?: number }
      // One went there moments ago: wait for it (the same answer for any contact).
      if (p.code === 'TOO_SOON') {
        const wait = p.retryAfter ?? 30
        lastSend.current = { key, until: Date.now() + wait * 1000 }
        setSent({ kind, contact: typed, channel: guess, first, last, wait })
        setMode('check')
      } else {
        setErr(e instanceof Error && e.message ? e.message : 'Could not send the code. Try again.')
      }
    } finally {
      sending.current = false
    }
  }

  /** The code screen sent it again: the new wait counts for "Send my code" too. */
  const resent = (seconds: number) => {
    if (lastSend.current) lastSend.current = { ...lastSend.current, until: Date.now() + seconds * 1000 }
  }

  /**
   * Signed in by the code or Google: a pending member with a selfie or a signature to do finishes joining
   * (`view=finish`); any other join opens the Member QR; a sign-in, the scanner (or the Member QR when they came from
   * ecothrift.us/qr, which `view=qr` already asks).
   */
  const signedIn = (r: EmailSignIn) => {
    const view = viewAfterSignIn(r, sent?.kind === 'join')
    if (!view) return
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('view', view)
      return next
    }, { replace: true })
  }

  /** Google's button handed back its ID token. */
  const withGoogle = async (credential: string) => {
    setErr('')
    try {
      signedIn(await google.run(credential))
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Google didn't sign you in. Try again, or use your mobile number.")
    }
  }

  const scanWithoutSigningIn = () => {
    guest.fire(undefined)
    if (params.get('view') === 'join') {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('view')
        return next
      }, { replace: true })
    }
  }

  const busy = send.pending || google.pending
  // The ways in arrive with sign-in-options/: until then their space is kept and nothing is offered, so the phone box,
  // the Google button and the text line never pop in under a thumb.
  const known = options !== null

  return (
    <div className="si" data-testid="sign-in" data-mode={mode}>
      {mode === 'email' ? (
        <form
          className="si-screen"
          data-testid="sign-in-form"
          onSubmit={(e) => {
            e.preventDefault()
            void sendCode('sign_in')
          }}
        >
          <Head title="Sign in" sub="No password needed." />
          <div className="si-body">
            {known ? (
              <>
                {googleId ? <GoogleButton clientId={googleId} joining={false} onCredential={(c) => void withGoogle(c)} /> : null}
                <ContactField value={contact} onChange={setContact} phone={phoneOn} allowEmail={useEmail} />
                <Msg>{err}</Msg>
                <Button type="submit" kind="ink" wide className="si-go" pending={busy}>
                  <span>Send my code</span>
                </Button>
                {phoneOn ? <TextConsent /> : null}
                {phoneOn ? (
                  <SmallLink
                    label={useEmail ? 'Use my mobile number' : 'Joined with an email? Use your email'}
                    onClick={() => {
                      setErr('')
                      setUseEmail((v) => !v)
                    }}
                    className="si-alt"
                  />
                ) : null}
                {/* At the store (owner 2026-10-20): a cashier shows a sign-in QR on the Thrift+ Staff app. */}
                <Button kind="line" wide className="si-store" onClick={() => go('store')}>
                  At the store? Scan the store&apos;s sign-in QR
                </Button>
                {/* Customers have no password (J11): the password form is for staff. */}
                <SmallLink label="Staff sign in" onClick={() => go('staff')} className="si-alt si-quiet" />
              </>
            ) : (
              <div className="si-wait" data-testid="sign-in-waiting">
                <Msg>{err}</Msg>
              </div>
            )}
          </div>
        </form>
      ) : null}

      {/* The cashier's sign-in QR (owner 2026-10-20): the token goes in the address, and the scanner signs in. */}
      {mode === 'store' ? (
        <StoreQrScan
          onClose={() => go('email')}
          onToken={(token) =>
            setParams((prev) => {
              const next = new URLSearchParams(prev)
              next.set('signin', token)
              return next
            }, { replace: true })
          }
        />
      ) : null}

      {mode === 'staff' ? <PasswordForm onBack={() => go('email')} /> : null}

      {mode === 'join' ? (
        <JoinForm
          known={known}
          first={first}
          last={last}
          contact={contact}
          onFirst={setFirst}
          onLast={setLast}
          onContact={setContact}
          phone={phoneOn}
          googleClientId={googleId}
          onGoogle={(c) => void withGoogle(c)}
          busy={busy}
          onSend={() => void sendCode('join')}
          onSignIn={() => go('email')}
          err={err}
        />
      ) : null}

      {mode === 'check' && sent ? (
        <CheckCode
          key={`${sent.kind}:${sent.contact}`}
          sent={sent}
          onChange={() => go(sent.kind === 'join' ? 'join' : 'email')}
          onSignedIn={signedIn}
          onResent={resent}
        />
      ) : null}

      <div className="si-foot">
        {/* In place of "Not a member yet? Join free at the register." (owner 2026-10-15, APP D9). */}
        {mode !== 'join' && mode !== 'check' ? (
          <>
            <Button kind="lime" wide className="si-join" onClick={() => go('join')}>
              Join Thrift+
            </Button>
            <div className="si-free">Free to join. Nothing owed.</div>
          </>
        ) : null}
        {/* "Non-member", never the other word, where a customer reads (APP D10). */}
        <button type="button" className="si-nonmember" onClick={scanWithoutSigningIn}>
          Scan without signing in
        </button>
      </div>
    </div>
  )
}

/** "Staff sign in": the Dash email and password (customers have no password since 2026-10-15). */
function PasswordForm({ onBack }: { onBack: () => void }) {
  const password = useAction(actions.signIn)
  const [login, setLogin] = useState('')
  const [secret, setSecret] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  return (
    <form
      className="si-screen"
      onSubmit={(e) => {
        e.preventDefault()
        setErr('')
        password.run({ login, password: secret }).catch((x: unknown) => setErr(x instanceof Error ? x.message : 'Try again.'))
      }}
    >
      <Head title="Staff sign in" sub="Your Dash email and password." />
      <div className="si-body">
        <Field
          className="si-field si-field-text"
          label="Email or username"
          autoFocus
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="email"
        />
        <div className="sa-field si-field si-field-text si-pw">
          <label htmlFor="si-password">Password</label>
          <div className="si-pw-box">
            <input
              id="si-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
            />
            <button type="button" className="si-eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
              <IconEye off={show} />
            </button>
          </div>
        </div>
        <Msg>{err}</Msg>
        <Button type="submit" kind="ink" wide className="si-go" pending={password.pending}>
          <span>Sign in</span>
        </Button>
        {/* Back to the customer sign-in (owner 2026-10-15, APP D9). */}
        <SmallLink label="Back" onClick={onBack} className="si-alt" />
      </div>
    </form>
  )
}
