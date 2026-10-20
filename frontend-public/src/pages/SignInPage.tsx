import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { checkCode, getSignInOptions, sendCode, signInWithGoogle, type SignInOptions } from '../lib/memberSignIn'
import { useOnlineSalesConfig } from '../onlineSalesConfig'
import { useSeo } from '../useSeo'

// 'start' = the same two ways as the Thrift+ app (owner 2026-10-20): Continue with Google, or a mobile number and a text.
// 'email' is the old way, kept behind "Joined with an email? Use your email" until those members have moved over.
type Step = 'start' | 'code' | 'email' | 'password' | 'link_sent' | 'register' | 'register_sent' | 'reset_sent'

const RESEND_SECONDS = 30
const NO_PHONE_WORDS =
  "You're signed in to Thrift+, but not to this site. Use your email below."

/** The text-message line under "Send my code": the same words the Thrift+ app shows (Twilio's toll-free review, J18). */
function TextConsent() {
  return (
    <p data-testid="text-consent" style={{ marginTop: 14, fontSize: 13, lineHeight: 1.45, color: '#5d605a' }}>
      A phone number gets one text with your code each time you ask. Msg &amp; data rates may apply. Reply STOP to
      cancel, HELP for help. <Link to="/terms">Terms</Link> Â· <Link to="/privacy">Privacy</Link>
    </p>
  )
}

