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

  useEffect(() => {
    if (user) navigate('/account', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    const token = params.get('token')
    if (!token) return
    let active = true
    setBusy(true)
    consumeMagicLink(token)
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
  }, [params, consumeMagicLink, navigate])

  if (configLoading) return null
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
    try {
      await requestMagicLink(email.trim())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wrap">
      <div className="pagehead">
        <div className="eyebrow">Account</div>
        <h1>Sign in</h1>
      </div>
      {sent ? (
        <p className="lead">Check your email for a sign-in link. It expires soon and works once.</p>
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
      {error && sent === false && params.get('token') && (
        <p className="lead" style={{ color: '#c0392b' }}>
          {error}
        </p>
      )}
    </div>
  )
}
