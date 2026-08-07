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
    register,
    requestReset,
    user,
  } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [regPassword, setRegPassword] = useState('')
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
      if (!lookup.has_account) {
        setStep('register')
        return
      }
      if (lookup.has_password) {
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

  const onEmailLinkInstead = async () => {
    setBusy(true)
    setError(null)
    try {
      await requestMagicLink(email.trim())
      setStep('link_sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send link')
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

  const onRegister = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await register({
        email: email.trim(),
        first_name: firstName.trim(),
        password: regPassword.trim() || undefined,
      })
      setStep('register_sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wrap">
      <div className="pagehead">
        <div className="eyebrow">Account</div>
        <h1>
          {step === 'register' || step === 'register_sent' ? 'Create your account' : 'Sign in'}
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
          <p className="lead">Welcome back - enter your password for {email}.</p>
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
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={onEmailLinkInstead}>
                Email me a link instead
              </button>
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
          <p className="lead">Link sent. Check your email.</p>
        </>
      )}

      {step === 'reset_sent' && (
        <>
          <p className="lead">If that email can receive mail, a reset link is on its way.</p>
        </>
      )}

      {step === 'register' && (
        <>
          <p className="lead">
            No account yet for {email}. Add your name - password is optional.
          </p>
          <form className="checkout-form" onSubmit={onRegister} style={{ maxWidth: 420 }}>
            <label className="field">
              <span>First name *</span>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={busy}
                autoComplete="given-name"
              />
            </label>
            <label className="field">
              <span>Password (optional)</span>
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                disabled={busy}
                minLength={6}
                autoComplete="new-password"
              />
            </label>
            {error && <div className="formerror">{error}</div>}
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
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
          </form>
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