export default function SignInPage() {
  useSeo({ title: 'Sign in', noindex: true })
  const { config, loading: configLoading } = useOnlineSalesConfig()
  const {
    requestMagicLink,
    consumeToken,
    signInWithPassword,
    lookupEmail,
    requestReset,
    completeSignIn,
    user,
  } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('start')
  const [options, setOptions] = useState<SignInOptions | null>(null)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [resendLeft, setResendLeft] = useState(0)
  const sending = useRef(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // A staff login (owner 2026-10-15): staff are website customers too and sign in with their Dash password. Customers
  // have no password (owner 2026-10-16): an emailed link only, the same account as the Thrift+ app.
  const [passwordOnly, setPasswordOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const tokenFromUrl = params.get('token')

  useEffect(() => {
    if (user && !tokenFromUrl) navigate('/account', { replace: true })
  }, [user, navigate, tokenFromUrl])

  useEffect(() => {
    if (tokenFromUrl) return
    let active = true
    getSignInOptions().then((o) => active && setOptions(o))
    return () => {
      active = false
    }
  }, [tokenFromUrl])

  // "Send it again" opens 30 seconds after a text went out (texts cost money: one tap sends once).
  useEffect(() => {
    if (resendLeft <= 0) return
    const t = window.setTimeout(() => setResendLeft((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [resendLeft])

  useEffect(() => {
    if (!tokenFromUrl) return
    let active = true
    setBusy(true)
    setError(null)
    consumeToken(tokenFromUrl)
      .then((result) => {
        if (!active) return
        navigate(result.redirect_to || '/account', { replace: true })
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Sign-in failed')
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [tokenFromUrl, consumeToken, navigate])

  if (configLoading) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <span className="skline" style={{ width: 180 }} />
        </div>
      </div>
    )
  }
  if (!config.accounts_enabled) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <h1>Accounts unavailable</h1>
        </div>
        <p className="lead">Customer accounts are not available right now.</p>
        <Link className="btn btn--primary" to="/shop">
          Back to shop
        </Link>
      </div>
    )
  }

  if (tokenFromUrl && error) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <div className="eyebrow">Account</div>
          <h1>Sign in</h1>
        </div>
        <p className="lead" style={{ color: '#c0392b' }}>
          {error}
        </p>
        <Link className="btn btn--primary" to="/account/sign-in">
          Try again
        </Link>
      </div>
    )
  }

  if (tokenFromUrl && busy) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <span className="skline" style={{ width: 180 }} />
        </div>
        <p className="lead">Signing you in…</p>
      </div>
    )
  }

  const phoneOn = options?.phone === true
  const googleId = options?.google_client_id ?? null
  // Neither Google nor texts (a server without them): the email form, as before.
  const view: Step = step === 'start' && options && !phoneOn && !googleId ? 'email' : step

  /** A good code or Google answer signed in to Thrift+ and, by the server's cookie, to this site: load the customer. */
  const finishSignIn = async () => {
    const signedIn = await completeSignIn()
    if (signedIn) navigate('/account', { replace: true })
    else {
      setError(NO_PHONE_WORDS)
      setStep('email')
    }
  }

  const onSendCode = async (e: FormEvent) => {
    e.preventDefault()
    if (sending.current) return
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Enter a US mobile number.')
      return
    }
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      await sendCode(phone)
      setCode('')
      setResendLeft(RESEND_SECONDS)
      setStep('code')
    } catch (err) {
      const wait = (err as { code?: string; retryAfter?: number })
      // One went there moments ago: go and enter it.
      if (wait.code === 'TOO_SOON') {
        setCode('')
        setResendLeft(wait.retryAfter ?? RESEND_SECONDS)
        setStep('code')
      } else setError(err instanceof Error ? err.message : 'Could not send the code. Try again.')
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const submitCode = async (value: string) => {
    if (value.length !== 6 || busy) return
    setBusy(true)
    setError(null)
    try {
      await checkCode(phone, value)
      await finishSignIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work. Check it and try again.")
    } finally {
      setBusy(false)
    }
  }

  const onResend = async () => {
    if (sending.current) return
    sending.current = true
    setError(null)
    try {
      await sendCode(phone)
      setResendLeft(RESEND_SECONDS)
    } catch (err) {
      const wait = err as { code?: string; retryAfter?: number }
      if (wait.code === 'TOO_SOON') setResendLeft(wait.retryAfter ?? RESEND_SECONDS)
      else setError(err instanceof Error ? err.message : 'Could not send the code. Try again.')
    } finally {
      sending.current = false
    }
  }

  const onGoogle = async (credential: string) => {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle(credential)
      await finishSignIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google didn't sign you in. Try again, or use your mobile number.")
    } finally {
      setBusy(false)
    }
  }

  const onEmailContinue = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const lookup = await lookupEmail(email.trim())
      setPasswordOnly(lookup.password_only)
      if (!lookup.has_account) {
        setStep('register')
        return
      }
      if (lookup.password_only) {
        setStep('password')
        return
      }
      await requestMagicLink(email.trim())
      setStep('link_sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not continue')
    } finally {
      setBusy(false)
    }
  }

  const onPasswordSignIn = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signInWithPassword(email.trim(), password)
      navigate('/account', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  const onForgot = async () => {
    setBusy(true)
    setError(null)
    try {
      await requestReset(email.trim())
      setStep('reset_sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request reset')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wrap">
      <div className="pagehead">
        <div className="eyebrow">Account</div>
        <h1>
          {step === 'register' ? 'Join Thrift+' : step === 'register_sent' ? 'Create your account' : 'Sign in'}
        </h1>
      </div>

      {view === 'start' && !options && (
        <p className="lead" style={{ opacity: 0.6 }}>
          One momentâ€¦
        </p>
      )}

      {view === 'start' && options && (
        <div className="checkout-form" style={{ maxWidth: 420 }}>
          <p className="lead">Sign in to your Thrift+ account.</p>
          {googleId && (
            <>
              <GoogleSignInButton clientId={googleId} onCredential={(c) => void onGoogle(c)} />
              {phoneOn && (
                <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '18px 0', color: '#8a8d85' }}>
                  <span style={{ flex: 1, height: 1, background: '#d6d9d0' }} />
                  or
                  <span style={{ flex: 1, height: 1, background: '#d6d9d0' }} />
                </div>
              )}
            </>
          )}
          {phoneOn && (
            <form onSubmit={onSendCode}>
              <label className="field">
                <span>Mobile number</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={busy}
                  autoComplete="tel"
                  inputMode="tel"
                />
              </label>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#5d605a' }}>We&apos;ll text you a 6-digit code.</p>
              {error && <div className="formerror">{error}</div>}
              <button className="btn btn--primary" type="submit" disabled={busy}>
                {busy ? 'Workingâ€¦' : 'Send my code'}
              </button>
              <TextConsent />
            </form>
          )}
          {!phoneOn && error && <div className="formerror">{error}</div>}
          <div className="hbtns" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setError(null)
                setStep('email')
              }}
            >
              Joined with an email? Use your email
            </button>
          </div>
          <p style={{ marginTop: 14, fontSize: 14 }}>
            New to Thrift+? <a href="/join">Join Thrift+</a>
          </p>
        </div>
      )}

      {view === 'code' && (
        <form
          className="checkout-form"
          style={{ maxWidth: 420 }}
          onSubmit={(e) => {
            e.preventDefault()
            void submitCode(code)
          }}
        >
          <p className="lead" data-testid="sent-line">
            Enter the 6-digit code we sent to <strong>{phone.trim()}</strong>.{' '}
            <button
              type="button"
              className="btn btn--ghost"
              style={{ padding: 0, minHeight: 0, textDecoration: 'underline' }}
              onClick={() => {
                setError(null)
                setStep('start')
              }}
            >
              Change
            </button>
          </p>
          <label className="field">
            <span>6-digit code</span>
            <input
              autoFocus
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                const sixth = v.length === 6 && code.length < 6
                setCode(v)
                if (error) setError(null)
                if (sixth) void submitCode(v)
              }}
              disabled={busy}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>
          {error && <div className="formerror">{error}</div>}
          <button className="btn btn--primary" type="submit" disabled={busy || code.length !== 6}>
            {busy ? 'Workingâ€¦' : 'Sign in'}
          </button>
          <p data-testid="resend" style={{ marginTop: 14, fontSize: 14, color: '#5d605a' }}>
            {resendLeft > 0 ? (
              `Didn't get it? Send it again in ${Math.floor(resendLeft / 60)}:${String(resendLeft % 60).padStart(2, '0')}`
            ) : (
              <button type="button" className="btn btn--ghost" onClick={() => void onResend()}>
                Send it again
              </button>
            )}
          </p>
        </form>
      )}

      {view === 'email' && (
        <>
          <p className="lead">Enter your email to continue.</p>
          <form className="checkout-form" onSubmit={onEmailContinue} style={{ maxWidth: 420 }}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                autoComplete="email"
              />
            </label>
            {error && <div className="formerror">{error}</div>}
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? 'Working…' : 'Continue'}
            </button>
            {(phoneOn || googleId) && (
              <button
                type="button"
                className="btn btn--ghost"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setError(null)
                  setStep('start')
                }}
              >
                {googleId && phoneOn ? 'Use Google or your mobile number' : googleId ? 'Use Google' : 'Use your mobile number'}
              </button>
            )}
          </form>
        </>
      )}

      {step === 'password' && (
        <>
          <p className="lead">Welcome back - {email} is a staff login. Sign in with your Dash password.</p>
          <form className="checkout-form" onSubmit={onPasswordSignIn} style={{ maxWidth: 420 }}>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                autoComplete="current-password"
              />
            </label>
            {error && <div className="formerror">{error}</div>}
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="hbtns" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={onForgot}>
                Forgot password
              </button>
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              style={{ marginTop: 8 }}
              onClick={() => {
                setStep('email')
                setPassword('')
                setPasswordOnly(false)
                setError(null)
              }}
            >
              Use a different email
            </button>
          </form>
        </>
      )}

      {step === 'link_sent' && (
        <>
          <p className="lead">Link sent. Check your email. No password needed.</p>
        </>
      )}

      {step === 'reset_sent' && (
        <>
          <p className="lead">
            {passwordOnly
              ? 'A link to set a new Dash password is on its way. Then sign in here with it.'
              : 'If that email can receive mail, a reset link is on its way.'}
          </p>
        </>
      )}

      {step === 'register' && (
        <>
          {/* Owner 2026-10-16: one way in. A new email joins Thrift+ at ecothrift.us/join (first and last name). */}
          <p className="lead">
            No account yet for {email}. Join Thrift+ to get one: it's free, and the same account works here and in the
            Thrift+ app.
          </p>
          <div className="checkout-form" style={{ maxWidth: 420 }}>
            <a className="btn btn--primary" href="/join">
              Join Thrift+
            </a>
            <button
              type="button"
              className="btn btn--ghost"
              style={{ marginTop: 8 }}
              onClick={() => {
                setStep('email')
                setError(null)
              }}
            >
              Use a different email
            </button>
          </div>
        </>
      )}

      {step === 'register_sent' && (
        <>
          <p className="lead">Check your email to confirm your account.</p>
        </>
      )}
    </div>
  )
}
