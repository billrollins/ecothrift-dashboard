import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { useOnlineSalesConfig } from '../onlineSalesConfig'
import { useSeo } from '../useSeo'

type Step = 'email' | 'password' | 'link_sent' | 'register' | 'register_sent' | 'reset_sent'

export default function SignInPage() {
  useSeo({ title: 'Sign in', noindex: true })
  const { config, loading: configLoading } = useOnlineSalesConfig()
  const {
    requestMagicLink,
    consumeToken,
    signInWithPassword,
    lookupEmail,
    requestReset,
    user,
  } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
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

      {step === 'email' && (
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
