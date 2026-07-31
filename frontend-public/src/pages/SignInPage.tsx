import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { useOnlineSalesConfig } from '../onlineSalesConfig'
import { useSeo } from '../useSeo'

export default function SignInPage() {
  useSeo({ title: 'Sign in', noindex: true })
  const { config, loading: configLoading } = useOnlineSalesConfig()
  const { requestMagicLink, consumeMagicLink, user } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [debugToken, setDebugToken] = useState<string | null>(null)
  const tokenFromUrl = params.get('token')

  useEffect(() => {
    if (user) navigate('/account', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    if (!tokenFromUrl) return
    let active = true
    setBusy(true)
    setError(null)
    consumeMagicLink(tokenFromUrl)
      .then(() => {
        if (active) navigate('/account', { replace: true })
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
  }, [tokenFromUrl, consumeMagicLink, navigate])

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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setDebugToken(null)
    try {
      const data = await requestMagicLink(email.trim())
      setSent(true)
      if (data.debug_token) setDebugToken(data.debug_token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send link')
    } finally {
      setBusy(false)
    }
  }

  // Token consume failure: show once below the heading (not also in the form).
  if (tokenFromUrl && error && !sent) {
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
          Request a new link
        </Link>
      </div>
    )
  }

  return (
    <div className="wrap">
      <div className="pagehead">
        <div className="eyebrow">Account</div>
        <h1>Sign in</h1>
      </div>
      {sent ? (
        <>
          <p className="lead">Check your email for a sign-in link. It expires soon and works once.</p>
          {debugToken && (
            <div className="pickupnote" style={{ marginTop: 16, marginBottom: 16 }}>
              <strong>Dev only:</strong> magic-link token returned because DEBUG is on.
              <div style={{ marginTop: 8 }}>
                <Link className="btn btn--primary" to={`/account/sign-in?token=${encodeURIComponent(debugToken)}`}>
                  Continue with debug link
                </Link>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="lead">Enter your email and we&rsquo;ll send a one-time sign-in link.</p>
          <form className="checkout-form" onSubmit={onSubmit} style={{ maxWidth: 420 }}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
            {error && <div className="formerror">{error}</div>}
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? 'Working…' : 'Email me a link'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
